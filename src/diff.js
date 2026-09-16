/**
 * Pure inbox logic. No DOM, no chrome APIs, no network — everything here is
 * decided from the API response plus locally stored state, which is what makes
 * it the only part of the extension worth unit testing.
 */

/** Fields every entry in the chat-list response must carry for the inbox to mean anything. */
const REQUIRED_FIELDS = ['group_id', 'group_name', 'new_count', 'last_ts'];

class ShapeError extends Error {
  constructor(message) {
    super(`Unexpected API shape: ${message}`);
    this.name = 'ShapeError';
  }
}

function assertShape(groups) {
  if (!Array.isArray(groups)) {
    throw new ShapeError('expected an array of groups');
  }
  for (const group of groups) {
    for (const field of REQUIRED_FIELDS) {
      if (group?.[field] === undefined) {
        throw new ShapeError(`entry is missing "${field}"`);
      }
    }
  }
}

export function filterAllowlist(groups, allowlist) {
  const wanted = new Set(allowlist);
  return groups.filter((group) => wanted.has(group.group_id));
}

/**
 * Unread since you last opened the group.
 *
 * With no baseline we have nothing to subtract, so new_count stands as-is —
 * on first run every group reads as fully unread, which then settles as you
 * click through them. A baseline ahead of the server (group cleared upstream,
 * or new_count turns out to be a live unread counter rather than a running
 * total) clamps to zero rather than showing a negative badge.
 */
export function computeUnread(group, baseline) {
  const seen = baseline[group.group_id];
  if (!seen) return group.new_count;
  return Math.max(0, group.new_count - seen.count);
}

export function sortByRecent(items) {
  return [...items].sort((a, b) => {
    // Pinned groups sit above everything, then unread above read, then newest
    // first. Items with no `pinned` flag sort exactly as they did before.
    const pinnedRank = Boolean(b.pinned) - Boolean(a.pinned);
    if (pinnedRank !== 0) return pinnedRank;
    const unreadRank = (b.unread > 0) - (a.unread > 0);
    if (unreadRank !== 0) return unreadRank;
    return b.last_ts - a.last_ts;
  });
}

export function markRead(baseline, group) {
  return {
    ...baseline,
    [group.group_id]: { count: group.new_count, ts: group.last_ts },
  };
}

/**
 * The one call content.js makes per poll: response + your settings in,
 * everything the panel needs out.
 */
export function buildInbox(groups, allowlist, baseline, pinned = [], attention = []) {
  assertShape(groups);

  const isPinned = new Set(pinned);
  const needsAttention = new Set(attention);
  const mine = filterAllowlist(groups, allowlist);
  const rows = sortByRecent(
    mine.map((group) => ({
      ...group,
      unread: computeUnread(group, baseline),
      pinned: isPinned.has(group.group_id),
      // A manual flag, independent of pin: it fills the Need Attention tab, the
      // only place case tracking is reachable.
      attention: needsAttention.has(group.group_id),
    })),
  );

  const present = new Set(mine.map((group) => group.group_id));
  const missing = allowlist.filter((id) => !present.has(id));
  const totalUnread = rows.reduce((sum, row) => sum + row.unread, 0);

  return { rows, missing, totalUnread };
}
