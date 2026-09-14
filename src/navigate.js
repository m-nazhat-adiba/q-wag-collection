/**
 * Opens a group by driving the host app's own UI.
 *
 * We deliberately do not construct URLs: the host app's routing is not a contract
 * we control. Clicking the row the app already rendered is the behaviour least
 * likely to silently do the wrong thing. When every strategy misses we say so
 * out loud rather than pretending the click worked.
 */

import {
  CHAT_ROW_SELECTORS,
  GROUP_ID_ATTRIBUTES,
  SEARCH_INPUT_SELECTORS,
  SEARCH_SETTLE_MS,
  STRATEGY_ORDER,
} from './selectors.js';

let cachedStrategy = null;

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function firstMatch(selectors) {
  for (const selector of selectors) {
    const el = document.querySelector(selector);
    if (el) return el;
  }
  return null;
}

/** Rows can be nested inside the thing that actually handles the click. */
function clickable(el) {
  return el.closest('a, button, [role="button"], [role="option"], [role="listitem"]') ?? el;
}

function byId(group) {
  for (const attribute of GROUP_ID_ATTRIBUTES) {
    const el = document.querySelector(`[${attribute}="${CSS.escape(group.group_id)}"]`);
    if (el) return clickable(el);
  }
  return null;
}

function byText(group) {
  const needle = group.group_name.trim().toLowerCase();
  for (const selector of CHAT_ROW_SELECTORS) {
    for (const el of document.querySelectorAll(selector)) {
      if (el.textContent?.trim().toLowerCase().includes(needle)) {
        return clickable(el);
      }
    }
  }
  return null;
}

/**
 * React tracks input values on its own internal node, so assigning `.value`
 * directly updates the DOM but never fires onChange and the app ignores it.
 * Going through the prototype setter is what makes React notice.
 */
function setReactInputValue(input, value) {
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    'value',
  )?.set;
  setter ? setter.call(input, value) : (input.value = value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

/**
 * The strategy that survives virtualised lists: a few hundred groups are not
 * all in the DOM at once, so scrolling to find one is unreliable. Letting
 * the host app filter its own list is.
 */
async function viaSearch(group) {
  const input = firstMatch(SEARCH_INPUT_SELECTORS);
  if (!input) return null;

  input.focus();
  setReactInputValue(input, group.group_name);
  await delay(SEARCH_SETTLE_MS);

  return byText(group);
}

const STRATEGIES = { byId, viaSearch, byText };

/**
 * @returns {Promise<{ ok: boolean, strategy?: string }>}
 */
export async function openInApp(group) {
  const order = cachedStrategy
    ? [cachedStrategy, ...STRATEGY_ORDER.filter((s) => s !== cachedStrategy)]
    : STRATEGY_ORDER;

  for (const name of order) {
    const target = await STRATEGIES[name](group);
    if (target) {
      target.click();
      cachedStrategy = name;
      return { ok: true, strategy: name };
    }
  }

  cachedStrategy = null;
  await copyToClipboard(group.group_name);
  return { ok: false };
}

async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    /* clipboard permission denied — the toast still tells the user the name */
  }
}
