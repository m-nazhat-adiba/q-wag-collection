/**
 * Where this extension points.
 *
 * Nothing here names a particular server. The host is supplied by whoever
 * installs the extension, granted through Chrome's own permission prompt, and
 * kept in local storage — so no deployment's address lives in this repository.
 *
 * Pure: string in, string out. The service worker does the permission and
 * registration work.
 */

export function normaliseEndpoint(raw) {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) {
    throw new Error('Enter the address of the endpoint that returns your chat list.');
  }

  let url;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error('That is not a full address. It should look like https://example.com/api/chats');
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error('The address must start with https.');
  }

  return trimmed;
}

/**
 * Chrome grants access per origin, not per path, so this is what the
 * permission prompt will name.
 */
export function originPermission(endpoint) {
  return `${new URL(endpoint).origin}/*`;
}

/** Which pages the panel appears on. Defaults to the whole origin. */
export function derivePagePattern(endpoint) {
  return originPermission(endpoint);
}

export function isConfigured(state) {
  return Boolean(state?.endpoint);
}
