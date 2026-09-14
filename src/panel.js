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
  onOpenGroup, onTogglePick, onExport, onImportText, onApplyImport, onOpenSettings,
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
  const allTab = el('button', 'tab', 'All groups');
  for (const [name, button] of [['inbox', inboxTab], ['all', allTab]]) {
    button.setAttribute('role', 'tab');
    button.addEventListener('click', () => {
      tab = name;
      query = '';
      search.value = '';
      closeSheet();
      render(latest);
    });
  }
  tabs.append(inboxTab, allTab);

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

  drawer.append(header, tabs, toolbar, search, list, sheet);
  root.append(launcher, drawer);

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    if (!sheet.hidden) closeSheet();
    else if (open) setOpen(false);
  });

  function setOpen(next) {
    open = next;
    drawer.dataset.open = String(next);
    launcher.style.display = next ? 'none' : '';
    if (next) search.focus();
  }

  // --- rows -----------------------------------------------------------

  function inboxRow(group) {
    const row = el('button', 'row');
    row.dataset.unread = String(group.unread > 0);

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

    row.append(body, aside);
    row.addEventListener('click', () => onOpenGroup(group));
    return row;
  }

  function missingRow(groupId) {
    const row = el('button', 'row');
    row.dataset.unread = 'false';
    row.dataset.missing = 'true';

    const body = el('div', 'row__body');
    body.append(
      el('div', 'row__name', groupId),
      el('div', 'row__preview', 'No longer in the list. Click to remove.'),
    );

    row.append(body);
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

    launcherCount.textContent = String(state.totalUnread);
    launcher.dataset.unread = String(state.totalUnread);
    launcher.setAttribute('aria-label', `Open group inbox, ${state.totalUnread} unread`);

    inboxTab.setAttribute('aria-selected', String(tab === 'inbox'));
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

    for (const group of visible) list.append(inboxRow(group));
    for (const groupId of state.missing) list.append(missingRow(groupId));
  }

  function toast(message) {
    root.querySelector('.toast')?.remove();
    const node = el('div', 'toast', message);
    drawer.append(node);
    setTimeout(() => node.remove(), 4000);
  }

  return { render, toast, setOpen };
}
