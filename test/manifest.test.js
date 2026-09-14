import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';

const manifest = JSON.parse(readFileSync('manifest.json', 'utf8'));
const loaderSource = readFileSync('src/content.js', 'utf8');

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
 * Chrome runs an injected content script as a classic script, so the entry
 * file cannot use a static import — it would throw "Cannot use import
 * statement outside a module" at its first line and nothing would mount.
 */
describe('content script entry point', () => {
  test('has no static import', () => {
    expect(loaderSource).not.toMatch(/^\s*import\s+[\w{*]/m);
  });

  test('reaches the real code through a dynamic import instead', () => {
    expect(loaderSource).toMatch(/import\(/);
  });

  test('exposes the modules it dynamically imports as web-accessible', () => {
    const [entry] = manifest.web_accessible_resources;
    expect(entry.resources).toContain('src/*.js');
  });

  test('rotates those resource urls so pages cannot fingerprint the extension', () => {
    const [entry] = manifest.web_accessible_resources;
    expect(entry.use_dynamic_url).toBe(true);
  });
});
