/**
 * Talks to the chat-list endpoint configured on the options page, from that
 * site's own origin.
 *
 * Because the content script runs on that origin, the browser attaches the
 * existing session cookie itself. The extension never reads, stores, or
 * forwards any credential.
 */

export const DEFAULT_POLL_MS = 30_000;
const MAX_BACKOFF_MS = 120_000;

export function classifyStatus(status) {
  if (status === 200) return 'ok';
  if (status === 304) return 'unchanged';
  if (status === 401 || status === 403) return 'expired';
  return 'error';
}

/** Slow down after a failure, but never past two minutes or below normal pace. */
export function nextBackoff(currentMs) {
  const doubled = currentMs * 2;
  return Math.min(MAX_BACKOFF_MS, Math.max(DEFAULT_POLL_MS, doubled));
}

/**
 * One poll. Sends the previous ETag so an unchanged list costs a 304 with no
 * body. Returns the raw parsed array on 'ok' and nothing on every other
 * outcome — interpreting it is buildInbox's job.
 */
export async function fetchChats(endpoint, etag) {
  // Nothing sensible to request until someone says where the list lives.
  if (!endpoint) return { outcome: 'unconfigured' };

  const headers = { accept: '*/*' };
  if (etag) headers['if-none-match'] = etag;

  let response;
  try {
    response = await fetch(endpoint, {
      credentials: 'include',
      headers,
      cache: 'no-store',
    });
  } catch (cause) {
    return { outcome: 'error', reason: cause?.message ?? 'network failure' };
  }

  const outcome = classifyStatus(response.status);
  if (outcome !== 'ok') {
    return { outcome, reason: `HTTP ${response.status}` };
  }

  try {
    return {
      outcome: 'ok',
      groups: await response.json(),
      etag: response.headers.get('etag') ?? null,
    };
  } catch {
    return { outcome: 'error', reason: 'response was not valid JSON' };
  }
}
