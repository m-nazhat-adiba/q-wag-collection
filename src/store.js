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
  /** A subset of the allowlist, floated to the top of the inbox. */
  pinned: [],
  /** A subset of the allowlist, surfaced in the Need Attention tab. Case tracking lives there. */
  attention: [],
  /** Per-group escalation record, keyed by group_id (a map, like baseline). */
  tracking: {},
  /** The user's status set, edited on the options page. Empty = use the built-in set. */
  statusDefs: [],
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

/** Thrown instead of letting a chrome API blow up with its own wording. */
export class ContextLostError extends Error {
  constructor() {
    super('The extension was reloaded, so this page lost touch with it.');
    this.name = 'ContextLostError';
  }
}

/**
 * True for both our own error and Chrome's, since a call already in flight
 * when the context dies rejects with Chrome's wording before we can check.
 */
export function isContextLost(error) {
  return error instanceof ContextLostError
    || /extension context invalidated/i.test(error?.message ?? '');
}

function assertContext() {
  if (!isContextAlive()) throw new ContextLostError();
}

export async function loadState() {
  assertContext();
  const stored = await chrome.storage.local.get(Object.keys(DEFAULTS));
  return { ...DEFAULTS, ...stored };
}

export async function saveState(patch) {
  assertContext();
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

export async function togglePinned(groupId) {
  const { pinned } = await loadState();
  const next = pinned.includes(groupId)
    ? pinned.filter((id) => id !== groupId)
    : [...pinned, groupId];
  await saveState({ pinned: next });
  return next;
}

/** Flags (or unflags) a group as needing attention — the Need Attention tab's contents. */
export async function toggleAttention(groupId) {
  const { attention } = await loadState();
  const next = attention.includes(groupId)
    ? attention.filter((id) => id !== groupId)
    : [...attention, groupId];
  await saveState({ attention: next });
  return next;
}

/**
 * A single-writer queue. The toggle helpers above read a snapshot and then
 * await a write, so two edits firing close together can each read the old value
 * and the second clobbers the first. Case edits happen far more often (typing,
 * status changes) and the whole `tracking` map is one storage key, so a lost
 * write there loses an unrelated case. Every case mutation runs through this
 * chain and re-reads the current map at execution time, making read-modify-write
 * serial and clobber-free within this page.
 */
let writeChain = Promise.resolve();

function enqueue(task) {
  const run = writeChain.then(task, task); // run regardless of the prior outcome
  writeChain = run.catch(() => {}); // a failure must not wedge the queue
  return run;
}

/**
 * Reads the current record for a group, lets `updater` return the next record
 * (or null to delete it), and writes back only the `tracking` key — so a
 * concurrent poll or a pin/baseline write can never be clobbered by this.
 *
 * @param {(record: object|null) => object|null} updater
 * @returns {Promise<object|null>} the new record
 */
export function mutateTracking(groupId, updater) {
  return enqueue(async () => {
    assertContext();
    const { tracking } = await loadState();
    const nextRecord = updater(tracking[groupId] ?? null);
    const map = { ...tracking };
    if (nextRecord == null) delete map[groupId];
    else map[groupId] = nextRecord;
    await saveState({ tracking: map });
    return nextRecord;
  });
}
