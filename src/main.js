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
import { addProgress, deleteEntry, resolveStatusDefs } from './tracking.js';
import { isContextAlive, isContextLost, loadState, mutateTracking, saveState, setAllowlist, toggleAllowlist, toggleAttention, togglePinned } from './store.js';

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
  onTogglePin: guarded(onTogglePin),
  onToggleAttention: guarded(onToggleAttention),
  onAddProgress: guarded(onAddProgress),
  onDeleteEntry: guarded(onDeleteEntry),
  onClearCase: guarded(onClearCase),
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
  const { allowlist, baseline, pinned, attention, tracking, statusDefs } = await loadState();

  try {
    const built = buildInbox(allGroups, allowlist, baseline, pinned, attention);
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
    // The flagged set, so the Need Attention tab can include a flagged group that
    // has dropped out of the server list (it lives on in `missing`).
    attention,
    // A local overlay keyed by group_id, passed alongside the rows rather than
    // baked into them, so chips also resolve on missing/orphan rows and survive
    // a shape error (tracking never depended on the API response).
    tracking,
    statusDefs: resolveStatusDefs(statusDefs),
    status,
    message,
    lastSuccess,
  });
}

// The status set is edited on the options page — a different context. Re-draw so
// the open panel reflects a new or renamed status without waiting for a poll.
if (globalThis.chrome?.storage?.onChanged) {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.statusDefs) guarded(draw)();
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
  const next = await toggleAllowlist(groupId);
  // A pin or an attention flag only means something for a group you still
  // watch; dropping the pick drops both with it, so a re-picked group does not
  // come back pinned or flagged. (Its case log is left intact, in case the
  // un-pick was a mis-click.)
  if (!next.includes(groupId)) {
    const { pinned, attention } = await loadState();
    const patch = {};
    if (pinned.includes(groupId)) patch.pinned = pinned.filter((id) => id !== groupId);
    if (attention.includes(groupId)) patch.attention = attention.filter((id) => id !== groupId);
    if (Object.keys(patch).length) await saveState(patch);
  }
  await draw();
}

async function onTogglePin(groupId) {
  await togglePinned(groupId);
  await draw();
}

async function onToggleAttention(groupId) {
  await toggleAttention(groupId);
  await draw();
}

/**
 * Adds one progress step to a case's log. The read-modify-write happens
 * atomically inside the store's write queue, so overlapping edits can't clobber
 * each other or an unrelated case. `input` carries { status, link, note }; the
 * id is minted here so the pure appender stays deterministic.
 */
async function onAddProgress(groupId, input) {
  const id = `e_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  await mutateTracking(groupId, (prev) => addProgress(prev, { ...input, id }, Date.now()));
  await draw();
}

/** Removes one step; a log emptied of its last step drops the case entirely. */
async function onDeleteEntry(groupId, entryId) {
  await mutateTracking(groupId, (prev) => {
    const next = deleteEntry(prev, entryId);
    return next.entries.length ? next : null;
  });
  await draw();
}

async function onClearCase(groupId) {
  await mutateTracking(groupId, () => null);
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
