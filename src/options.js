/**
 * The options page. The permission request has to happen here, in a real
 * extension page during a click, because Chrome only honours it as part of a
 * user gesture — a service worker asking on its own behalf is refused.
 *
 * Once Chrome grants the origin, the service worker registers the panel.
 */

import { derivePagePattern, normaliseEndpoint, originPermission } from './config.js';
import { DEFAULT_STATUS_DEFS, parseStatusDefs, resolveStatusDefs, serializeStatusDefs } from './tracking.js';

const endpointField = document.getElementById('endpoint');
const patternField = document.getElementById('pattern');
const saveButton = document.getElementById('save');
const forgetButton = document.getElementById('forget');
const status = document.getElementById('status');

const statusesField = document.getElementById('statuses');
const saveStatusesButton = document.getElementById('saveStatuses');
const resetStatusesButton = document.getElementById('resetStatuses');
const statusesMsg = document.getElementById('statusesMsg');

function report(message, tone) {
  status.textContent = message;
  status.dataset.tone = tone;
  status.hidden = false;
}

function reportStatuses(message, tone) {
  statusesMsg.textContent = message;
  statusesMsg.dataset.tone = tone;
  statusesMsg.hidden = false;
}

/** Fill the pattern in as the endpoint is typed, until it is edited by hand. */
let patternEdited = false;
patternField.addEventListener('input', () => { patternEdited = true; });

endpointField.addEventListener('input', () => {
  if (patternEdited) return;
  try {
    patternField.value = derivePagePattern(normaliseEndpoint(endpointField.value));
  } catch {
    patternField.value = '';
  }
});

saveButton.addEventListener('click', async () => {
  let endpoint;
  try {
    endpoint = normaliseEndpoint(endpointField.value);
  } catch (error) {
    report(error.message, 'bad');
    return;
  }

  const pagePattern = patternField.value.trim() || derivePagePattern(endpoint);
  const origin = originPermission(endpoint);

  const granted = await chrome.permissions.request({ origins: [origin] });
  if (!granted) {
    report('Chrome did not grant access, so nothing was saved.', 'bad');
    return;
  }

  const result = await chrome.runtime.sendMessage({ type: 'register', endpoint, pagePattern });
  if (!result?.ok) {
    report(result?.error ?? 'Could not register the panel.', 'bad');
    return;
  }

  report(`Saved. Open ${pagePattern.replace(/\*$/, '')} and reload the page to see the panel.`, 'good');
});

forgetButton.addEventListener('click', async () => {
  await chrome.runtime.sendMessage({ type: 'forget' });
  endpointField.value = '';
  patternField.value = '';
  patternEdited = false;
  report('Settings cleared and access revoked.', 'good');
});

saveStatusesButton.addEventListener('click', async () => {
  const defs = parseStatusDefs(statusesField.value);
  if (!defs.length) {
    reportStatuses('Add at least one status, one per line.', 'bad');
    return;
  }
  await chrome.storage.local.set({ statusDefs: defs });
  statusesField.value = serializeStatusDefs(defs); // reflect the normalized set
  reportStatuses(`Saved ${defs.length} statuses. Open panels update on next check.`, 'good');
});

resetStatusesButton.addEventListener('click', async () => {
  await chrome.storage.local.set({ statusDefs: [] });
  statusesField.value = serializeStatusDefs(DEFAULT_STATUS_DEFS);
  reportStatuses('Reset to the built-in statuses.', 'good');
});

const stored = await chrome.storage.local.get(['endpoint', 'pagePattern', 'statusDefs']);
if (stored.endpoint) {
  endpointField.value = stored.endpoint;
  patternField.value = stored.pagePattern ?? '';
  patternEdited = true;
  report('This extension is set up and running on the site above.', 'good');
}

statusesField.value = serializeStatusDefs(resolveStatusDefs(stored.statusDefs));
