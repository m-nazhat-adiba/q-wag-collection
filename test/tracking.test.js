import { describe, expect, test } from 'vitest';
import {
  DEFAULT_STATUS_DEFS,
  MAX_ENTRIES,
  MAX_NOTE_LEN,
  NEUTRAL_COLOR,
  addProgress,
  currentStatus,
  deleteEntry,
  getChip,
  isEmpty,
  isValidHex,
  makeRecord,
  normalizeRecord,
  parseStatusDefs,
  resolveStatusDefs,
  sanitizeUrl,
  serializeStatusDefs,
  statusMeta,
} from '../src/tracking.js';

const NOW = 1_700_000_000_000;
const IN_PROGRESS = 'st_in_progress';
const DONE = 'st_done';

const step = (over = {}) => ({ id: 'e1', status: IN_PROGRESS, link: '', note: '', ...over });

describe('makeRecord / isEmpty', () => {
  test('a fresh record is an empty entry log', () => {
    expect(makeRecord()).toEqual({ v: 2, entries: [] });
    expect(isEmpty(makeRecord())).toBe(true);
    expect(isEmpty(null)).toBe(true);
  });
});

describe('addProgress', () => {
  test('creates a record from nothing and appends the first step', () => {
    const rec = addProgress(null, step({ id: 'a', note: 'asked soluport' }), NOW);
    expect(rec.entries).toEqual([
      { id: 'a', at: NOW, status: IN_PROGRESS, link: null, note: 'asked soluport' },
    ]);
  });

  test('stacks steps in order, each with its own timestamp', () => {
    const first = addProgress(null, step({ id: 'a' }), NOW);
    const second = addProgress(first, step({ id: 'b', status: DONE }), NOW + 1000);
    expect(second.entries.map((e) => [e.id, e.status, e.at])).toEqual([
      ['a', IN_PROGRESS, NOW],
      ['b', DONE, NOW + 1000],
    ]);
  });

  test('sanitizes the link and drops junk to null', () => {
    const ok = addProgress(null, step({ id: 'a', link: 'https://x.slack.com/t' }), NOW);
    expect(ok.entries[0].link).toBe('https://x.slack.com/t');
    const bad = addProgress(null, step({ id: 'b', link: 'javascript:alert(1)' }), NOW);
    expect(bad.entries[0].link).toBeNull();
  });

  test('clamps an over-long note', () => {
    const rec = addProgress(null, step({ id: 'a', note: 'x'.repeat(MAX_NOTE_LEN + 50) }), NOW);
    expect(rec.entries[0].note).toHaveLength(MAX_NOTE_LEN);
  });

  test('a step may carry no status (note-only update)', () => {
    const rec = addProgress(null, step({ id: 'a', status: null, note: 'ping' }), NOW);
    expect(rec.entries[0].status).toBeNull();
  });

  test('caps the log at the newest MAX_ENTRIES', () => {
    let rec = null;
    for (let i = 0; i < MAX_ENTRIES + 10; i += 1) {
      rec = addProgress(rec, step({ id: `e${i}` }), NOW + i);
    }
    expect(rec.entries).toHaveLength(MAX_ENTRIES);
    expect(rec.entries.at(-1).id).toBe(`e${MAX_ENTRIES + 9}`);
  });

  test('does not mutate the record it was given', () => {
    const first = addProgress(null, step({ id: 'a' }), NOW);
    const before = structuredClone(first);
    addProgress(first, step({ id: 'b' }), NOW + 1);
    expect(first).toEqual(before);
  });
});

describe('deleteEntry', () => {
  test('removes the targeted step and leaves the rest', () => {
    let rec = addProgress(null, step({ id: 'a' }), NOW);
    rec = addProgress(rec, step({ id: 'b', status: DONE }), NOW + 1);
    const after = deleteEntry(rec, 'a');
    expect(after.entries.map((e) => e.id)).toEqual(['b']);
  });

  test('deleting an unknown id is a no-op', () => {
    const rec = addProgress(null, step({ id: 'a' }), NOW);
    expect(deleteEntry(rec, 'zzz').entries).toHaveLength(1);
  });
});

describe('currentStatus', () => {
  test('is the status of the most recent step that has one', () => {
    let rec = addProgress(null, step({ id: 'a', status: IN_PROGRESS }), NOW);
    rec = addProgress(rec, step({ id: 'b', status: DONE }), NOW + 1);
    expect(currentStatus(rec)).toBe(DONE);
  });

  test('a trailing note-only step does not blank the status', () => {
    let rec = addProgress(null, step({ id: 'a', status: IN_PROGRESS }), NOW);
    rec = addProgress(rec, step({ id: 'b', status: null, note: 'ping' }), NOW + 1);
    expect(currentStatus(rec)).toBe(IN_PROGRESS);
  });

  test('is null when no step carries a status', () => {
    const rec = addProgress(null, step({ id: 'a', status: null, note: 'x' }), NOW);
    expect(currentStatus(rec)).toBeNull();
  });
});

describe('normalizeRecord (migration)', () => {
  test('passes an entry log through unchanged', () => {
    const rec = addProgress(null, step({ id: 'a' }), NOW);
    expect(normalizeRecord(rec).entries).toHaveLength(1);
  });

  test('migrates a legacy single-record into one entry', () => {
    const legacy = { v: 1, status: IN_PROGRESS, links: ['https://x.slack.com/t'], note: 'hi', last_edited: NOW };
    const norm = normalizeRecord(legacy);
    expect(norm.entries).toEqual([
      { id: 'legacy', at: NOW, status: IN_PROGRESS, link: 'https://x.slack.com/t', note: 'hi' },
    ]);
  });

  test('an empty legacy record becomes an empty log', () => {
    expect(normalizeRecord({ v: 1, status: null, links: [], note: '' }).entries).toEqual([]);
  });
});

describe('sanitizeUrl', () => {
  test('accepts http, https and slack schemes', () => {
    expect(sanitizeUrl('https://a.slack.com/archives/C0/p1')).toBe('https://a.slack.com/archives/C0/p1');
    expect(sanitizeUrl('slack://channel?team=T1&id=C1')).toBe('slack://channel?team=T1&id=C1');
  });

  test('refuses dangerous or malformed values', () => {
    for (const bad of ['javascript:alert(1)', 'data:text/html,x', '', '   ', 'just words']) {
      expect(sanitizeUrl(bad)).toBeNull();
    }
  });
});

describe('statusMeta', () => {
  test('resolves a known id to its label and colour', () => {
    expect(statusMeta(IN_PROGRESS, DEFAULT_STATUS_DEFS)).toMatchObject({ label: 'In progress', color: '#2F80ED' });
  });

  test('falls back for an unknown id', () => {
    expect(statusMeta('st_gone', DEFAULT_STATUS_DEFS)).toMatchObject({ label: 'Unknown', color: NEUTRAL_COLOR, known: false });
  });
});

describe('getChip', () => {
  test('is null for an empty or missing log', () => {
    expect(getChip(null, DEFAULT_STATUS_DEFS)).toBeNull();
    expect(getChip(makeRecord(), DEFAULT_STATUS_DEFS)).toBeNull();
  });

  test('reflects the latest status and flags terminal ones', () => {
    let rec = addProgress(null, step({ id: 'a', status: IN_PROGRESS }), NOW);
    expect(getChip(rec, DEFAULT_STATUS_DEFS)).toMatchObject({ label: 'In progress', terminal: false });
    rec = addProgress(rec, step({ id: 'b', status: DONE }), NOW + 1);
    expect(getChip(rec, DEFAULT_STATUS_DEFS)).toMatchObject({ label: 'Done', terminal: true });
  });

  test('is a neutral pill when the log has steps but no status', () => {
    const rec = addProgress(null, step({ id: 'a', status: null, note: 'x' }), NOW);
    expect(getChip(rec, DEFAULT_STATUS_DEFS)).toMatchObject({ hasStatus: false, color: NEUTRAL_COLOR });
  });
});

describe('parseStatusDefs', () => {
  test('parses a label-only line and auto-assigns a valid color', () => {
    const [def] = parseStatusDefs('Downtime');
    expect(def.label).toBe('Downtime');
    expect(isValidHex(def.color)).toBe(true);
  });

  test('honours an explicit "Label | #hex"', () => {
    expect(parseStatusDefs('WhatsApp Monitor | #3B82F6')[0]).toMatchObject({
      label: 'WhatsApp Monitor', color: '#3B82F6',
    });
  });

  test('ignores a trailing pipe that is not a valid hex (keeps it in the label)', () => {
    expect(parseStatusDefs('A | B')[0].label).toBe('A | B');
  });

  test('skips blank lines and derives stable, unique ids', () => {
    const defs = parseStatusDefs('New\n\n  New  \nDone');
    expect(defs).toHaveLength(3);
    expect(new Set(defs.map((d) => d.id)).size).toBe(3);
    // Same label re-pasted keeps a deterministic base id.
    expect(defs[0].id).toBe('st_new');
  });

  test('every parsed color is a valid hex', () => {
    const defs = parseStatusDefs('One\nTwo | #zzzzzz\nThree | #10B981');
    for (const d of defs) expect(isValidHex(d.color)).toBe(true);
    expect(defs[1].color).not.toBe('#zzzzzz'); // invalid hex ignored, auto-assigned
  });
});

describe('serializeStatusDefs / resolveStatusDefs', () => {
  test('serialize -> parse round-trips labels and colors', () => {
    const text = serializeStatusDefs(DEFAULT_STATUS_DEFS);
    const back = parseStatusDefs(text);
    expect(back.map((d) => [d.label, d.color])).toEqual(DEFAULT_STATUS_DEFS.map((d) => [d.label, d.color]));
  });

  test('resolve falls back to the built-in set when nothing is stored', () => {
    expect(resolveStatusDefs([])).toBe(DEFAULT_STATUS_DEFS);
    expect(resolveStatusDefs(null)).toBe(DEFAULT_STATUS_DEFS);
    const custom = [{ id: 'st_x', label: 'X', color: '#123456' }];
    expect(resolveStatusDefs(custom)).toBe(custom);
  });
});

describe('palette integrity', () => {
  test('every default status has a unique id and a valid hex colour', () => {
    const ids = DEFAULT_STATUS_DEFS.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const def of DEFAULT_STATUS_DEFS) expect(isValidHex(def.color)).toBe(true);
  });

  test('never uses the amber unread colour for a status', () => {
    expect(DEFAULT_STATUS_DEFS.some((d) => d.color.toLowerCase() === '#f0b429')).toBe(false);
  });
});
