import { describe, expect, test } from 'vitest';
import chats from './fixtures/chats.json' with { type: 'json' };
import { parseImport, resolveImport, serialize } from '../src/portable.js';

const NORTHWIND = '120363000000000001@g.us';
const ACME = '120363000000000002@g.us';
const GLOBEX = '120363000000000003@g.us';

describe('serialize', () => {
  test('exports the picked groups with both id and name', () => {
    const file = serialize(chats, [ACME]);
    expect(file.groups).toEqual([{ group_id: ACME, group_name: 'Acme Freight <> Support' }]);
  });

  test('stamps a format version so a future reader knows what it has', () => {
    expect(serialize(chats, [ACME]).version).toBe(1);
  });

  test('keeps a picked group the server no longer lists, with no name', () => {
    const file = serialize(chats, ['gone@g.us']);
    expect(file.groups).toEqual([{ group_id: 'gone@g.us', group_name: null }]);
  });

  test('exports nothing when nothing is picked', () => {
    expect(serialize(chats, []).groups).toEqual([]);
  });
});

describe('parseImport', () => {
  test('reads a file this extension exported', () => {
    const text = JSON.stringify(serialize(chats, [ACME, NORTHWIND]));
    expect(parseImport(text)).toEqual([
      { group_id: ACME, group_name: 'Acme Freight <> Support' },
      { group_id: NORTHWIND, group_name: 'Northwind Retail' },
    ]);
  });

  test('reads a plain list of group names, one per line', () => {
    expect(parseImport('Acme Freight <> Support\nNorthwind Retail')).toEqual([
      { group_id: null, group_name: 'Acme Freight <> Support' },
      { group_id: null, group_name: 'Northwind Retail' },
    ]);
  });

  test('recognises a group id by its @g.us suffix', () => {
    expect(parseImport(ACME)).toEqual([{ group_id: ACME, group_name: null }]);
  });

  test('takes the first column of a CSV and respects quoting', () => {
    expect(parseImport('"Acme Freight <> Support",674,unread')).toEqual([
      { group_id: null, group_name: 'Acme Freight <> Support' },
    ]);
  });

  test('skips a header row', () => {
    expect(parseImport('group_name,count\nAcme Freight <> Support,674')).toEqual([
      { group_id: null, group_name: 'Acme Freight <> Support' },
    ]);
  });

  test('ignores blank lines and surrounding whitespace', () => {
    expect(parseImport('\n  Acme Freight <> Support  \n\n')).toEqual([
      { group_id: null, group_name: 'Acme Freight <> Support' },
    ]);
  });

  test('rejects text that opens like JSON but does not parse', () => {
    expect(() => parseImport('{ "groups": [ ')).toThrow(/not valid json/i);
  });

  test('rejects JSON that is not an exported group list', () => {
    expect(() => parseImport('{"hello":"world"}')).toThrow(/group list/i);
  });
});

describe('resolveImport', () => {
  test('matches an entry by group id', () => {
    const result = resolveImport([{ group_id: ACME, group_name: null }], chats, []);
    expect(result.matched).toEqual([ACME]);
  });

  test('matches by name when no id is given', () => {
    const result = resolveImport([{ group_id: null, group_name: 'Acme Freight <> Support' }], chats, []);
    expect(result.matched).toEqual([ACME]);
  });

  test('matches a name regardless of case and padding', () => {
    const result = resolveImport([{ group_id: null, group_name: '  acme freight <> SUPPORT ' }], chats, []);
    expect(result.matched).toEqual([ACME]);
  });

  test('separates groups that are already picked', () => {
    const entries = [
      { group_id: ACME, group_name: null },
      { group_id: NORTHWIND, group_name: null },
    ];
    const result = resolveImport(entries, chats, [NORTHWIND]);
    expect(result.matched).toEqual([ACME]);
    expect(result.alreadyPicked).toEqual([NORTHWIND]);
  });

  test('reports entries it could not match, by what was written', () => {
    const entries = [{ group_id: null, group_name: 'Nonexistent Group' }];
    const result = resolveImport(entries, chats, []);
    expect(result.unmatched).toEqual(['Nonexistent Group']);
    expect(result.matched).toEqual([]);
  });

  test('reports an unmatched id by the id itself', () => {
    const result = resolveImport([{ group_id: 'gone@g.us', group_name: null }], chats, []);
    expect(result.unmatched).toEqual(['gone@g.us']);
  });

  test('counts a group listed twice only once', () => {
    const entries = [
      { group_id: ACME, group_name: null },
      { group_id: null, group_name: 'Acme Freight <> Support' },
    ];
    expect(resolveImport(entries, chats, []).matched).toEqual([ACME]);
  });

  test('leaves groups outside the import alone', () => {
    const result = resolveImport([{ group_id: ACME, group_name: null }], chats, []);
    expect(result.matched).not.toContain(GLOBEX);
  });

  test('does not adopt a blank-named group when an entry has no usable name', () => {
    const withBlank = [...chats, { group_id: 'blank@g.us', group_name: '   ' }];
    const result = resolveImport([{ group_id: 'gone@g.us', group_name: null }], withBlank, []);
    expect(result.matched).toEqual([]);
    expect(result.unmatched).toEqual(['gone@g.us']);
  });
});
