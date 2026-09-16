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

/**
 * Case tracking holds Slack links and free-text notes about clients — more
 * sensitive than group names. It must never reach chrome.storage.sync (which
 * copies to Google), only local, exactly like every other stored value.
 */
describe('case tracking storage', () => {
  test('declares a tracking key in DEFAULTS', () => {
    expect(storeSource).toMatch(/^\s*tracking:\s*\{\}/m);
  });

  test('store.js never calls chrome.storage.sync (comment mention aside)', () => {
    // A real accessor like chrome.storage.sync.get/.set — not the header comment
    // that explains why sync is avoided.
    expect(storeSource).not.toMatch(/chrome\.storage\.sync\./);
  });

  test('mutates tracking through the write queue, writing only the tracking key', () => {
    expect(storeSource).toMatch(/saveState\(\{\s*tracking:/);
  });
});

/**
 * The Need Attention tab is backed by a plain id list, exactly like pinned:
 * local only, never synced to Google.
 */
describe('need attention storage', () => {
  test('declares an attention key in DEFAULTS', () => {
    expect(storeSource).toMatch(/^\s*attention:\s*\[\]/m);
  });

  test('un-picking a group also drops its attention flag', () => {
    expect(mainSource).toMatch(/patch\.attention\s*=/);
  });
});
