/**
 * Pure case-tracking logic. No DOM, no chrome APIs, no network — every decision
 * here is a plain function of its inputs, which is what makes it the only part
 * of the feature worth unit testing (mirrors diff.js / portable.js).
 *
 * A "case" is a chat's escalation log: an ordered list of progress entries you
 * add over time. Each entry is one step — a status, an optional Slack link, an
 * optional note, and the moment you added it. The chip on the row shows the
 * status of the latest step. Stored in chrome.storage.local under `tracking`,
 * keyed by group_id; the panel renders it, this module decides what it means.
 */

/** Neutral grey (matches --dim) for the "no status" and orphaned-status chips. */
export const NEUTRAL_COLOR = '#8b98a5';

/** Newest-kept cap so a case's log cannot grow without bound. */
export const MAX_ENTRIES = 200;

/** A note is a working memo, not a document; keep a single entry from ballooning. */
export const MAX_NOTE_LEN = 5000;

/**
 * The built-in status palette. Editable by the user only from v1.1 (options
 * page); until then this constant is the whole set. Colours are fixed hexes
 * from a small vetted palette — never amber (--signal), which is reserved for
 * the unread badge, and never free-typed, so a colour can only ever be assigned
 * to a CSS custom property, never concatenated into a rule.
 */
export const DEFAULT_STATUS_DEFS = [
  { id: 'st_in_progress', label: 'In progress', color: '#2F80ED' },
  { id: 'st_done', label: 'Done', color: '#27AE60' },
  { id: 'st_backlog_prodcore_sre', label: 'Backlog (Prod Core/SRE)', color: '#9B51E0' },
  { id: 'st_backlog_pending_client', label: 'Backlog (Pending From Client)', color: '#F2994A' },
  { id: 'st_updated_client', label: 'Updated to Client', color: '#56CCF2' },
  { id: 'st_helpdesk_resolved', label: 'Ticket Helpdesk Resolved', color: '#219653' },
  { id: 'st_backlog_ops', label: 'Backlog Ops', color: '#EB5757' },
  { id: 'st_prodfeat_appcen_data', label: 'Prodfeat AppCen/Data', color: '#BB6BD9' },
];

/** Statuses that resolve a case, so the chip can recede and (later) be archived. */
export const TERMINAL_STATUS_IDS = ['st_done', 'st_helpdesk_resolved'];

/** Auto-assigned colors, in order, when a custom status brings none of its own. */
export const STATUS_SWATCHES = [
  '#2F80ED', '#27AE60', '#9B51E0', '#F2994A', '#56CCF2', '#EB5757', '#BB6BD9', '#219653',
];

export function isValidHex(color) {
  return typeof color === 'string' && /^#[0-9a-fA-F]{6}$/.test(color);
}

function slugId(label, taken) {
  let base = `st_${label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40)}`;
  if (base === 'st_') base = 'st_status';
  let id = base;
  let n = 2;
  while (taken.has(id)) {
    id = `${base}_${n}`;
    n += 1;
  }
  taken.add(id);
  return id;
}

/**
 * Parses the status editor's text into a status set. Each non-blank line is one
 * status: `Label` (auto-colored) or `Label | #rrggbb`. Ids are derived from the
 * label so re-pasting the same list is stable; a colour is only ever a validated
 * hex, never free text, so it can safely drive a CSS custom property.
 *
 * Deployment- and customer-specific names live here as the user's own local
 * config — never committed to source, which is why the built-in DEFAULT set stays
 * generic and this parser exists.
 */
export function parseStatusDefs(text) {
  const taken = new Set();
  const statuses = [];
  for (const rawLine of String(text ?? '').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    let label = line;
    let color = null;
    const bar = line.lastIndexOf('|');
    if (bar !== -1) {
      const maybe = line.slice(bar + 1).trim();
      if (isValidHex(maybe)) {
        color = maybe;
        label = line.slice(0, bar).trim();
      }
    }
    if (!label) continue;

    label = label.slice(0, 60);
    if (!color) color = STATUS_SWATCHES[statuses.length % STATUS_SWATCHES.length];
    statuses.push({ id: slugId(label, taken), label, color });
  }
  return statuses;
}

/** Turns a status set back into editor text (`Label | #color` per line). */
export function serializeStatusDefs(defs) {
  return (defs ?? []).map((d) => `${d.label} | ${d.color}`).join('\n');
}

/** The set to actually use: the user's stored one, or the built-in default. */
export function resolveStatusDefs(stored) {
  return Array.isArray(stored) && stored.length ? stored : DEFAULT_STATUS_DEFS;
}

/**
 * A safe absolute URL string, or null. Only http(s) and slack: pass — a Slack
 * escalation link is exactly one of those. Everything else (javascript:, data:,
 * a bare word, empty) is refused, so a stored value can never become a
 * dangerous href downstream.
 */
export function sanitizeUrl(raw) {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) return null;
  let url;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  if (url.protocol === 'http:' || url.protocol === 'https:' || url.protocol === 'slack:') {
    return url.href;
  }
  return null;
}

export function makeRecord() {
  return { v: 2, entries: [] };
}

/**
 * Coerces any stored/foreign shape into the entry-log model, preserving data.
 * A v0.1 single-record ({ status, links, note }) becomes one legacy entry so an
 * early tester's data is not lost. Unknown shapes fall back to an empty log.
 */
export function normalizeRecord(raw) {
  if (!raw) return makeRecord();
  if (Array.isArray(raw.entries)) return { v: 2, entries: raw.entries };

  const link = Array.isArray(raw.links) ? raw.links[0] : null;
  if (!raw.status && !raw.note && !link) return makeRecord();
  return {
    v: 2,
    entries: [{
      id: 'legacy',
      at: raw.last_edited ?? 0,
      status: raw.status ?? null,
      link: sanitizeUrl(link),
      note: typeof raw.note === 'string' ? raw.note.slice(0, MAX_NOTE_LEN) : '',
    }],
  };
}

/**
 * Appends one progress step, returning a NEW record (never mutating the input,
 * like markRead in diff.js). The caller mints `entry.id`; `now` stamps it. The
 * link is sanitized and the note clamped here, so junk never reaches storage.
 */
export function addProgress(record, entry, now) {
  const base = normalizeRecord(record);
  const next = {
    id: entry.id,
    at: now,
    status: entry.status ?? null,
    link: sanitizeUrl(entry.link),
    note: typeof entry.note === 'string' ? entry.note.slice(0, MAX_NOTE_LEN) : '',
  };
  return { ...base, entries: [...base.entries, next].slice(-MAX_ENTRIES) };
}

export function deleteEntry(record, entryId) {
  const base = normalizeRecord(record);
  return { ...base, entries: base.entries.filter((e) => e.id !== entryId) };
}

/** True when the log carries nothing worth showing a chip for. */
export function isEmpty(record) {
  return normalizeRecord(record).entries.length === 0;
}

/**
 * The status the row chip should show: the most recent entry that carries a
 * status. A note-only step therefore does not blank the chip.
 */
export function currentStatus(record) {
  const { entries } = normalizeRecord(record);
  for (let i = entries.length - 1; i >= 0; i -= 1) {
    if (entries[i].status) return entries[i].status;
  }
  return null;
}

/**
 * Resolves a status id to its label and colour. An id absent from the set
 * (a status deleted after a case referenced it) resolves to a neutral
 * "Unknown" chip rather than throwing or losing colour.
 */
export function statusMeta(statusId, statusDefs) {
  if (!statusId) return null;
  const def = (statusDefs ?? []).find((d) => d.id === statusId);
  if (def) return { id: def.id, label: def.label, color: def.color, known: true };
  return { id: statusId, label: 'Unknown', color: NEUTRAL_COLOR, known: false };
}

/**
 * What the row chip needs, or null when there is no log to show.
 *
 * - Empty / no record         -> null   (row offers a "+track" affordance)
 * - Log with no status yet     -> a neutral "No status" pill
 * - Log with a latest status   -> the coloured pill for that status
 */
export function getChip(record, statusDefs) {
  if (isEmpty(record)) return null;
  const status = currentStatus(record);
  if (!status) {
    return { label: 'No status', color: NEUTRAL_COLOR, known: true, hasStatus: false };
  }
  const meta = statusMeta(status, statusDefs);
  return {
    label: meta.label,
    color: meta.color,
    known: meta.known,
    hasStatus: true,
    terminal: TERMINAL_STATUS_IDS.includes(status),
  };
}
