import { afterEach, describe, expect, test } from 'vitest';
import { ContextLostError, isContextAlive, isContextLost, loadState, saveState } from '../src/store.js';

afterEach(() => { delete globalThis.chrome; });

/**
 * Reloading an unpacked extension tears down its context, but a content script
 * already injected into an open page keeps running with a severed connection.
 * Every chrome API call then throws "Extension context invalidated". The panel
 * has to notice, rather than poll a dead context forever behind a stale render.
 */
describe('isContextAlive', () => {
  test('is false once the extension context has been torn down', () => {
    globalThis.chrome = { runtime: {} };
    expect(isContextAlive()).toBe(false);
  });

  test('is false when the chrome object is gone entirely', () => {
    expect(isContextAlive()).toBe(false);
  });

  test('is true while the extension is still connected', () => {
    globalThis.chrome = { runtime: { id: 'abcdef' } };
    expect(isContextAlive()).toBe(true);
  });
});

describe('storage access after the context is gone', () => {
  test('loadState rejects instead of calling a chrome API that throws', async () => {
    await expect(loadState()).rejects.toBeInstanceOf(ContextLostError);
  });

  test('saveState rejects the same way', async () => {
    await expect(saveState({ allowlist: [] })).rejects.toBeInstanceOf(ContextLostError);
  });

  test('isContextLost recognises our own error', () => {
    expect(isContextLost(new ContextLostError())).toBe(true);
  });

  test("isContextLost recognises Chrome's own wording, which we never construct", () => {
    expect(isContextLost(new Error('Extension context invalidated.'))).toBe(true);
  });

  test('isContextLost leaves unrelated failures alone', () => {
    expect(isContextLost(new Error('network request failed'))).toBe(false);
  });
});
