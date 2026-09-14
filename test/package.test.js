import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';

const optionsPage = readFileSync('options.html', 'utf8');
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const manifest = JSON.parse(readFileSync('manifest.json', 'utf8'));

/** The files scripts/package.mjs copies to the root of the released folder. */
const SHIPPED_ROOT = ['manifest.json', 'options.html', 'README.md'];

/** Every path the manifest names, wherever it names one. */
const referenced = [
  manifest.background?.service_worker,
  manifest.options_page,
  ...(manifest.content_scripts ?? []).flatMap((entry) => entry.js ?? []),
].filter(Boolean);

/**
 * What ships is manifest.json, options.html and dist/. Anything the extension
 * loads from src/ at runtime would be missing from the released zip and would
 * only fail once someone had already installed it.
 */
describe('the released folder is self-contained', () => {
  test('the options page loads its bundle, not a source module', () => {
    expect(optionsPage).toMatch(/src="dist\/options\.js"/);
    expect(optionsPage).not.toMatch(/src="src\//);
  });

  test('the build produces that options bundle', () => {
    expect(pkg.scripts.build).toMatch(/dist\/options\.js/);
  });
});

/**
 * The released zip holds the manifest, the options page, the README and dist/.
 * A manifest entry pointing anywhere else is a file that exists while you
 * develop and is missing the moment someone installs the zip — and the symptom
 * is nothing more specific than a feature quietly not working.
 */
describe('every file the manifest names is actually shipped', () => {
  test.each(referenced)('%s is in the released folder', (path) => {
    const shipped = path.startsWith('dist/') || SHIPPED_ROOT.includes(path);
    expect(shipped).toBe(true);
  });
});
