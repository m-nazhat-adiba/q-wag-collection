import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';

const manifest = JSON.parse(readFileSync('manifest.json', 'utf8'));

/**
 * The manifest names no site. Access is asked for at runtime through Chrome's
 * permission prompt and the panel is registered for whatever host the person
 * installing it configures, so no deployment's address lives in this repo.
 */
describe('host access', () => {
  test('grants no host access up front', () => {
    expect(manifest.host_permissions).toBeUndefined();
  });

  test('declares only the right to ask for an https host', () => {
    expect(manifest.optional_host_permissions).toEqual(['https://*/*']);
  });

  test('registers no content script declaratively', () => {
    expect(manifest.content_scripts).toBeUndefined();
  });

  test('can register one at runtime', () => {
    expect(manifest.permissions).toContain('scripting');
  });

  test('has a page for entering the endpoint', () => {
    expect(manifest.options_page).toBe('options.html');
  });
});

/**
 * The panel is injected as one bundled classic script.
 *
 * A content script cannot fetch a second file at runtime: a dynamic import is
 * governed by the host page's Content Security Policy, and a page serving
 * script-src 'self' refuses a chrome-extension: URL outright. Bundling avoids
 * the fetch, and with no file to fetch there is nothing to expose to pages.
 */
describe('injected code', () => {
  test('exposes no resources to web pages', () => {
    expect(manifest.web_accessible_resources).toBeUndefined();
  });
});
