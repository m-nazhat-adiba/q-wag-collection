(() => {
  // src/api.js
  var DEFAULT_POLL_MS = 3e4;
  var MAX_BACKOFF_MS = 12e4;
  function classifyStatus(status2) {
    if (status2 === 200) return "ok";
    if (status2 === 304) return "unchanged";
    if (status2 === 401 || status2 === 403) return "expired";
    return "error";
  }
  function nextBackoff(currentMs) {
    const doubled = currentMs * 2;
    return Math.min(MAX_BACKOFF_MS, Math.max(DEFAULT_POLL_MS, doubled));
  }
  async function fetchChats(endpoint, etag2) {
    if (!endpoint) return { outcome: "unconfigured" };
    const headers = { accept: "*/*" };
    if (etag2) headers["if-none-match"] = etag2;
    let response;
    try {
      response = await fetch(endpoint, {
        credentials: "include",
        headers,
        cache: "no-store"
      });
    } catch (cause) {
      return { outcome: "error", reason: cause?.message ?? "network failure" };
    }
    const outcome = classifyStatus(response.status);
    if (outcome !== "ok") {
      return { outcome, reason: `HTTP ${response.status}` };
    }
    try {
      return {
        outcome: "ok",
        groups: await response.json(),
        etag: response.headers.get("etag") ?? null
      };
    } catch {
      return { outcome: "error", reason: "response was not valid JSON" };
    }
  }

  // src/diff.js
  var REQUIRED_FIELDS = ["group_id", "group_name", "new_count", "last_ts"];
  var ShapeError = class extends Error {
    constructor(message2) {
      super(`Unexpected API shape: ${message2}`);
      this.name = "ShapeError";
    }
  };
  function assertShape(groups) {
    if (!Array.isArray(groups)) {
      throw new ShapeError("expected an array of groups");
    }
    for (const group of groups) {
      for (const field of REQUIRED_FIELDS) {
        if (group?.[field] === void 0) {
          throw new ShapeError(`entry is missing "${field}"`);
        }
      }
    }
  }
  function filterAllowlist(groups, allowlist) {
    const wanted = new Set(allowlist);
    return groups.filter((group) => wanted.has(group.group_id));
  }
  function computeUnread(group, baseline) {
    const seen = baseline[group.group_id];
    if (!seen) return group.new_count;
    return Math.max(0, group.new_count - seen.count);
  }
  function sortByRecent(items) {
    return [...items].sort((a, b) => {
      const unreadRank = (b.unread > 0) - (a.unread > 0);
      if (unreadRank !== 0) return unreadRank;
      return b.last_ts - a.last_ts;
    });
  }
  function markRead(baseline, group) {
    return {
      ...baseline,
      [group.group_id]: { count: group.new_count, ts: group.last_ts }
    };
  }
  function buildInbox(groups, allowlist, baseline) {
    assertShape(groups);
    const mine = filterAllowlist(groups, allowlist);
    const rows = sortByRecent(
      mine.map((group) => ({ ...group, unread: computeUnread(group, baseline) }))
    );
    const present = new Set(mine.map((group) => group.group_id));
    const missing = allowlist.filter((id) => !present.has(id));
    const totalUnread = rows.reduce((sum, row) => sum + row.unread, 0);
    return { rows, missing, totalUnread };
  }

  // src/selectors.js
  var GROUP_ID_ATTRIBUTES = [
    "data-group-id",
    "data-chat-id",
    "data-jid",
    "data-id"
  ];
  var SEARCH_INPUT_SELECTORS = [
    'input[type="search"]',
    'input[placeholder*="search" i]',
    'input[placeholder*="cari" i]',
    'input[aria-label*="search" i]'
  ];
  var CHAT_ROW_SELECTORS = [
    "[data-group-id]",
    '[role="listitem"]',
    '[role="option"]',
    "li",
    '[class*="chat-item" i]',
    '[class*="conversation" i]'
  ];
  var STRATEGY_ORDER = ["byId", "viaSearch", "byText"];
  var SEARCH_SETTLE_MS = 400;

  // src/navigate.js
  var cachedStrategy = null;
  var delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  function firstMatch(selectors) {
    for (const selector of selectors) {
      const el2 = document.querySelector(selector);
      if (el2) return el2;
    }
    return null;
  }
  function clickable(el2) {
    return el2.closest('a, button, [role="button"], [role="option"], [role="listitem"]') ?? el2;
  }
  function byId(group) {
    for (const attribute of GROUP_ID_ATTRIBUTES) {
      const el2 = document.querySelector(`[${attribute}="${CSS.escape(group.group_id)}"]`);
      if (el2) return clickable(el2);
    }
    return null;
  }
  function byText(group) {
    const needle = group.group_name.trim().toLowerCase();
    for (const selector of CHAT_ROW_SELECTORS) {
      for (const el2 of document.querySelectorAll(selector)) {
        if (el2.textContent?.trim().toLowerCase().includes(needle)) {
          return clickable(el2);
        }
      }
    }
    return null;
  }
  function setReactInputValue(input, value) {
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value"
    )?.set;
    setter ? setter.call(input, value) : input.value = value;
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }
  async function viaSearch(group) {
    const input = firstMatch(SEARCH_INPUT_SELECTORS);
    if (!input) return null;
    input.focus();
    setReactInputValue(input, group.group_name);
    await delay(SEARCH_SETTLE_MS);
    return byText(group);
  }
  var STRATEGIES = { byId, viaSearch, byText };
  async function openInApp(group) {
    const order = cachedStrategy ? [cachedStrategy, ...STRATEGY_ORDER.filter((s) => s !== cachedStrategy)] : STRATEGY_ORDER;
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
    }
  }

  // src/panel.css.js
  var PANEL_CSS = `
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
  padding: 10px 8px;
  font-size: 12px;
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

  // src/panel.js
  var HOST_ID = "wag-inbox-root";
  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== void 0) node.textContent = text;
    return node;
  }
  function relativeTime(ts) {
    const minutes = Math.round((Date.now() - ts) / 6e4);
    if (minutes < 1) return "now";
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `${hours}h`;
    return `${Math.round(hours / 24)}d`;
  }
  function preview(group) {
    const who = group.last_from_me ? "You" : group.last_sender ?? "Unknown";
    const body = (group.last_body ?? "").replace(/\s+/g, " ").trim();
    return body ? `${who}: ${body}` : who;
  }
  function createPanel({
    onOpenGroup: onOpenGroup2,
    onTogglePick: onTogglePick2,
    onExport: onExport2,
    onImportText: onImportText2,
    onApplyImport: onApplyImport2,
    onOpenSettings: onOpenSettings2
  }) {
    document.getElementById(HOST_ID)?.remove();
    const host = el("div");
    host.id = HOST_ID;
    const root = host.attachShadow({ mode: "open" });
    root.appendChild(el("style", null, PANEL_CSS));
    document.documentElement.appendChild(host);
    let tab = "inbox";
    let query = "";
    let open = false;
    let latest = null;
    const launcher = el("button", "launcher");
    const launcherCount = el("span", "launcher__count", "0");
    launcher.append(el("span", null, "Groups"), launcherCount);
    launcher.addEventListener("click", () => setOpen(true));
    const drawer = el("div", "drawer");
    drawer.dataset.open = "false";
    drawer.setAttribute("role", "complementary");
    drawer.setAttribute("aria-label", "Assigned group inbox");
    const header = el("div", "header");
    const meta = el("span", "header__meta", "Checking...");
    const close = el("button", "header__close", "\xD7");
    close.setAttribute("aria-label", "Close inbox");
    close.addEventListener("click", () => setOpen(false));
    header.append(el("span", "header__title", "Your groups"), meta, close);
    const tabs = el("div", "tabs");
    const inboxTab = el("button", "tab", "Inbox");
    const allTab = el("button", "tab", "All groups");
    for (const [name, button] of [["inbox", inboxTab], ["all", allTab]]) {
      button.setAttribute("role", "tab");
      button.addEventListener("click", () => {
        tab = name;
        query = "";
        search.value = "";
        closeSheet();
        render(latest);
      });
    }
    tabs.append(inboxTab, allTab);
    const search = el("input", "search");
    search.type = "search";
    search.placeholder = "Filter by name";
    search.addEventListener("input", () => {
      query = search.value.trim().toLowerCase();
      render(latest);
    });
    const list = el("div", "list");
    const toolbar = el("div", "toolbar");
    const exportButton = el("button", null, "Export picks");
    const importButton = el("button", null, "Import picks");
    toolbar.append(exportButton, importButton);
    const fileInput = el("input");
    fileInput.type = "file";
    fileInput.accept = ".json,.csv,.txt,application/json,text/csv,text/plain";
    fileInput.hidden = true;
    const sheet = el("div", "sheet");
    sheet.hidden = true;
    const sheetInput = el("textarea");
    sheetInput.placeholder = "Acme Freight <> Support\nNorthwind Retail";
    const summary = el("div", "summary");
    summary.hidden = true;
    const chooseButton = el("button", null, "Choose file");
    const checkButton = el("button", null, "Check list");
    const cancelButton = el("button", null, "Cancel");
    const firstActions = el("div", "sheet__actions");
    firstActions.append(chooseButton, checkButton, cancelButton);
    const replaceButton = el("button", null, "Replace my picks");
    const mergeButton = el("button", null, "Add to my picks");
    mergeButton.dataset.primary = "true";
    const applyActions = el("div", "sheet__actions");
    applyActions.hidden = true;
    applyActions.append(mergeButton, replaceButton);
    sheet.append(
      el("div", "sheet__title", "Import picks"),
      el(
        "div",
        "sheet__hint",
        "Paste group names or ids, one per line, or choose a file you exported earlier. A CSV pasted from a spreadsheet works too."
      ),
      sheetInput,
      firstActions,
      summary,
      applyActions,
      fileInput
    );
    exportButton.addEventListener("click", () => onExport2());
    importButton.addEventListener("click", () => openSheet());
    cancelButton.addEventListener("click", () => closeSheet());
    chooseButton.addEventListener("click", () => fileInput.click());
    checkButton.addEventListener("click", () => check());
    mergeButton.addEventListener("click", () => apply("merge"));
    replaceButton.addEventListener("click", () => apply("replace"));
    fileInput.addEventListener("change", async () => {
      const file = fileInput.files?.[0];
      if (!file) return;
      sheetInput.value = await file.text();
      fileInput.value = "";
      check();
    });
    function openSheet() {
      sheetInput.value = "";
      summary.hidden = true;
      applyActions.hidden = true;
      sheet.hidden = false;
      sheetInput.focus();
    }
    function closeSheet() {
      sheet.hidden = true;
    }
    function reportProblem(text) {
      summary.replaceChildren(el("div", null, text));
      summary.hidden = false;
      applyActions.hidden = true;
    }
    async function check() {
      const text = sheetInput.value.trim();
      if (!text) {
        reportProblem("Paste a list, or choose a file first.");
        return;
      }
      let result;
      try {
        result = await onImportText2(text);
      } catch (error) {
        reportProblem(error.message);
        return;
      }
      const { matched, alreadyPicked, unmatched } = result;
      summary.replaceChildren(
        el(
          "div",
          null,
          `${matched.length} to add. ${alreadyPicked.length} already picked. ${unmatched.length} not matched.`
        )
      );
      if (unmatched.length) {
        summary.append(
          el("div", "summary__unmatched", `Not found: ${unmatched.join(", ")}`)
        );
      }
      summary.hidden = false;
      applyActions.hidden = !(matched.length || alreadyPicked.length);
    }
    async function apply(mode) {
      const count = await onApplyImport2(mode);
      closeSheet();
      toast(mode === "replace" ? `Your picks are now the imported ${count} groups.` : `Added to your picks. ${count} groups now.`);
    }
    drawer.append(header, tabs, toolbar, search, list, sheet);
    root.append(launcher, drawer);
    document.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      if (!sheet.hidden) closeSheet();
      else if (open) setOpen(false);
    });
    function setOpen(next) {
      open = next;
      drawer.dataset.open = String(next);
      launcher.style.display = next ? "none" : "";
      if (next) search.focus();
    }
    function inboxRow(group) {
      const row = el("button", "row");
      row.dataset.unread = String(group.unread > 0);
      const body = el("div", "row__body");
      body.append(
        el("div", "row__name", group.group_name),
        el("div", "row__preview", preview(group))
      );
      const aside = el("div", "row__aside");
      aside.append(
        el("span", "row__count", String(group.unread)),
        el("span", "row__time", relativeTime(group.last_ts))
      );
      row.append(body, aside);
      row.addEventListener("click", () => onOpenGroup2(group));
      return row;
    }
    function missingRow(groupId) {
      const row = el("button", "row");
      row.dataset.unread = "false";
      row.dataset.missing = "true";
      const body = el("div", "row__body");
      body.append(
        el("div", "row__name", groupId),
        el("div", "row__preview", "No longer in the list. Click to remove.")
      );
      row.append(body);
      row.addEventListener("click", () => onTogglePick2(groupId));
      return row;
    }
    function pickRow(group, picked) {
      const row = el("button", "row");
      row.dataset.unread = "false";
      const body = el("div", "row__body");
      body.append(
        el("div", "row__name", group.group_name),
        el("div", "row__preview", `${group.new_count} messages, last ${relativeTime(group.last_ts)} ago`)
      );
      const pick = el("span", "row__pick", picked ? "\u2713" : "+");
      pick.dataset.picked = String(picked);
      row.append(body, pick);
      row.setAttribute("aria-pressed", String(picked));
      row.addEventListener("click", () => onTogglePick2(group.group_id));
      return row;
    }
    function matches(name) {
      return !query || name.toLowerCase().includes(query);
    }
    function render(state) {
      if (!state) return;
      latest = state;
      launcherCount.textContent = String(state.totalUnread);
      launcher.dataset.unread = String(state.totalUnread);
      launcher.setAttribute("aria-label", `Open group inbox, ${state.totalUnread} unread`);
      inboxTab.setAttribute("aria-selected", String(tab === "inbox"));
      allTab.setAttribute("aria-selected", String(tab === "all"));
      toolbar.hidden = tab !== "all";
      meta.textContent = state.lastSuccess ? `Checked ${relativeTime(state.lastSuccess)} ago` : "Checking...";
      list.replaceChildren();
      if (state.status === "unconfigured") {
        const notice = el(
          "div",
          "notice",
          "This extension does not know where your chat list comes from yet."
        );
        const open2 = el("button", null, "Open settings");
        open2.addEventListener("click", () => onOpenSettings2());
        const actions = el("div", "sheet__actions");
        actions.append(open2);
        list.append(notice, actions);
        return;
      }
      if (state.status === "expired") {
        list.append(el(
          "div",
          "notice",
          "Your session expired. Reload this page to sign back in. Checking is paused until you do."
        ));
        return;
      }
      if (state.status === "shape") {
        list.append(el(
          "div",
          "notice",
          "The group list came back in a shape this extension doesn't recognise. Showing the last list that worked."
        ));
      }
      if (state.status === "error") {
        list.append(el(
          "div",
          "notice",
          `Couldn't reach the server: ${state.message ?? "network error"}. Retrying.`
        ));
      }
      if (tab === "all") {
        const picked = new Set(state.allowlist);
        const visible2 = state.allGroups.filter((g) => matches(g.group_name));
        if (!visible2.length) {
          list.append(el("div", "empty", "No groups match that filter."));
          return;
        }
        for (const group of visible2) list.append(pickRow(group, picked.has(group.group_id)));
        return;
      }
      if (!state.allowlist.length) {
        list.append(el(
          "div",
          "empty",
          "No groups picked yet. Open All groups and choose the ones assigned to you."
        ));
        return;
      }
      const visible = state.rows.filter((g) => matches(g.group_name));
      if (!visible.length && !state.missing.length) {
        list.append(el("div", "empty", "No groups match that filter."));
        return;
      }
      for (const group of visible) list.append(inboxRow(group));
      for (const groupId of state.missing) list.append(missingRow(groupId));
    }
    function renderDisconnected() {
      meta.textContent = "Disconnected";
      launcherCount.textContent = "-";
      launcher.dataset.unread = "0";
      list.replaceChildren(el(
        "div",
        "notice",
        "The extension was reloaded or updated, so this page lost touch with it. Reload the page to reconnect. Your picks are safe."
      ));
    }
    function toast(message2) {
      root.querySelector(".toast")?.remove();
      const node = el("div", "toast", message2);
      drawer.append(node);
      setTimeout(() => node.remove(), 4e3);
    }
    return { render, toast, setOpen, renderDisconnected };
  }

  // src/portable.js
  var FORMAT_VERSION = 1;
  var GROUP_ID_PATTERN = /@g\.us$/;
  var HEADER_WORDS = /* @__PURE__ */ new Set([
    "group",
    "groups",
    "group_id",
    "group id",
    "id",
    "group_name",
    "group name",
    "name",
    "chat",
    "chats"
  ]);
  var normalise = (name) => name.trim().toLowerCase();
  function serialize(allGroups2, allowlist) {
    const byId2 = new Map(allGroups2.map((group) => [group.group_id, group]));
    return {
      version: FORMAT_VERSION,
      exported_at: (/* @__PURE__ */ new Date()).toISOString(),
      groups: allowlist.map((groupId) => ({
        group_id: groupId,
        // A pick the server has stopped listing still belongs in the file;
        // dropping it would quietly shrink the list on every export.
        group_name: byId2.get(groupId)?.group_name ?? null
      }))
    };
  }
  function firstField(line) {
    if (!line.startsWith('"')) return line.split(",")[0].trim();
    const closing = line.indexOf('"', 1);
    return closing === -1 ? line.slice(1).trim() : line.slice(1, closing);
  }
  function parsePlainList(text) {
    const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    if (lines.length && HEADER_WORDS.has(normalise(firstField(lines[0])))) {
      lines.shift();
    }
    return lines.map((line) => {
      const value = firstField(line);
      return GROUP_ID_PATTERN.test(value) ? { group_id: value, group_name: null } : { group_id: null, group_name: value };
    });
  }
  function parseExportedFile(text) {
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error("That file is not valid JSON.");
    }
    if (!Array.isArray(parsed?.groups)) {
      throw new Error("That JSON is not an exported group list.");
    }
    return parsed.groups.map((group) => ({
      group_id: group.group_id ?? null,
      group_name: group.group_name ?? null
    }));
  }
  function parseImport(text) {
    const trimmed = text.trim();
    return trimmed.startsWith("{") ? parseExportedFile(trimmed) : parsePlainList(trimmed);
  }
  function resolveImport(entries, allGroups2, allowlist) {
    const byId2 = new Set(allGroups2.map((group) => group.group_id));
    const byName = new Map(allGroups2.map((group) => [normalise(group.group_name), group.group_id]));
    const picked = new Set(allowlist);
    const matched = [];
    const alreadyPicked = [];
    const unmatched = [];
    const seen = /* @__PURE__ */ new Set();
    for (const entry of entries) {
      const groupId = entry.group_id && byId2.has(entry.group_id) ? entry.group_id : byName.get(normalise(entry.group_name ?? ""));
      if (!groupId) {
        unmatched.push(entry.group_id ?? entry.group_name);
        continue;
      }
      if (seen.has(groupId)) continue;
      seen.add(groupId);
      (picked.has(groupId) ? alreadyPicked : matched).push(groupId);
    }
    return { matched, alreadyPicked, unmatched };
  }

  // src/store.js
  var DEFAULTS = {
    /** Where the chat list comes from. Set on the options page, empty until then. */
    endpoint: "",
    pagePattern: "",
    allowlist: [],
    baseline: {},
    pollMs: DEFAULT_POLL_MS
  };
  function isContextAlive() {
    return Boolean(globalThis.chrome?.runtime?.id);
  }
  var ContextLostError = class extends Error {
    constructor() {
      super("The extension was reloaded, so this page lost touch with it.");
      this.name = "ContextLostError";
    }
  };
  function isContextLost(error) {
    return error instanceof ContextLostError || /extension context invalidated/i.test(error?.message ?? "");
  }
  function assertContext() {
    if (!isContextAlive()) throw new ContextLostError();
  }
  async function loadState() {
    assertContext();
    const stored = await chrome.storage.local.get(Object.keys(DEFAULTS));
    return { ...DEFAULTS, ...stored };
  }
  async function saveState(patch) {
    assertContext();
    await chrome.storage.local.set(patch);
  }
  async function setAllowlist(ids) {
    await saveState({ allowlist: ids });
    return ids;
  }
  async function toggleAllowlist(groupId) {
    const { allowlist } = await loadState();
    const next = allowlist.includes(groupId) ? allowlist.filter((id) => id !== groupId) : [...allowlist, groupId];
    await saveState({ allowlist: next });
    return next;
  }

  // src/main.js
  console.info(`[WAG Inbox] v${chrome.runtime.getManifest().version} loading`);
  var allGroups = [];
  var lastGood = { groups: [], rows: [], missing: [], totalUnread: 0 };
  var etag = null;
  var pollMs = DEFAULT_POLL_MS;
  var currentDelay = DEFAULT_POLL_MS;
  var status = "ok";
  var message = null;
  var lastSuccess = null;
  var timer = null;
  var pendingImport = null;
  var disconnected = false;
  function disconnect() {
    if (disconnected) return;
    disconnected = true;
    clearTimeout(timer);
    status = "disconnected";
    panel.renderDisconnected();
  }
  function guarded(fn) {
    return async (...args) => {
      if (disconnected) return void 0;
      try {
        return await fn(...args);
      } catch (error) {
        if (!isContextLost(error)) throw error;
        disconnect();
        return void 0;
      }
    };
  }
  var panel = createPanel({
    onOpenGroup: guarded(onOpenGroup),
    onTogglePick: guarded(onTogglePick),
    onExport: guarded(onExport),
    onImportText: guarded(onImportText),
    onApplyImport: guarded(onApplyImport),
    onOpenSettings
  });
  window.addEventListener("unhandledrejection", (event) => {
    if (!isContextLost(event.reason)) return;
    event.preventDefault();
    disconnect();
  });
  async function draw() {
    const { allowlist, baseline } = await loadState();
    try {
      const built = buildInbox(allGroups, allowlist, baseline);
      lastGood = { groups: allGroups, ...built };
    } catch (error) {
      status = "shape";
      message = error.message;
    }
    panel.render({
      ...lastGood,
      allGroups: lastGood.groups,
      allowlist,
      status,
      message,
      lastSuccess
    });
  }
  async function poll() {
    if (!isContextAlive()) return disconnect();
    const { endpoint } = await loadState();
    const result = await fetchChats(endpoint, etag);
    switch (result.outcome) {
      case "unconfigured":
        status = "unconfigured";
        await draw();
        return;
      case "ok":
        allGroups = result.groups;
        etag = result.etag;
        status = "ok";
        message = null;
        lastSuccess = Date.now();
        currentDelay = pollMs;
        break;
      case "unchanged":
        status = "ok";
        message = null;
        lastSuccess = Date.now();
        currentDelay = pollMs;
        break;
      case "expired":
        status = "expired";
        message = result.reason;
        await draw();
        return;
      default:
        status = "error";
        message = result.reason;
        currentDelay = nextBackoff(currentDelay);
    }
    await draw();
    schedule();
  }
  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(guarded(poll), currentDelay);
  }
  async function onOpenGroup(group) {
    const { baseline } = await loadState();
    await saveState({ baseline: markRead(baseline, group) });
    await draw();
    const { ok } = await openInApp(group);
    if (!ok) {
      panel.toast(`Couldn't find "${group.group_name}" in the list. Name copied to clipboard.`);
    }
  }
  function onOpenSettings() {
    if (!isContextAlive()) return disconnect();
    chrome.runtime.sendMessage({ type: "openOptions" });
  }
  async function onTogglePick(groupId) {
    await toggleAllowlist(groupId);
    await draw();
  }
  async function onExport() {
    const { allowlist } = await loadState();
    const file = serialize(allGroups, allowlist);
    const stamp = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(file, null, 2)], { type: "application/json" })
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `wag-inbox-groups-${stamp}.json`;
    link.click();
    URL.revokeObjectURL(url);
    panel.toast(`Exported ${file.groups.length} groups.`);
  }
  async function onImportText(text) {
    const { allowlist } = await loadState();
    pendingImport = resolveImport(parseImport(text), allGroups, allowlist);
    return pendingImport;
  }
  async function onApplyImport(mode) {
    if (!pendingImport) return 0;
    const { allowlist } = await loadState();
    const imported = [...pendingImport.matched, ...pendingImport.alreadyPicked];
    const next = mode === "replace" ? imported : [.../* @__PURE__ */ new Set([...allowlist, ...pendingImport.matched])];
    await setAllowlist(next);
    pendingImport = null;
    await draw();
    return next.length;
  }
  async function start() {
    const stored = await loadState();
    pollMs = stored.pollMs;
    currentDelay = pollMs;
    await draw();
    await poll();
  }
  console.info(`[WAG Inbox] v${chrome.runtime.getManifest().version} panel mounted`);
  guarded(start)();
})();
