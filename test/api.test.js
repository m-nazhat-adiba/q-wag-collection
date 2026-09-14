import { describe, expect, test } from 'vitest';
import { classifyStatus, fetchChats, nextBackoff, DEFAULT_POLL_MS } from '../src/api.js';

describe('classifyStatus', () => {
  test('treats 200 as fresh data', () => {
    expect(classifyStatus(200)).toBe('ok');
  });

  test('treats 304 as unchanged, so the caller does no work', () => {
    expect(classifyStatus(304)).toBe('unchanged');
  });

  test('treats 401 as an expired session', () => {
    expect(classifyStatus(401)).toBe('expired');
  });

  test('treats 403 as an expired session', () => {
    expect(classifyStatus(403)).toBe('expired');
  });

  test('treats 500 as a retryable failure', () => {
    expect(classifyStatus(500)).toBe('error');
  });
});

describe('nextBackoff', () => {
  test('doubles the current delay after a failure', () => {
    expect(nextBackoff(DEFAULT_POLL_MS)).toBe(DEFAULT_POLL_MS * 2);
  });

  test('caps the delay so polling never stalls for minutes', () => {
    expect(nextBackoff(999_999)).toBe(120_000);
  });

  test('never returns less than the normal poll interval', () => {
    expect(nextBackoff(1)).toBeGreaterThanOrEqual(DEFAULT_POLL_MS);
  });
});

describe('fetchChats', () => {
  test('reports an unconfigured endpoint instead of guessing a url', async () => {
    await expect(fetchChats('', null)).resolves.toEqual({ outcome: 'unconfigured' });
  });
});
