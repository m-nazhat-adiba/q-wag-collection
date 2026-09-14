/**
 * Service worker. Owns the one thing a content script cannot do: deciding at
 * runtime which site this extension runs on.
 *
 * The manifest names no host. The options page asks Chrome for access to the
 * origin you type, and once you approve, this worker registers the panel for
 * that site. Revoke the permission and the registration goes with it.
 */

const SCRIPT_ID = 'wag-inbox-panel';

async function unregisterPanel() {
  const existing = await chrome.scripting.getRegisteredContentScripts({ ids: [SCRIPT_ID] });
  if (existing.length) {
    await chrome.scripting.unregisterContentScripts({ ids: [SCRIPT_ID] });
  }
}

async function registerPanel(pagePattern) {
  await unregisterPanel();
  await chrome.scripting.registerContentScripts([
    {
      id: SCRIPT_ID,
      matches: [pagePattern],
      js: ['src/content.js'],
      runAt: 'document_idle',
      persistAcrossSessions: true,
    },
  ]);
}

const HANDLERS = {
  /** Called by the options page once Chrome has granted the origin. */
  async register({ endpoint, pagePattern }) {
    await registerPanel(pagePattern);
    await chrome.storage.local.set({ endpoint, pagePattern });
    return { ok: true };
  },

  /** Forgetting the site entirely: no registration, no settings, no access. */
  async forget() {
    const { pagePattern } = await chrome.storage.local.get('pagePattern');
    await unregisterPanel();
    await chrome.storage.local.remove(['endpoint', 'pagePattern']);
    if (pagePattern) {
      await chrome.permissions.remove({ origins: [pagePattern] });
    }
    return { ok: true };
  },

  async openOptions() {
    await chrome.runtime.openOptionsPage();
    return { ok: true };
  },
};

chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  const handler = HANDLERS[request?.type];
  if (!handler) return false;

  handler(request)
    .then(sendResponse)
    .catch((error) => sendResponse({ ok: false, error: error.message }));

  return true; // response is async
});

chrome.action.onClicked.addListener(() => chrome.runtime.openOptionsPage());

/** If access is revoked from chrome://extensions, stop injecting into the site. */
chrome.permissions.onRemoved.addListener(async () => {
  const { pagePattern } = await chrome.storage.local.get('pagePattern');
  if (!pagePattern) return;

  const stillAllowed = await chrome.permissions.contains({ origins: [pagePattern] });
  if (!stillAllowed) {
    await unregisterPanel();
    await chrome.storage.local.remove(['endpoint', 'pagePattern']);
  }
});
