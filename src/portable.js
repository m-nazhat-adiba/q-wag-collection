/**
 * Carrying a set of picks between machines, or between people.
 *
 * Export writes ids and names together: the id is what matching relies on, the
 * name is what makes the file readable and what still works when a teammate
 * hands you a list they typed by hand.
 *
 * Pure — no DOM, no chrome APIs, no file system. The panel does the reading
 * and writing; this module only decides what the bytes mean.
 */

const FORMAT_VERSION = 1;

const GROUP_ID_PATTERN = /@g\.us$/;

/** Column titles that mean the first line is a header, not a group. */
const HEADER_WORDS = new Set([
  'group', 'groups', 'group_id', 'group id', 'id',
  'group_name', 'group name', 'name', 'chat', 'chats',
]);

const normalise = (name) => name.trim().toLowerCase();

export function serialize(allGroups, allowlist) {
  const byId = new Map(allGroups.map((group) => [group.group_id, group]));

  return {
    version: FORMAT_VERSION,
    exported_at: new Date().toISOString(),
    groups: allowlist.map((groupId) => ({
      group_id: groupId,
      // A pick the server has stopped listing still belongs in the file;
      // dropping it would quietly shrink the list on every export.
      group_name: byId.get(groupId)?.group_name ?? null,
    })),
  };
}

/**
 * Reads the first field of a CSV line, honouring quotes so that a group name
 * containing a comma survives.
 */
function firstField(line) {
  if (!line.startsWith('"')) return line.split(',')[0].trim();

  const closing = line.indexOf('"', 1);
  return closing === -1 ? line.slice(1).trim() : line.slice(1, closing);
}

function parsePlainList(text) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length && HEADER_WORDS.has(normalise(firstField(lines[0])))) {
    lines.shift();
  }

  return lines.map((line) => {
    const value = firstField(line);
    return GROUP_ID_PATTERN.test(value)
      ? { group_id: value, group_name: null }
      : { group_id: null, group_name: value };
  });
}

function parseExportedFile(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('That file is not valid JSON.');
  }

  if (!Array.isArray(parsed?.groups)) {
    throw new Error('That JSON is not an exported group list.');
  }

  return parsed.groups.map((group) => ({
    group_id: group.group_id ?? null,
    group_name: group.group_name ?? null,
  }));
}

export function parseImport(text) {
  const trimmed = text.trim();
  return trimmed.startsWith('{') ? parseExportedFile(trimmed) : parsePlainList(trimmed);
}

/**
 * Works out what an import would actually do, without doing it.
 *
 * @returns {{ matched: string[], alreadyPicked: string[], unmatched: string[] }}
 *   matched — groups to add. alreadyPicked — recognised, but already yours.
 *   unmatched — written as the file wrote them, so you can see what to fix.
 */
export function resolveImport(entries, allGroups, allowlist) {
  const byId = new Set(allGroups.map((group) => group.group_id));
  const byName = new Map(allGroups.map((group) => [normalise(group.group_name), group.group_id]));
  const picked = new Set(allowlist);

  const matched = [];
  const alreadyPicked = [];
  const unmatched = [];
  const seen = new Set();

  for (const entry of entries) {
    let groupId = null;
    if (entry.group_id && byId.has(entry.group_id)) {
      groupId = entry.group_id;
    } else if (entry.group_name) {
      // Only fall back to a name that is actually present. Matching on an empty
      // name would collide on byName.get(''), silently adopting a group whose
      // name is blank.
      groupId = byName.get(normalise(entry.group_name)) ?? null;
    }

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
