// src/background.js
var SCRIPT_ID = "wag-inbox-panel";
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
      // The bundle, not a source file. A content script may not fetch a second
      // file at runtime: a dynamic import is subject to the host page's CSP,
      // and a page with script-src 'self' blocks chrome-extension: outright.
      js: ["dist/content.js"],
      runAt: "document_idle",
      persistAcrossSessions: true
    }
  ]);
}
var HANDLERS = {
  /** Called by the options page once Chrome has granted the origin. */
  async register({ endpoint, pagePattern }) {
    await registerPanel(pagePattern);
    await chrome.storage.local.set({ endpoint, pagePattern });
    return { ok: true };
  },
  /** Forgetting the site entirely: no registration, no settings, no access. */
  async forget() {
    const { pagePattern } = await chrome.storage.local.get("pagePattern");
    await unregisterPanel();
    await chrome.storage.local.remove(["endpoint", "pagePattern"]);
    if (pagePattern) {
      await chrome.permissions.remove({ origins: [pagePattern] });
    }
    return { ok: true };
  },
  async openOptions() {
    await chrome.runtime.openOptionsPage();
    return { ok: true };
  }
};
chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  const handler = HANDLERS[request?.type];
  if (!handler) return false;
  handler(request).then(sendResponse).catch((error) => sendResponse({ ok: false, error: error.message }));
  return true;
});
async function restoreRegistration() {
  const { pagePattern } = await chrome.storage.local.get("pagePattern");
  if (!pagePattern) return;
  const allowed = await chrome.permissions.contains({ origins: [pagePattern] });
  if (!allowed) {
    await chrome.storage.local.remove(["endpoint", "pagePattern"]);
    return;
  }
  await registerPanel(pagePattern);
}
chrome.runtime.onInstalled.addListener(restoreRegistration);
chrome.runtime.onStartup.addListener(restoreRegistration);
chrome.action.onClicked.addListener(() => chrome.runtime.openOptionsPage());
chrome.permissions.onRemoved.addListener(async () => {
  const { pagePattern } = await chrome.storage.local.get("pagePattern");
  if (!pagePattern) return;
  const stillAllowed = await chrome.permissions.contains({ origins: [pagePattern] });
  if (!stillAllowed) {
    await unregisterPanel();
    await chrome.storage.local.remove(["endpoint", "pagePattern"]);
  }
});
