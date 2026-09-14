/**
 * Assembles the installable folder and zips it.
 *
 * What ships is only what Chrome loads: the manifest, the options page, the
 * bundles, and the README. Nothing from src/ or test/, because nothing is
 * fetched at runtime.
 *
 * Zipping uses whatever the machine has — `zip` on Linux and macOS, PowerShell's
 * Compress-Archive on Windows — so this needs no dependency of its own.
 */

import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { platform } from 'node:process';

const { version } = JSON.parse(readFileSync('manifest.json', 'utf8'));

const stagingRoot = 'release';
const folderName = 'wag-inbox';
const staged = `${stagingRoot}/${folderName}`;
const zipPath = `${stagingRoot}/wag-inbox-v${version}.zip`;

rmSync(stagingRoot, { recursive: true, force: true });
mkdirSync(staged, { recursive: true });

for (const file of ['manifest.json', 'options.html', 'README.md']) {
  cpSync(file, `${staged}/${file}`);
}
cpSync('dist', `${staged}/dist`, { recursive: true });

if (platform === 'win32') {
  execFileSync('powershell', [
    '-NoProfile',
    '-Command',
    `Compress-Archive -Path '${staged}' -DestinationPath '${zipPath}' -Force`,
  ], { stdio: 'inherit' });
} else {
  execFileSync('zip', ['-r', `wag-inbox-v${version}.zip`, folderName], {
    cwd: stagingRoot,
    stdio: 'inherit',
  });
}

console.log(`\nBuilt ${zipPath}`);
console.log('Attach it to a GitHub release, or send the folder to someone to load unpacked.');
