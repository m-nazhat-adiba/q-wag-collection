A filtered inbox for the group chats you actually watch, drawn on top of your
team's chat console. Pick your groups once, and see only those — sorted by
recency, with an unread count on each.

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

## What it doesn't do

- Stores no message content. Previews render from memory and are gone on reload.
- Handles no credential. It borrows the session cookie already in your browser,
  which is why it only works on a site you are already signed into.
- Sends nothing anywhere. The only host it contacts is the one you approve.

Chrome only. The endpoint must be on the same origin as the page the panel runs
on.
