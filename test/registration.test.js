import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';

const background = readFileSync('src/background.js', 'utf8');

/**
 * Reloading or updating an extension clears every dynamically registered
 * content script. persistAcrossSessions survives a browser restart, not an
 * extension reload. Without re-registering on startup the panel silently stops
 * being injected: the extension still looks installed and configured, and
 * nothing at all runs on the page.
 */
describe('content script registration survives a reload', () => {
  test('re-registers when the extension is installed or updated', () => {
    expect(background).toMatch(/chrome\.runtime\.onInstalled\.addListener/);
  });

  test('re-registers when the browser starts', () => {
    expect(background).toMatch(/chrome\.runtime\.onStartup\.addListener/);
  });

  test('checks the permission is still held before re-registering', () => {
    expect(background).toMatch(/chrome\.permissions\.contains/);
  });
});

/**
 * A dynamic import from a content script is subject to the host page's CSP, so
 * a page serving script-src 'self' blocks it and nothing mounts. The injected
 * script must therefore be the self-contained bundle, never a source file that
 * would have to fetch its dependencies at runtime.
 */
describe('what gets injected', () => {
  test('registers the bundle, not a source module', () => {
    expect(background).toMatch(/js: \['dist\/content\.js'\]/);
  });

  test('a build script produces that bundle', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
    expect(pkg.scripts.build).toMatch(/esbuild .*--bundle.*dist\/content\.js/);
  });

  test('tests always run against a fresh build', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
    expect(pkg.scripts.pretest).toBe('npm run build');
  });
});
