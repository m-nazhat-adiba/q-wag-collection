import { describe, expect, test } from 'vitest';
import chats from './fixtures/chats.json' with { type: 'json' };
import {
  filterAllowlist,
  computeUnread,
  sortByRecent,
  markRead,
  buildInbox,
} from '../src/diff.js';

const NORTHWIND = '120363000000000001@g.us';
const ACME = '120363000000000002@g.us';
const GLOBEX = '120363000000000003@g.us';

const byId = (id) => chats.find((c) => c.group_id === id);

describe('filterAllowlist', () => {
  test('keeps only groups whose id is in the allowlist', () => {
    const result = filterAllowlist(chats, [NORTHWIND, ACME]);
    expect(result.map((g) => g.group_id)).toEqual([NORTHWIND, ACME]);
  });

  test('returns nothing when the allowlist is empty', () => {
    expect(filterAllowlist(chats, [])).toEqual([]);
  });

  test('ignores allowlisted ids that are absent from the response', () => {
    const result = filterAllowlist(chats, [NORTHWIND, 'not-a-real-group@g.us']);
    expect(result.map((g) => g.group_id)).toEqual([NORTHWIND]);
  });
});

describe('computeUnread', () => {
  test('uses new_count verbatim when the group has no baseline yet', () => {
    expect(computeUnread(byId(ACME), {})).toBe(674);
  });

  test('reports zero when the baseline matches the current count', () => {
    const baseline = { [ACME]: { count: 674, ts: 1789351233000 } };
    expect(computeUnread(byId(ACME), baseline)).toBe(0);
  });

  test('reports the difference when the count has grown past the baseline', () => {
    const baseline = { [ACME]: { count: 670, ts: 1789351000000 } };
    expect(computeUnread(byId(ACME), baseline)).toBe(4);
  });

  test('clamps to zero when the baseline is ahead of the server count', () => {
    const baseline = { [ACME]: { count: 700, ts: 1789351233000 } };
    expect(computeUnread(byId(ACME), baseline)).toBe(0);
  });
});

describe('sortByRecent', () => {
  test('places groups with unread messages ahead of groups without', () => {
    const items = [
      { group_id: 'a', unread: 0, last_ts: 9000 },
      { group_id: 'b', unread: 3, last_ts: 1000 },
    ];
    expect(sortByRecent(items).map((i) => i.group_id)).toEqual(['b', 'a']);
  });

  test('orders by last_ts descending within the same unread state', () => {
    const items = [
      { group_id: 'older', unread: 2, last_ts: 1000 },
      { group_id: 'newer', unread: 5, last_ts: 9000 },
    ];
    expect(sortByRecent(items).map((i) => i.group_id)).toEqual(['newer', 'older']);
  });

  test('floats a pinned group above an unread one', () => {
    const items = [
      { group_id: 'unread', unread: 9, last_ts: 9000, pinned: false },
      { group_id: 'pinned', unread: 0, last_ts: 1000, pinned: true },
    ];
    expect(sortByRecent(items).map((i) => i.group_id)).toEqual(['pinned', 'unread']);
  });

  test('does not mutate the array it was given', () => {
    const items = [
      { group_id: 'a', unread: 0, last_ts: 1 },
      { group_id: 'b', unread: 1, last_ts: 2 },
    ];
    sortByRecent(items);
    expect(items.map((i) => i.group_id)).toEqual(['a', 'b']);
  });
});

describe('markRead', () => {
  test('records the current count and timestamp for that group', () => {
    const next = markRead({}, byId(ACME));
    expect(next[ACME]).toEqual({ count: 674, ts: 1789351233000 });
  });

  test('leaves other groups untouched', () => {
    const before = { [NORTHWIND]: { count: 800, ts: 1 } };
    const next = markRead(before, byId(ACME));
    expect(next[NORTHWIND]).toEqual({ count: 800, ts: 1 });
  });

  test('does not mutate the baseline it was given', () => {
    const before = {};
    markRead(before, byId(ACME));
    expect(before).toEqual({});
  });
});

describe('buildInbox', () => {
  test('returns allowlisted groups, unread-annotated and sorted', () => {
    const baseline = { [NORTHWIND]: { count: 814, ts: 1789351000000 } };
    const { rows } = buildInbox(chats, [NORTHWIND, ACME], baseline);

    expect(rows.map((r) => [r.group_id, r.unread])).toEqual([
      [ACME, 674],
      [NORTHWIND, 0],
    ]);
  });

  test('reports allowlisted ids the server no longer returns', () => {
    const { missing } = buildInbox(chats, [NORTHWIND, 'gone@g.us'], {});
    expect(missing).toEqual(['gone@g.us']);
  });

  test('totals unread across the allowlisted groups only', () => {
    const { totalUnread } = buildInbox(chats, [ACME], {});
    expect(totalUnread).toBe(674);
  });

  test('rejects a response that is not an array', () => {
    expect(() => buildInbox({ error: 'nope' }, [], {})).toThrow(/shape/i);
  });

  test('rejects a response whose entries lack new_count', () => {
    const malformed = [{ group_id: 'x@g.us', group_name: 'X', last_ts: 1 }];
    expect(() => buildInbox(malformed, ['x@g.us'], {})).toThrow(/shape/i);
  });

  test('floats a pinned group to the top and flags it, even when it is oldest', () => {
    // GLOBEX is the oldest in the fixture, yet pinning lifts it above the rest.
    const { rows } = buildInbox(chats, [NORTHWIND, ACME, GLOBEX], {}, [GLOBEX]);
    expect(rows[0].group_id).toBe(GLOBEX);
    expect(rows[0].pinned).toBe(true);
    expect(rows.filter((r) => r.pinned)).toHaveLength(1);
  });

  test('orders several pinned groups by recency among themselves', () => {
    const { rows } = buildInbox(chats, [NORTHWIND, ACME, GLOBEX], {}, [NORTHWIND, GLOBEX]);
    expect(rows.slice(0, 2).map((r) => r.group_id)).toEqual([NORTHWIND, GLOBEX]);
    // ACME is the newest overall but unpinned, so it drops below both pins.
    expect(rows[2].group_id).toBe(ACME);
  });

  test('treats every row as unpinned when no pinned list is given', () => {
    const { rows } = buildInbox(chats, [ACME], {});
    expect(rows.every((r) => r.pinned === false)).toBe(true);
  });

  test('flags groups marked as needing attention', () => {
    const { rows } = buildInbox(chats, [NORTHWIND, ACME, GLOBEX], {}, [], [ACME]);
    expect(rows.find((r) => r.group_id === ACME).attention).toBe(true);
    expect(rows.filter((r) => r.attention)).toHaveLength(1);
  });

  test('treats every row as un-flagged when no attention list is given', () => {
    const { rows } = buildInbox(chats, [ACME], {});
    expect(rows.every((r) => r.attention === false)).toBe(true);
  });

  test('pin and attention are independent flags on the same group', () => {
    // ACME is pinned but not flagged; GLOBEX is flagged but not pinned.
    const { rows } = buildInbox(chats, [NORTHWIND, ACME, GLOBEX], {}, [ACME], [GLOBEX]);
    const acme = rows.find((r) => r.group_id === ACME);
    const globex = rows.find((r) => r.group_id === GLOBEX);
    expect([acme.pinned, acme.attention]).toEqual([true, false]);
    expect([globex.pinned, globex.attention]).toEqual([false, true]);
  });
});
