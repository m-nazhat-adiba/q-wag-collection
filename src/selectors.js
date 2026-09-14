/**
 * Every assumption about the host app's markup lives here, and nowhere else.
 *
 * The host app is not our codebase and will be redesigned without warning. When
 * clicking a row stops working, this is the only file that should need
 * editing — load the page, inspect a chat row, and correct the lists below.
 */

/** Attributes that might carry the WhatsApp group id on a row element. */
export const GROUP_ID_ATTRIBUTES = [
  'data-group-id',
  'data-chat-id',
  'data-jid',
  'data-id',
];

/** Candidates for the host app's own chat-search input, best guess first. */
export const SEARCH_INPUT_SELECTORS = [
  'input[type="search"]',
  'input[placeholder*="search" i]',
  'input[placeholder*="cari" i]',
  'input[aria-label*="search" i]',
];

/** Candidates for a single clickable chat row in the host app's list. */
export const CHAT_ROW_SELECTORS = [
  '[data-group-id]',
  '[role="listitem"]',
  '[role="option"]',
  'li',
  '[class*="chat-item" i]',
  '[class*="conversation" i]',
];

/** Tried top to bottom; the first one that works is cached for the session. */
export const STRATEGY_ORDER = ['byId', 'viaSearch', 'byText'];

/** How long to let the host app re-render after typing into its search box. */
export const SEARCH_SETTLE_MS = 400;
