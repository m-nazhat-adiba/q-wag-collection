# Case tracking — design & v1 notes

A per-group **escalation log**: an ordered list of **progress steps** you add over
time. Each step is one entry with a **status**, an optional **Slack link**, an
optional **note**, and the moment it was added. The row chip shows the status of
the latest step. Personal, local (`chrome.storage.local`), no backend.

> Model note: this started as a single evolving record (status + 2 link slots +
> note). That was wrong — the real workflow is a **timeline you keep adding to**
> ("asked upstream" → then "handed to Product"), each step its own saved entry
> with its own link. "Escalation Link / Link 2" in the source tool were two
> *steps*, not two slots.

## Locked decisions

- **Entry-log model.** `tracking[group_id] = { v: 2, entries: [{ id, at, status,
  link, note }] }`. Adding progress appends an entry; deleting removes one; the
  chip uses the latest entry that carries a status.
- **Overlay, not row data.** The tracking map is passed to the panel *alongside*
  the rows (never merged into `diff.buildInbox`), so chips resolve on inbox rows,
  `missing` rows, and survive a shape error — `diff.js` and its tests stay untouched.
- **Pure logic in `src/tracking.js`** (mirrors `diff.js`/`portable.js`):
  `addProgress`, `deleteEntry`, `currentStatus`, `getChip`, `normalizeRecord`
  (migrates the old single-record shape → one legacy entry), `sanitizeUrl`,
  `statusMeta` (+orphan fallback), `isValidHex`, `DEFAULT_STATUS_DEFS`.
- **Status by stable id, not label.** An unknown id renders a neutral "Unknown"
  chip. Colors come from a fixed, `isValidHex`-validated palette; amber
  (`--signal`) is reserved for the unread badge; a color only ever reaches CSS via
  `style.setProperty('--chip-color', hex)`.
- **Link safety:** one choke point, `sanitizeUrl` — only `http/https/slack:`;
  `javascript:`/`data:`/junk refused, both at write time and again before a link
  becomes an href. Links open `target=_blank rel=noopener`. All text via
  `textContent` — no innerHTML.
- **Race safety:** every case write goes through a single-writer queue in
  `store.js` (`mutateTracking`) that re-reads fresh inside the queue and writes
  **only** the `{tracking}` key, so it can't clobber `pinned`/`baseline`/poll.
- **Zero manifest/CSP/permission change.** `storage` already granted; no
  `web_accessible_resources`; CSS stays a bundled string.

## UI

- Row **status chip** between the name/preview and the count. Tracked rows show a
  colored pill (dimmed when Done); untracked rows reveal a `＋ track` affordance
  on hover. The chip opens the detail sheet (`stopPropagation`, so the row click
  still opens the chat).
- **Bottom-sheet detail** (reuses `.sheet`): an **Add progress** form at top
  (status `<select>` + swatch, link input, note textarea, "Add progress" button),
  then the **Progress timeline** (newest first) — each step shows a colored status
  badge, relative time, an optional `thread ↗` link, the note, and a `×` to delete
  that step. Actions: **Clear all** (two-click confirm), **Close**. Escape closes
  the sheet before the drawer.

## Data shape

```json
"tracking": {
  "1203…@g.us": {
    "v": 2,
    "entries": [
      { "id": "e_…", "at": 1700000000000, "status": "st_backlog_ops", "link": "https://…slack…", "note": "asked upstream" },
      { "id": "e_…", "at": 1700003600000, "status": "st_prodfeat_appcen_data", "link": "https://…slack…", "note": "handed to Product" }
    ]
  }
}
```

Status set lives in `DEFAULT_STATUS_DEFS` (`src/tracking.js`) as a constant in v1;
it becomes a user-editable, persisted set on the options page in v1.1.

## Phasing

- **v1 (shipped):** everything above. `diff.js`, `portable.js`, `manifest.json`
  untouched. Tests: `test/tracking.test.js` (pure) + `test/persistence.test.js`.
- **v1.1:** status-set editor (options page), per-case due date, filter/sort inbox
  by status, archive resolved cases, separate & sensitivity-marked tracking export.
- **Out of scope:** cross-machine sync (banned by design), backend / team sharing.

## Privacy note

Entries hold internal Slack links and client notes. `chrome.storage.local` only
(never `sync`), never sent anywhere; any future export must be a separate,
clearly-labeled, human-initiated action — never folded into the picks export.
