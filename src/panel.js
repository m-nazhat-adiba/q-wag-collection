/**
 * The drawer. Lives in a shadow root so the host page's stylesheet cannot reach it.
 *
 * Every piece of text from the API is written with textContent, never
 * innerHTML: group names and message bodies are authored by people outside
 * this company, and a group named with a script tag must stay a group named
 * with a script tag.
 *
 * Message previews are rendered straight from the in-memory response and are
 * never handed to the caller for storage.
 */

import { PANEL_CSS } from './panel.css.js';
import { DEFAULT_STATUS_DEFS, getChip, isValidHex, sanitizeUrl, statusMeta } from './tracking.js';

const HOST_ID = 'wag-inbox-root';

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function relativeTime(ts) {
  const minutes = Math.round((Date.now() - ts) / 60000);
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}

function preview(group) {
  const who = group.last_from_me ? 'You' : (group.last_sender ?? 'Unknown');
  const body = (group.last_body ?? '').replace(/\s+/g, ' ').trim();
  return body ? `${who}: ${body}` : who;
}

export function createPanel({
  onOpenGroup, onTogglePick, onTogglePin, onToggleAttention,
  onAddProgress, onDeleteEntry, onClearCase,
  onExport, onImportText, onApplyImport, onOpenSettings,
}) {
  document.getElementById(HOST_ID)?.remove();

  const host = el('div');
  host.id = HOST_ID;
  const root = host.attachShadow({ mode: 'open' });
  root.appendChild(el('style', null, PANEL_CSS));
  document.documentElement.appendChild(host);

  let tab = 'inbox';
  let query = '';
  let open = false;
  let latest = null;
  /** The tracking overlay from the last render, keyed by group_id. */
  let tracking = {};
  /** The status set in force (user's own, or the built-in default). */
  let statusDefs = DEFAULT_STATUS_DEFS;
  /** The group whose case sheet is currently open, or null. */
  let caseGroup = null;

  const recordFor = (groupId) => tracking[groupId] ?? null;

  // --- chrome ---------------------------------------------------------

  const launcher = el('button', 'launcher');
  const launcherCount = el('span', 'launcher__count', '0');
  launcher.append(el('span', null, 'Groups'), launcherCount);
  launcher.addEventListener('click', () => setOpen(true));

  const drawer = el('div', 'drawer');
  drawer.dataset.open = 'false';
  drawer.setAttribute('role', 'complementary');
  drawer.setAttribute('aria-label', 'Assigned group inbox');

  const header = el('div', 'header');
  const meta = el('span', 'header__meta', 'Checking...');
  const close = el('button', 'header__close', '×');
  close.setAttribute('aria-label', 'Close inbox');
  close.addEventListener('click', () => setOpen(false));
  header.append(el('span', 'header__title', 'Your groups'), meta, close);

  const tabs = el('div', 'tabs');
  const inboxTab = el('button', 'tab', 'Inbox');
  const attTab = el('button', 'tab', 'Need Attention');
  const allTab = el('button', 'tab', 'All groups');
  for (const [name, button] of [['inbox', inboxTab], ['att', attTab], ['all', allTab]]) {
    button.setAttribute('role', 'tab');
    button.addEventListener('click', () => {
      tab = name;
      query = '';
      search.value = '';
      closeSheet();
      closeCase();
      render(latest);
    });
  }
  tabs.append(inboxTab, attTab, allTab);

  const search = el('input', 'search');
  search.type = 'search';
  search.placeholder = 'Filter by name';
  search.addEventListener('input', () => {
    query = search.value.trim().toLowerCase();
    render(latest);
  });

  const list = el('div', 'list');

  // --- export and import ----------------------------------------------

  const toolbar = el('div', 'toolbar');
  const exportButton = el('button', null, 'Export picks');
  const importButton = el('button', null, 'Import picks');
  toolbar.append(exportButton, importButton);

  const fileInput = el('input');
  fileInput.type = 'file';
  fileInput.accept = '.json,.csv,.txt,application/json,text/csv,text/plain';
  fileInput.hidden = true;

  const sheet = el('div', 'sheet');
  sheet.hidden = true;

  const sheetInput = el('textarea');
  sheetInput.placeholder = 'Acme Freight <> Support\nNorthwind Retail';

  const summary = el('div', 'summary');
  summary.hidden = true;

  const chooseButton = el('button', null, 'Choose file');
  const checkButton = el('button', null, 'Check list');
  const cancelButton = el('button', null, 'Cancel');
  const firstActions = el('div', 'sheet__actions');
  firstActions.append(chooseButton, checkButton, cancelButton);

  const replaceButton = el('button', null, 'Replace my picks');
  const mergeButton = el('button', null, 'Add to my picks');
  mergeButton.dataset.primary = 'true';
  const applyActions = el('div', 'sheet__actions');
  applyActions.hidden = true;
  applyActions.append(mergeButton, replaceButton);

  sheet.append(
    el('div', 'sheet__title', 'Import picks'),
    el('div', 'sheet__hint',
      'Paste group names or ids, one per line, or choose a file you exported earlier. A CSV pasted from a spreadsheet works too.'),
    sheetInput,
    firstActions,
    summary,
    applyActions,
    fileInput,
  );

  exportButton.addEventListener('click', () => onExport());
  importButton.addEventListener('click', () => openSheet());
  cancelButton.addEventListener('click', () => closeSheet());
  chooseButton.addEventListener('click', () => fileInput.click());
  checkButton.addEventListener('click', () => check());
  mergeButton.addEventListener('click', () => apply('merge'));
  replaceButton.addEventListener('click', () => apply('replace'));

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    sheetInput.value = await file.text();
    fileInput.value = '';
    check();
  });

  function openSheet() {
    closeCase();
    sheetInput.value = '';
    summary.hidden = true;
    applyActions.hidden = true;
    sheet.hidden = false;
    sheetInput.focus();
  }

  function closeSheet() {
    sheet.hidden = true;
  }

  function reportProblem(text) {
    summary.replaceChildren(el('div', null, text));
    summary.hidden = false;
    applyActions.hidden = true;
  }

  async function check() {
    const text = sheetInput.value.trim();
    if (!text) {
      reportProblem('Paste a list, or choose a file first.');
      return;
    }

    let result;
    try {
      result = await onImportText(text);
    } catch (error) {
      reportProblem(error.message);
      return;
    }

    const { matched, alreadyPicked, unmatched } = result;
    summary.replaceChildren(
      el('div', null,
        `${matched.length} to add. ${alreadyPicked.length} already picked. ${unmatched.length} not matched.`),
    );

    if (unmatched.length) {
      summary.append(
        el('div', 'summary__unmatched', `Not found: ${unmatched.join(', ')}`),
      );
    }

    summary.hidden = false;
    applyActions.hidden = !(matched.length || alreadyPicked.length);
  }

  async function apply(mode) {
    const count = await onApplyImport(mode);
    closeSheet();
    toast(mode === 'replace'
      ? `Your picks are now the imported ${count} groups.`
      : `Added to your picks. ${count} groups now.`);
  }

  // --- case tracking sheet --------------------------------------------

  const caseSheet = el('div', 'case-sheet');
  caseSheet.hidden = true;
  caseSheet.setAttribute('role', 'dialog');
  caseSheet.setAttribute('aria-label', 'Case tracking');

  const caseTitle = el('div', 'sheet__title', 'Case');

  // --- add-progress form ---------------------------------------------

  const form = el('div', 'case-form');
  form.append(el('div', 'case-form__title', 'Add progress'));

  const statusRow = el('div', 'case-status');
  const statusSwatch = el('span', 'case-status__swatch');
  const statusSelect = el('select', 'case-status__select');
  statusSelect.setAttribute('aria-label', 'Status');
  statusRow.append(statusSwatch, statusSelect);

  const linkInput = el('input', 'case-link__input');
  linkInput.type = 'url';
  linkInput.placeholder = 'Escalation thread link (optional)';
  linkInput.setAttribute('aria-label', 'Escalation link');
  const linkHint = el('div', 'case-link__hint');
  linkHint.hidden = true;

  const noteInput = el('textarea', 'case-note');
  noteInput.placeholder = 'Note (optional)';
  noteInput.setAttribute('aria-label', 'Note');

  const addBtn = el('button', null, 'Add progress');
  addBtn.dataset.primary = 'true';
  const formHint = el('div', 'case-form__hint');
  formHint.hidden = true;
  const formActions = el('div', 'case-form__actions');
  formActions.append(addBtn);

  form.append(statusRow, linkInput, linkHint, noteInput, formHint, formActions);

  // --- timeline of saved steps ---------------------------------------

  const timeline = el('div', 'timeline');

  const clearBtn = el('button', 'danger', 'Clear all');
  const closeCaseBtn = el('button', null, 'Close');
  const caseActions = el('div', 'sheet__actions');
  caseActions.append(clearBtn, closeCaseBtn);

  caseSheet.append(caseTitle, form, el('div', 'field__label', 'Progress'), timeline, caseActions);

  // Rebuilt from the current status set each time the sheet opens, so an edit on
  // the options page is reflected without recreating the panel.
  function rebuildStatusOptions() {
    const keep = statusSelect.value;
    statusSelect.replaceChildren();
    const none = el('option', null, '— pick status —');
    none.value = '';
    statusSelect.append(none);
    for (const def of statusDefs) {
      const opt = el('option', null, def.label);
      opt.value = def.id;
      statusSelect.append(opt);
    }
    statusSelect.value = keep;
  }

  function applySwatch(elm, color) {
    if (color && isValidHex(color)) elm.style.setProperty('--chip-color', color);
    else elm.style.removeProperty('--chip-color');
  }

  function updateFormSwatch() {
    const meta = statusMeta(statusSelect.value || null, statusDefs);
    applySwatch(statusSwatch, meta?.color ?? null);
  }
  statusSelect.addEventListener('change', () => updateFormSwatch());

  function refreshLinkField() {
    const raw = linkInput.value.trim();
    const bad = raw && !sanitizeUrl(raw);
    linkInput.classList.toggle('case-link__input--invalid', Boolean(bad));
    if (bad) linkHint.textContent = 'Not a valid link — must start with https://';
    linkHint.hidden = !bad;
    return !bad;
  }
  linkInput.addEventListener('input', () => refreshLinkField());

  function resetForm() {
    statusSelect.value = '';
    updateFormSwatch();
    linkInput.value = '';
    noteInput.value = '';
    linkHint.hidden = true;
    linkInput.classList.remove('case-link__input--invalid');
    formHint.hidden = true;
  }

  function entryRow(groupId, entry) {
    const row = el('div', 'timeline__item');

    const head = el('div', 'timeline__head');
    const meta = statusMeta(entry.status, statusDefs);
    const badge = el('span', 'timeline__status');
    if (meta) {
      applySwatch(badge, meta.color);
      badge.append(el('span', 'case-chip__dot'), el('span', null, meta.label));
    } else {
      badge.classList.add('timeline__status--none');
      badge.textContent = 'No status';
    }
    const time = el('span', 'timeline__time', `${relativeTime(entry.at)} ago`);
    const del = el('button', 'timeline__del', '×');
    del.setAttribute('aria-label', 'Delete this progress step');
    del.title = 'Delete';
    del.addEventListener('click', async () => {
      await onDeleteEntry(groupId, entry.id);
      refreshTimeline();
    });
    head.append(badge, time, del);
    row.append(head);

    // The link was sanitized at write time; re-check before it becomes an href.
    const safe = sanitizeUrl(entry.link);
    if (safe) {
      const a = el('a', 'timeline__link', 'thread ↗');
      a.href = safe;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      row.append(a);
    }
    if (entry.note) row.append(el('div', 'timeline__note', entry.note));
    return row;
  }

  function renderTimeline(groupId, record) {
    timeline.replaceChildren();
    const entries = record?.entries ?? [];
    if (!entries.length) {
      timeline.append(el('div', 'timeline__empty', 'No progress yet. Add the first step above.'));
      return;
    }
    for (const entry of [...entries].reverse()) timeline.append(entryRow(groupId, entry));
  }

  // Re-read the canonical record after a save/delete round-trips through storage.
  function refreshTimeline() {
    if (!caseGroup) return;
    const record = recordFor(caseGroup.group_id);
    renderTimeline(caseGroup.group_id, record);
    clearBtn.hidden = !record;
  }

  function openCase(group) {
    caseGroup = group;
    closeSheet();
    caseTitle.textContent = group.group_name;
    rebuildStatusOptions();
    resetForm();
    clearBtn.textContent = 'Clear all';
    clearBtn.dataset.armed = 'false';
    refreshTimeline();
    caseSheet.hidden = false;
    statusSelect.focus();
  }

  function closeCase() {
    caseSheet.hidden = true;
    caseGroup = null;
  }

  addBtn.addEventListener('click', async () => {
    if (!caseGroup) return;
    if (!refreshLinkField()) return; // invalid link, hint already shown
    const status = statusSelect.value || null;
    const note = noteInput.value.trim();
    const link = linkInput.value.trim();
    if (!status && !note && !link) {
      formHint.textContent = 'Pick a status, or write a note or link, first.';
      formHint.hidden = false;
      return;
    }
    await onAddProgress(caseGroup.group_id, { status, link, note });
    resetForm();
    refreshTimeline();
    toast('Progress added.');
  });

  // Two-click confirm so a mis-click can't wipe a case's whole log.
  clearBtn.addEventListener('click', async () => {
    if (!caseGroup) return;
    if (clearBtn.dataset.armed !== 'true') {
      clearBtn.dataset.armed = 'true';
      clearBtn.textContent = 'Sure? Clear all';
      setTimeout(() => {
        clearBtn.dataset.armed = 'false';
        clearBtn.textContent = 'Clear all';
      }, 3000);
      return;
    }
    await onClearCase(caseGroup.group_id);
    closeCase();
    toast('Tracking cleared.');
  });

  closeCaseBtn.addEventListener('click', () => closeCase());

  function caseChip(group, forceVisible = false) {
    const record = recordFor(group.group_id);
    const chip = getChip(record, statusDefs);

    if (!chip) {
      const add = el('span', 'case-chip case-chip--add', '＋ track');
      if (forceVisible) add.classList.add('case-chip--shown');
      add.tabIndex = 0;
      add.setAttribute('role', 'button');
      add.setAttribute('aria-label', 'Add case tracking');
      add.title = 'Track this case';
      wireChipOpen(add, group);
      return add;
    }

    const pill = el('span', 'case-chip');
    if (!chip.hasStatus) pill.classList.add('case-chip--none');
    if (chip.terminal) pill.classList.add('case-chip--done');
    applySwatch(pill, chip.color);
    pill.append(el('span', 'case-chip__dot'), el('span', 'case-chip__label', chip.label));
    pill.tabIndex = 0;
    pill.setAttribute('role', 'button');
    pill.setAttribute('aria-label', `Status: ${chip.label}. Edit case.`);
    pill.title = chip.label;
    wireChipOpen(pill, group);
    return pill;
  }

  function wireChipOpen(elm, group) {
    const openIt = (event) => {
      event.stopPropagation();
      openCase(group);
    };
    elm.addEventListener('click', openIt);
    elm.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      openIt(event);
    });
  }

  drawer.append(header, tabs, toolbar, search, list, sheet, caseSheet);
  root.append(launcher, drawer);

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    if (!caseSheet.hidden) closeCase();
    else if (!sheet.hidden) closeSheet();
    else if (open) setOpen(false);
  });

  function setOpen(next) {
    open = next;
    drawer.dataset.open = String(next);
    launcher.style.display = next ? 'none' : '';
    if (next) search.focus();
  }

  // --- rows -----------------------------------------------------------

  /**
   * A small in-row toggle rendered as a span (a real button nested in the row
   * button would be invalid markup). `glyph` is the icon, `on` its lit state,
   * and stopPropagation keeps the toggle from also opening the group.
   */
  function rowToggle(className, glyph, { on, labelOn, labelOff, onToggle }) {
    const node = el('span', className, glyph);
    node.tabIndex = 0;
    node.setAttribute('role', 'button');
    node.setAttribute('aria-pressed', String(Boolean(on)));
    const label = on ? labelOn : labelOff;
    node.setAttribute('aria-label', label);
    node.title = label;
    const fire = (event) => {
      event.stopPropagation();
      onToggle();
    };
    node.addEventListener('click', fire);
    node.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      fire(event);
    });
    return node;
  }

  function inboxRow(group, { withCase = false } = {}) {
    const row = el('button', 'row');
    row.dataset.unread = String(group.unread > 0);
    row.dataset.pinned = String(Boolean(group.pinned));
    row.dataset.attn = String(Boolean(group.attention));

    const body = el('div', 'row__body');
    body.append(
      el('div', 'row__name', group.group_name),
      el('div', 'row__preview', preview(group)),
    );

    const aside = el('div', 'row__aside');
    aside.append(
      el('span', 'row__count', String(group.unread)),
      el('span', 'row__time', relativeTime(group.last_ts)),
    );

    const attn = rowToggle('row__attn', '\u{1F514}', {
      on: group.attention,
      labelOn: 'Remove from Need Attention',
      labelOff: 'Mark as needing attention',
      onToggle: () => onToggleAttention(group.group_id),
    });

    const pin = rowToggle('row__pin', '\u{1F4CC}', {
      on: group.pinned,
      labelOn: 'Unpin this group',
      labelOff: 'Pin this group',
      onToggle: () => onTogglePin(group.group_id),
    });

    // The track chip lives only in the Need Attention tab; the plain inbox row
    // carries just the flag and the pin.
    const middle = withCase ? [caseChip(group, true)] : [];
    row.append(body, ...middle, aside, attn, pin);
    row.addEventListener('click', () => onOpenGroup(group));
    return row;
  }

  function missingRow(groupId, { withCase = false } = {}) {
    const row = el('button', 'row');
    row.dataset.unread = 'false';
    row.dataset.missing = 'true';

    const record = recordFor(groupId);
    const preview = record && withCase
      ? 'Tracked, but no longer in the list. Click to remove.'
      : 'No longer in the list. Click to remove.';
    const body = el('div', 'row__body');
    body.append(
      el('div', 'row__name', groupId),
      el('div', 'row__preview', preview),
    );

    // A flagged group that fell out of the server list keeps its case; in the
    // Need Attention tab still show/open it so it can be wrapped up or removed.
    const chip = withCase && record
      ? caseChip({ group_id: groupId, group_name: groupId }, true)
      : el('span');
    row.append(body, chip);
    row.addEventListener('click', () => onTogglePick(groupId));
    return row;
  }

  function pickRow(group, picked) {
    const row = el('button', 'row');
    row.dataset.unread = 'false';

    const body = el('div', 'row__body');
    body.append(
      el('div', 'row__name', group.group_name),
      el('div', 'row__preview', `${group.new_count} messages, last ${relativeTime(group.last_ts)} ago`),
    );

    const pick = el('span', 'row__pick', picked ? '✓' : '+');
    pick.dataset.picked = String(picked);

    row.append(body, pick);
    row.setAttribute('aria-pressed', String(picked));
    row.addEventListener('click', () => onTogglePick(group.group_id));
    return row;
  }

  function matches(name) {
    return !query || name.toLowerCase().includes(query);
  }

  // --- render ---------------------------------------------------------

  function render(state) {
    if (!state) return;
    latest = state;
    tracking = state.tracking ?? {};
    statusDefs = state.statusDefs ?? DEFAULT_STATUS_DEFS;
    // Keep an open sheet's dropdown in step with a status set edited meanwhile.
    if (!caseSheet.hidden) rebuildStatusOptions();

    launcherCount.textContent = String(state.totalUnread);
    launcher.dataset.unread = String(state.totalUnread);
    launcher.setAttribute('aria-label', `Open group inbox, ${state.totalUnread} unread`);

    inboxTab.setAttribute('aria-selected', String(tab === 'inbox'));
    attTab.setAttribute('aria-selected', String(tab === 'att'));
    allTab.setAttribute('aria-selected', String(tab === 'all'));
    // Picking, exporting and importing are all the same job, so they share a tab.
    toolbar.hidden = tab !== 'all';
    meta.textContent = state.lastSuccess
      ? `Checked ${relativeTime(state.lastSuccess)} ago`
      : 'Checking...';

    list.replaceChildren();

    if (state.status === 'unconfigured') {
      const notice = el('div', 'notice',
        'This extension does not know where your chat list comes from yet.');
      const open = el('button', null, 'Open settings');
      open.addEventListener('click', () => onOpenSettings());
      const actions = el('div', 'sheet__actions');
      actions.append(open);
      list.append(notice, actions);
      return;
    }

    if (state.status === 'expired') {
      list.append(el('div', 'notice',
        'Your session expired. Reload this page to sign back in. Checking is paused until you do.'));
      return;
    }

    if (state.status === 'shape') {
      list.append(el('div', 'notice',
        "The group list came back in a shape this extension doesn't recognise. Showing the last list that worked."));
    }

    if (state.status === 'error') {
      list.append(el('div', 'notice',
        `Couldn't reach the server: ${state.message ?? 'network error'}. Retrying.`));
    }

    if (tab === 'all') {
      const picked = new Set(state.allowlist);
      const visible = state.allGroups.filter((g) => matches(g.group_name));
      if (!visible.length) {
        list.append(el('div', 'empty', 'No groups match that filter.'));
        return;
      }
      for (const group of visible) list.append(pickRow(group, picked.has(group.group_id)));
      return;
    }

    if (tab === 'att') {
      const flagged = new Set(state.attention ?? []);
      const rows = state.rows.filter((g) => g.attention && matches(g.group_name));
      // A flagged group that dropped out of the server list still shows here, so
      // its case can be finished or the flag removed.
      const missing = state.missing.filter((id) => flagged.has(id));

      if (!rows.length && !missing.length) {
        list.append(el('div', 'empty', query
          ? 'No flagged groups match that filter.'
          : 'Nothing needs attention yet. In Inbox, tap the \u{1F514} on a group to add it here, then track its progress.'));
        return;
      }

      for (const group of rows) list.append(inboxRow(group, { withCase: true }));
      for (const groupId of missing) list.append(missingRow(groupId, { withCase: true }));
      return;
    }

    if (!state.allowlist.length) {
      list.append(el('div', 'empty',
        'No groups picked yet. Open All groups and choose the ones assigned to you.'));
      return;
    }

    const visible = state.rows.filter((g) => matches(g.group_name));

    if (!visible.length && !state.missing.length) {
      list.append(el('div', 'empty', 'No groups match that filter.'));
      return;
    }

    // rows arrive pinned-first, so a straight partition keeps each half's order.
    const pinnedRows = visible.filter((g) => g.pinned);
    const restRows = visible.filter((g) => !g.pinned);

    if (pinnedRows.length) {
      list.append(el('div', 'section-label', 'Pinned'));
      for (const group of pinnedRows) list.append(inboxRow(group));
      if (restRows.length) list.append(el('div', 'section-divider'));
    }

    for (const group of restRows) list.append(inboxRow(group));
    for (const groupId of state.missing) list.append(missingRow(groupId));
  }

  /**
   * Rendered without touching storage or the callbacks, because by this point
   * every chrome API in this page throws.
   */
  function renderDisconnected() {
    meta.textContent = 'Disconnected';
    launcherCount.textContent = '-';
    launcher.dataset.unread = '0';
    list.replaceChildren(el('div', 'notice',
      'The extension was reloaded or updated, so this page lost touch with it. Reload the page to reconnect. Your picks are safe.'));
  }

  function toast(message) {
    root.querySelector('.toast')?.remove();
    const node = el('div', 'toast', message);
    drawer.append(node);
    setTimeout(() => node.remove(), 4000);
  }

  return { render, toast, setOpen, renderDisconnected };
}
