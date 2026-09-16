A filtered inbox for the group chats you actually watch, drawn on top of your
team's chat console. Pick your groups once, and see only those — sorted by
recency, with an unread count on each.

## New in v0.4.0

Three triage tools for the groups you are actually chasing:

- **Pin** — float the groups you are watching into a **Pinned** section at the
  top of the inbox, above everything else.
- **Need Attention** — a third tab, filled by the bell flag on each row, for the
  groups you have flagged as needing a follow-up.
- **Case tracking** — an append-only progress timeline per group. Each step
  records a status, an optional thread link, a note, and when you added it; the
  row shows a coloured chip for the latest status. The status set itself is
  yours to edit on the options page.

Also fixed: importing a picks file no longer mis-matches a group whose name is
empty.

All of it is stored on your own machine (`chrome.storage.local`) and needs no
new permission.

## Install

1. Download the `.zip` below and unzip it somewhere permanent (not Downloads —
   Chrome loads the extension from wherever the folder sits).
2. Open `chrome://extensions` and turn on **Developer mode**.
3. Click **Load unpacked** and pick the unzipped folder.
4. Click the extension's icon, paste your chat-list endpoint, and click
   **Save and grant access**. Chrome will ask permission for that site.
5. Open your console and reload. A **Groups** pill appears bottom-right.

Full instructions are in the README.

## What it does

- Only the groups you pick, newest first, unread count on each
- Export your picks to a file and import them on another machine, or share them
  with whoever covers the same groups
- Click a group to jump straight to it in the console
- Pin the groups you are watching, flag the ones needing attention, and keep a
  progress timeline against each case

## What it doesn't do

- Stores no message content. Previews render from memory and are gone on reload.
  The pins, flags, and case notes you type are the only things kept, and they
  stay in your browser's local storage.
- Handles no credential. It borrows the session cookie already in your browser,
  which is why it only works on a site you are already signed into.
- Sends nothing anywhere. The only host it contacts is the one you approve.

Chrome only. The endpoint must be on the same origin as the page the panel runs
on.
