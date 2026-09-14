/**
 * Bootstrap and poll loop.
 *
 * The full group list, including message previews, lives in this module's
 * memory for exactly as long as the tab is open. What reaches disk is only
 * the allowlist and the per-group baseline counts.
 */

console.info(`[WAG Inbox] v${chrome.runtime.getManifest().version} loading`);

import { DEFAULT_POLL_MS, fetchChats, nextBackoff } from './api.js';
import { buildInbox, markRead } from './diff.js';
import { openInApp } from './navigate.js';
import { createPanel } from './panel.js';
import { parseImport, resolveImport, serialize } from './portable.js';
import { isContextAlive, isContextLost, loadState, saveState, setAllowlist, toggleAllowlist } from './store.js';

/** In-memory only. Never written to storage. */
let allGroups = [];

/**
 * The last render that came from a response we understood. A shape change
 * should tell you the list is stale, not replace it with nothing.
 */
let lastGood = { groups: [], rows: [], missing: [], totalUnread: 0 };

/** Valid only while allGroups still holds the body it describes, so never stored. */
let etag = null;
let pollMs = DEFAULT_POLL_MS;
let currentDelay = DEFAULT_POLL_MS;
let status = 'ok';
let message = null;
let lastSuccess = null;
let timer = null;

/** What the last checked import would do. Held until you choose how to apply it. */
let pendingImport = null;

/**
 * Reloading the extension severs this page from it. Nothing can be done from
 * here except say so, so every entry point funnels failures into one place and
 * the loop stops rather than throwing on a timer.
 */
let disconnected = false;

function disconnect() {
  if (disconnected) return;
  disconnected = true;
  clearTimeout(timer);
  status = 'disconnected';
  panel.renderDisconnected();
}

/** Wraps an entry point so a lost context ends the session instead of escaping. */
function guarded(fn) {
  return async (...args) => {
    if (disconnected) return undefined;
    try {
      return await fn(...args);
    } catch (error) {
      if (!isContextLost(error)) throw error;
      disconnect();
      return undefined;
    }
  };
}

const panel = createPanel({
  onOpenGroup: guarded(onOpenGroup),
  onTogglePick: guarded(onTogglePick),
  onExport: guarded(onExport),
  onImportText: guarded(onImportText),
  onApplyImport: guarded(onApplyImport),
  onOpenSettings,
});

// A call already in flight when the context dies rejects after our checks, so
// this catches what no guard could have seen coming.
window.addEventListener('unhandledrejection', (event) => {
  if (!isContextLost(event.reason)) return;
  event.preventDefault();
  disconnect();
});

async function draw() {
  const { allowlist, baseline } = await loadState();

  try {
    const built = buildInbox(allGroups, allowlist, baseline);
    lastGood = { groups: allGroups, ...built };
  } catch (error) {
    // A shape change must not blank the panel. Fall back to the last list we
    // understood and say plainly that it is no longer being updated.
    status = 'shape';
    message = error.message;
  }

  panel.render({
    ...lastGood,
    allGroups: lastGood.groups,
    allowlist,
    status,
    message,
    lastSuccess,
  });
}

async function poll() {
  // Nothing below can work without the extension behind us, and retrying
  // cannot bring it back. Say so once and stop.
  if (!isContextAlive()) return disconnect();

  const { endpoint } = await loadState();
  const result = await fetchChats(endpoint, etag);

  switch (result.outcome) {
    case 'unconfigured':
      // Nowhere to ask. Say so and wait for the options page.
      status = 'unconfigured';
      await draw();
      return;

    case 'ok':
      allGroups = result.groups;
      etag = result.etag;
      status = 'ok';
      message = null;
      lastSuccess = Date.now();
      currentDelay = pollMs;
      break;

    case 'unchanged':
      status = 'ok';
      message = null;
      lastSuccess = Date.now();
      currentDelay = pollMs;
      break;

    case 'expired':
      // Retrying cannot fix an expired cookie; only a reload can.
      status = 'expired';
      message = result.reason;
      await draw();
      return;

    default:
      status = 'error';
      message = result.reason;
      currentDelay = nextBackoff(currentDelay);
  }

  await draw();
  schedule();
}

function schedule() {
  clearTimeout(timer);
  timer = setTimeout(guarded(poll), currentDelay);
}

async function onOpenGroup(group) {
  const { baseline } = await loadState();
  await saveState({ baseline: markRead(baseline, group) });
  await draw();

  const { ok } = await openInApp(group);
  if (!ok) {
    panel.toast(`Couldn't find "${group.group_name}" in the list. Name copied to clipboard.`);
  }
}

function onOpenSettings() {
  if (!isContextAlive()) return disconnect();
  chrome.runtime.sendMessage({ type: 'openOptions' });
}

async function onTogglePick(groupId) {
  await toggleAllowlist(groupId);
  await draw();
}

/**
 * Hands the picks over as a file. Group names are in it, so it is an internal
 * document like any other export from this app.
 */
async function onExport() {
  const { allowlist } = await loadState();
  const file = serialize(allGroups, allowlist);
  const stamp = new Date().toISOString().slice(0, 10);

  const url = URL.createObjectURL(
    new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' }),
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = `wag-inbox-groups-${stamp}.json`;
  link.click();
  URL.revokeObjectURL(url);

  panel.toast(`Exported ${file.groups.length} groups.`);
}

/** Works out what an import would do. Changes nothing yet. */
async function onImportText(text) {
  const { allowlist } = await loadState();
  pendingImport = resolveImport(parseImport(text), allGroups, allowlist);
  return pendingImport;
}

/** @returns {Promise<number>} how many groups are picked afterwards */
async function onApplyImport(mode) {
  if (!pendingImport) return 0;

  const { allowlist } = await loadState();
  const imported = [...pendingImport.matched, ...pendingImport.alreadyPicked];
  const next = mode === 'replace'
    ? imported
    : [...new Set([...allowlist, ...pendingImport.matched])];

  await setAllowlist(next);
  pendingImport = null;
  await draw();
  return next.length;
}

async function start() {
  const stored = await loadState();
  pollMs = stored.pollMs;
  currentDelay = pollMs;

  await draw();
  await poll();
}

console.info(`[WAG Inbox] v${chrome.runtime.getManifest().version} panel mounted`);

guarded(start)();
