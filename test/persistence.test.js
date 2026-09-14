import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';

const storeSource = readFileSync('src/store.js', 'utf8');
const mainSource = readFileSync('src/main.js', 'utf8');

/**
 * The group list is held in memory only, so that message bodies never reach
 * disk. An ETag describes a body we are no longer holding once the tab
 * reloads, so persisting one guarantees a 304 against an empty list: the panel
 * reports a successful check and shows nothing. The ETag must live exactly as
 * long as the data it describes.
 */
describe('etag lifetime', () => {
  test('is not one of the values kept in chrome.storage', () => {
    expect(storeSource).not.toMatch(/^\s*etag:/m);
  });

  test('is never written to storage', () => {
    expect(mainSource).not.toMatch(/saveState\(\{\s*etag/);
  });

  test('is never restored from storage on startup', () => {
    expect(mainSource).not.toMatch(/=\s*stored\.etag/);
  });
});
