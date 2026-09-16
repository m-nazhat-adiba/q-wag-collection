/**
 * Styles live as a string rather than a .css file so the panel needs no
 * web_accessible_resources entry and no fetch to render. They are injected
 * into a shadow root, so nothing here can leak onto the host page and nothing
 * the host page ships can reach in.
 */
export const PANEL_CSS = `
:host {
  --ground: #161b22;
  --raised: #1d242e;
  --hairline: #2b333d;
  --text: #e6edf3;
  --dim: #8b98a5;
  --signal: #f0b429;
  --alarm: #f2714b;

  all: initial;
  font-family: ui-sans-serif, system-ui, "Segoe UI", Roboto, sans-serif;
  color: var(--text);
}

*, *::before, *::after { box-sizing: border-box; }

button { font: inherit; color: inherit; background: none; border: 0; cursor: pointer; }
:focus-visible { outline: 2px solid var(--signal); outline-offset: 2px; }

/* ---- launcher ------------------------------------------------------- */

.launcher {
  position: fixed;
  right: 20px;
  bottom: 20px;
  z-index: 2147483646;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 14px;
  border-radius: 999px;
  background: var(--ground);
  box-shadow: 0 2px 14px rgb(0 0 0 / 0.35);
  font-size: 13px;
  font-weight: 550;
}

.launcher__count {
  font-variant-numeric: tabular-nums;
  color: var(--signal);
}

.launcher[data-unread="0"] .launcher__count { color: var(--dim); }

/* ---- drawer --------------------------------------------------------- */

.drawer {
  position: fixed;
  top: 0;
  right: 0;
  z-index: 2147483647;
  display: flex;
  flex-direction: column;
  width: 340px;
  max-width: 100vw;
  height: 100vh;
  background: var(--ground);
  border-left: 1px solid var(--hairline);
  transform: translateX(100%);
  transition: transform 180ms ease;
}

.drawer[data-open="true"] { transform: translateX(0); }

@media (prefers-reduced-motion: reduce) {
  .drawer { transition: none; }
}

.header {
  display: flex;
  align-items: baseline;
  gap: 10px;
  padding: 16px 16px 12px;
  border-bottom: 1px solid var(--hairline);
}

.header__title { font-size: 14px; font-weight: 600; }
.header__meta { flex: 1; font-size: 11px; color: var(--dim); }
.header__close { padding: 2px 6px; color: var(--dim); font-size: 16px; line-height: 1; }

.tabs { display: flex; border-bottom: 1px solid var(--hairline); }

.tab {
  flex: 1;
  padding: 10px 6px;
  font-size: 11.5px;
  white-space: nowrap;
  color: var(--dim);
  border-bottom: 2px solid transparent;
}

.tab[aria-selected="true"] { color: var(--text); border-bottom-color: var(--signal); }

.search {
  width: calc(100% - 24px);
  margin: 12px;
  padding: 7px 10px;
  font: inherit;
  font-size: 13px;
  color: var(--text);
  background: var(--raised);
  border: 1px solid var(--hairline);
  border-radius: 6px;
}

.search::placeholder { color: var(--dim); }

.list { flex: 1; overflow-y: auto; }

/* ---- transfer ------------------------------------------------------- */

.toolbar {
  display: flex;
  gap: 8px;
  padding: 12px 12px 0;
}

.toolbar button {
  flex: 1;
  padding: 6px 10px;
  font-size: 12px;
  color: var(--dim);
  background: var(--raised);
  border: 1px solid var(--hairline);
  border-radius: 6px;
}

.toolbar button:hover { color: var(--text); }

.sheet {
  position: absolute;
  inset: auto 0 0;
  padding: 14px 16px 16px;
  background: var(--ground);
  border-top: 1px solid var(--hairline);
  box-shadow: 0 -8px 24px rgb(0 0 0 / 0.3);
}

.sheet__title { font-size: 13px; font-weight: 600; margin-bottom: 4px; }
.sheet__hint { font-size: 11.5px; color: var(--dim); line-height: 1.5; margin-bottom: 10px; }

.sheet textarea {
  width: 100%;
  height: 104px;
  padding: 8px 10px;
  font: inherit;
  font-size: 12px;
  line-height: 1.5;
  color: var(--text);
  background: var(--raised);
  border: 1px solid var(--hairline);
  border-radius: 6px;
  resize: vertical;
}

.sheet__actions { display: flex; gap: 8px; margin-top: 10px; }

.sheet__actions button {
  flex: 1;
  padding: 7px 10px;
  font-size: 12px;
  border-radius: 6px;
  border: 1px solid var(--hairline);
  background: var(--raised);
  color: var(--text);
}

.sheet__actions button[data-primary="true"] {
  background: var(--signal);
  border-color: var(--signal);
  color: #1a1205;
  font-weight: 600;
}

.summary { margin-top: 10px; font-size: 12px; line-height: 1.6; }
.summary__unmatched { margin-top: 6px; color: var(--dim); font-size: 11.5px; line-height: 1.5; }

/* ---- rows ----------------------------------------------------------- */

.row {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  width: 100%;
  padding: 11px 16px 11px 13px;
  text-align: left;
  border-bottom: 1px solid var(--hairline);
  border-left: 3px solid transparent;
}

.row:hover { background: var(--raised); }
.row[data-unread="true"] { border-left-color: var(--signal); }
.row[data-missing="true"] { opacity: 0.45; }

.row__body { flex: 1; min-width: 0; }

.row__name {
  font-size: 13px;
  font-weight: 550;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.row__preview {
  margin-top: 3px;
  font-size: 11.5px;
  color: var(--dim);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.row__aside { display: flex; flex-direction: column; align-items: flex-end; gap: 4px; }

.row__count {
  min-width: 22px;
  padding: 1px 6px;
  border-radius: 10px;
  background: var(--signal);
  color: #1a1205;
  font-size: 11px;
  font-weight: 650;
  font-variant-numeric: tabular-nums;
  text-align: center;
}

.row[data-unread="false"] .row__count { visibility: hidden; }

.row__time { font-size: 10.5px; color: var(--dim); font-variant-numeric: tabular-nums; }

.row__pick { padding: 4px; font-size: 15px; color: var(--dim); }
.row__pick[data-picked="true"] { color: var(--signal); }

/* ---- pin ------------------------------------------------------------ */

.row__pin {
  align-self: center;
  flex: none;
  padding: 2px 4px;
  font-size: 13px;
  line-height: 1;
  border-radius: 6px;
  /* Hidden until the row is hovered or focused; greyed until pinned. */
  opacity: 0;
  filter: grayscale(1);
  transition: opacity 120ms ease, filter 120ms ease;
}

.row:hover .row__pin,
.row:focus-within .row__pin { opacity: 0.55; }

.row .row__pin:hover,
.row__pin:focus-visible { opacity: 1; }

/* A pinned group keeps its pin lit at all times, so its state is never hidden. */
.row[data-pinned="true"] .row__pin {
  opacity: 1;
  filter: none;
}

/* ---- need-attention flag ------------------------------------------- */

.row__attn {
  align-self: center;
  flex: none;
  padding: 2px 4px;
  font-size: 13px;
  line-height: 1;
  border-radius: 6px;
  /* Hidden until the row is hovered or focused; greyed until flagged. */
  opacity: 0;
  filter: grayscale(1);
  transition: opacity 120ms ease, filter 120ms ease;
}

.row:hover .row__attn,
.row:focus-within .row__attn { opacity: 0.55; }

.row .row__attn:hover,
.row__attn:focus-visible { opacity: 1; }

/* A flagged group keeps its bell lit at all times. */
.row[data-attn="true"] .row__attn {
  opacity: 1;
  filter: none;
}

/* ---- pinned section ------------------------------------------------- */

.section-label {
  padding: 10px 16px 6px;
  font-size: 10.5px;
  font-weight: 650;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--dim);
}

.section-divider {
  height: 1px;
  margin: 5px 12px;
  background: var(--hairline);
}

/* ---- case tracking: row chip ---------------------------------------- */

.case-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  flex: none;
  align-self: center;
  max-width: 96px;
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 10.5px;
  font-weight: 600;
  color: var(--text);
  background: color-mix(in srgb, var(--chip-color, var(--dim)) 18%, var(--raised));
  border: 1px solid color-mix(in srgb, var(--chip-color, var(--dim)) 35%, transparent);
  cursor: pointer;
  white-space: nowrap;
}

.case-chip__dot {
  flex: none;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--chip-color, var(--dim));
}

.case-chip__label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.case-chip--none { color: var(--dim); }
.case-chip--done { opacity: 0.75; }

.row:hover .case-chip {
  border-color: color-mix(in srgb, var(--chip-color, var(--dim)) 55%, transparent);
}

/* +track affordance: hidden until the row is hovered/focused, like the pin */
.case-chip--add {
  background: none;
  border: 1px dashed var(--hairline);
  color: var(--dim);
  opacity: 0;
  transition: opacity 120ms ease;
}

.row:hover .case-chip--add,
.row:focus-within .case-chip--add { opacity: 0.55; }
.case-chip--add:hover,
.case-chip--add:focus-visible { opacity: 1; }

/* In the Need Attention tab the +track affordance is the primary action, so it
   stays visible rather than waiting for a hover. */
.case-chip--add.case-chip--shown { opacity: 0.85; }

/* ---- case tracking: detail sheet ------------------------------------ */

.case-sheet {
  position: absolute;
  inset: auto 0 0;
  max-height: 92vh;
  overflow-y: auto;
  padding: 14px 16px 16px;
  background: var(--ground);
  border-top: 1px solid var(--hairline);
  box-shadow: 0 -8px 24px rgb(0 0 0 / 0.3);
}

.field { margin-top: 12px; }

.field__label {
  display: block;
  margin-bottom: 5px;
  font-size: 11px;
  font-weight: 550;
  color: var(--dim);
}

.case-status { display: flex; align-items: center; gap: 8px; }

.case-status__swatch {
  flex: none;
  width: 12px;
  height: 12px;
  border-radius: 3px;
  background: var(--chip-color, transparent);
  border: 1px solid var(--hairline);
}

.case-status__select {
  flex: 1;
  padding: 7px 10px;
  font: inherit;
  font-size: 13px;
  color: var(--text);
  background: var(--raised);
  border: 1px solid var(--hairline);
  border-radius: 6px;
  color-scheme: dark;
}

.case-form {
  padding-bottom: 14px;
  margin-bottom: 12px;
  border-bottom: 1px solid var(--hairline);
}

.case-form > * + * { margin-top: 8px; }

.case-form__title { font-size: 12px; font-weight: 600; color: var(--text); }

.case-link__input,
.case-note {
  width: 100%;
  padding: 7px 10px;
  font: inherit;
  font-size: 12px;
  color: var(--text);
  background: var(--raised);
  border: 1px solid var(--hairline);
  border-radius: 6px;
}

.case-note { height: 60px; line-height: 1.5; resize: vertical; }

.case-link__input--invalid { border-color: var(--alarm); }
.case-link__hint { font-size: 11px; color: var(--alarm); }
.case-form__hint { font-size: 11px; color: var(--alarm); }

.case-form__actions { display: flex; }
.case-form__actions button {
  flex: 1;
  padding: 8px 10px;
  font-size: 12px;
  border-radius: 6px;
  border: 1px solid var(--hairline);
  background: var(--raised);
  color: var(--text);
}
.case-form__actions button[data-primary="true"] {
  background: var(--signal);
  border-color: var(--signal);
  color: #1a1205;
  font-weight: 600;
}

/* ---- case tracking: progress timeline ------------------------------- */

.timeline { margin-top: 6px; max-height: 40vh; overflow-y: auto; }

.timeline__empty { padding: 6px 0; color: var(--dim); font-size: 12px; font-style: italic; }

.timeline__item {
  padding: 9px 0;
  border-bottom: 1px solid var(--hairline);
}
.timeline__item:last-child { border-bottom: 0; }

.timeline__head { display: flex; align-items: center; gap: 8px; }

.timeline__status {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 600;
  color: var(--text);
  background: color-mix(in srgb, var(--chip-color, var(--dim)) 18%, var(--raised));
}
.timeline__status--none { color: var(--dim); }

.timeline__time { flex: 1; font-size: 10.5px; color: var(--dim); font-variant-numeric: tabular-nums; }

.timeline__del {
  flex: none;
  padding: 0 6px;
  font-size: 15px;
  line-height: 1;
  color: var(--dim);
}
.timeline__del:hover { color: var(--alarm); }

.timeline__link {
  display: inline-block;
  margin-top: 5px;
  font-size: 11.5px;
  color: var(--signal);
  text-decoration: none;
}
.timeline__link:hover { text-decoration: underline; }

.timeline__note {
  margin-top: 4px;
  font-size: 12px;
  color: var(--text);
  line-height: 1.45;
  white-space: pre-wrap;
  word-break: break-word;
}

.sheet__actions button.danger { color: var(--alarm); }

@media (prefers-reduced-motion: reduce) {
  .case-chip--add { transition: none; }
}

/* ---- states --------------------------------------------------------- */

.notice {
  margin: 12px;
  padding: 10px 12px;
  border-radius: 6px;
  background: var(--raised);
  border-left: 3px solid var(--alarm);
  font-size: 12px;
  line-height: 1.45;
}

.empty { padding: 28px 20px; color: var(--dim); font-size: 12.5px; line-height: 1.5; }

.toast {
  position: absolute;
  left: 12px;
  right: 12px;
  bottom: 12px;
  padding: 9px 12px;
  border-radius: 6px;
  background: var(--raised);
  border: 1px solid var(--hairline);
  font-size: 12px;
}
`;
