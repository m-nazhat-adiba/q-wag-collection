import { execFileSync } from 'node:child_process';
import { describe, expect, test } from 'vitest';

/**
 * dist/ is committed so that any zip taken from GitHub — including the
 * "Source code" archive people reach for first — is a working extension.
 *
 * The cost of that is a build output which can go stale. npm test rebuilds
 * before running, so if the committed bundles differ from a fresh build of the
 * current sources, git sees a change here and this fails.
 */
describe('the committed bundles match the sources', () => {
  test('dist/ is not stale', () => {
    const changed = execFileSync('git', ['status', '--porcelain', '--', 'dist'], {
      encoding: 'utf8',
    }).trim();

    expect(changed, `Rebuilt bundles differ from the committed ones:\n${changed}\nRun: npm run build, then commit dist/`).toBe('');
  });
});
