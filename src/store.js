/**
 * Everything the extension remembers. chrome.storage.local only — never
 * chrome.storage.sync, which would copy customer group names to Google.
 *
 * Deliberately absent: last_body, last_sender, and anything else derived from
 * message content. Those live in memory for one render and are then gone.
 *
 * The ETag is absent for the same reason. It describes a response body we stop
 * holding the moment the tab reloads, so a stored one would earn a 304 against
 * an empty list and the panel would show nothing while reporting success.
 */

import { DEFAULT_POLL_MS } from './api.js';

const DEFAULTS = {
  /** Where the chat list comes from. Set on the options page, empty until then. */
  endpoint: '',
  pagePattern: '',
  allowlist: [],
  baseline: {},
  pollMs: DEFAULT_POLL_MS,
};

/**
 * Whether this content script still has a live extension behind it.
 *
 * Reloading or updating an unpacked extension tears down its context while
 * scripts already injected into open pages keep running. Every chrome call
 * then throws "Extension context invalidated". chrome.runtime.id is the
 * cheapest reliable tell: it is undefined the moment the link is severed.
 */
export function isContextAlive() {
  return Boolean(globalThis.chrome?.runtime?.id);
}

export async function loadState() {
  const stored = await chrome.storage.local.get(Object.keys(DEFAULTS));
  return { ...DEFAULTS, ...stored };
}

export async function saveState(patch) {
  await chrome.storage.local.set(patch);
}

export async function setAllowlist(ids) {
  await saveState({ allowlist: ids });
  return ids;
}

export async function toggleAllowlist(groupId) {
  const { allowlist } = await loadState();
  const next = allowlist.includes(groupId)
    ? allowlist.filter((id) => id !== groupId)
    : [...allowlist, groupId];
  await saveState({ allowlist: next });
  return next;
}
