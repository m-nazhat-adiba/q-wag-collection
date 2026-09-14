import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';

/**
 * This repository is public. The extension is configured at runtime precisely
 * so that no particular deployment's address, product name, or customer name
 * ever needs to be committed. This test fails if one creeps back in.
 *
 * Adding a name here is not the fix. Making the code take it as configuration
 * is the fix.
 */
const FORBIDDEN = [
  /soluport/i,
  /qiscus/i,
  /\bwa-api\b/i,
];

const trackedTextFiles = execFileSync('git', ['ls-files'], { encoding: 'utf8' })
  .split('\n')
  .filter(Boolean)
  .filter((path) => /\.(js|json|md|html|css|yml|yaml|txt)$/.test(path))
  .filter((path) => path !== 'test/no-hostnames.test.js' && path !== 'package-lock.json');

describe('no deployment details are committed', () => {
  test.each(trackedTextFiles)('%s names no specific deployment', (path) => {
    const contents = readFileSync(path, 'utf8');
    for (const pattern of FORBIDDEN) {
      expect(contents).not.toMatch(pattern);
    }
  });
});
