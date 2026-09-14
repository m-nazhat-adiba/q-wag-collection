import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';

const optionsPage = readFileSync('options.html', 'utf8');
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));

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
