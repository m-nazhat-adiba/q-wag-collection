/**
 * Classic-script loader.
 *
 * Chrome ignores "type": "module" on content_scripts entries and runs this
 * file as a classic script, so a static import here throws. Dynamic import is
 * allowed in classic scripts and keeps everything in the isolated world with
 * chrome APIs intact, so this is the one file that may not use `import ... from`.
 *
 * Keep it this small. All real work lives in main.js.
 */

import(chrome.runtime.getURL('src/main.js')).catch((error) => {
  console.error('[WAG Inbox] failed to load:', error);
});
