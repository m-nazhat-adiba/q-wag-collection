# WAG Inbox

A Chrome extension that draws a second, filtered inbox on top of a web chat
console: only the group chats you pick, sorted by recency, with an unread count
on each and a total on the launcher.

Built for consoles that list hundreds of groups when only a handful are assigned
to you.

## What it needs from your console

One endpoint that returns the chat list as JSON, authenticated by the session
cookie you already have in the browser. An array of objects shaped like this:

```json
[
  {
    "group_id": "120363000000000001@g.us",
    "group_name": "Acme Freight <> Support",
    "new_count": 12,
    "last_ts": 1789351233000,
    "last_body": "optional message preview",
    "last_sender": "optional sender name",
    "last_from_me": 0
  }
]
```

`group_id`, `group_name`, `new_count`, and `last_ts` are required. The rest are
used for the preview line if present.

## Install

No tools required. You do not need Node, npm, git, or a copy of this code.

1. Go to the [Releases page](../../releases) and download
   `wag-inbox-vX.Y.Z.zip` from the newest release.
2. Unzip it. **Put the folder somewhere permanent** — Chrome loads it from
   wherever it sits, so a folder in Downloads that you later clear out will
   break the extension. Documents is fine. The folder you want is the one with
   `manifest.json` directly inside it.
3. Open a new tab and go to `chrome://extensions`.
4. Turn on **Developer mode**, the switch in the top right.
5. Click **Load unpacked** and choose the `wag-inbox` folder you unzipped.
6. Click the extension's icon in the toolbar. Its settings page opens.
7. Paste the address of your chat-list endpoint, then click **Save and grant
   access**. Chrome asks whether to let the extension read that site. Approve it.
8. Open your console and reload the page. A **Groups** pill appears in the
   bottom-right corner.

To update later, download the newer zip, replace the folder's contents, and
click the ↻ reload icon on the extension's card in `chrome://extensions`. Your
picked groups and your endpoint are kept.

### Install from source

For development, or to run an unreleased version:

```bash
npm install
npm run build     # writes dist/, which is not committed
```

Then follow steps 3 onward above, choosing the repository folder itself.

The extension ships with access to nothing. It holds no site address until you
enter one, and Chrome, not the extension, decides whether it gets access. You can
revoke it any time from `chrome://extensions`, or with **Forget this site** on
the settings page.

## If the panel stops appearing

Check the page console for a `[WAG Inbox] v… loading` line.

No line at all means the content script is not being injected. Open the
extension's settings and click **Save and grant access** again to re-register
it. Reloading or updating an extension clears dynamically registered content
scripts, which is why the extension re-registers itself on install and on
browser start.

A line whose version is older than the one in `chrome://extensions` means an
orphaned script from a previous build is still running in that tab. Reload the
page.

## First run

The inbox starts empty. Open the drawer, switch to **All groups**, and click the
groups assigned to you. They appear in **Inbox** from then on.

On the first poll every picked group reads as fully unread, because there is no
record yet of what you had already seen. Clicking through them once settles it.

## Moving your picks between machines

The **All groups** tab has **Export picks** and **Import picks**.

Export downloads `wag-inbox-groups-YYYY-MM-DD.json`:

```json
{
  "version": 1,
  "exported_at": "2026-09-14T04:12:00.000Z",
  "groups": [
    { "group_id": "120363000000000001@g.us", "group_name": "Acme Freight <> Support" }
  ]
}
```

Ids and names are both written. The id is what matching relies on; the name is
what makes the file readable and what still works when someone types a list by
hand.

Import takes that file, or anything simpler: group names or ids one per line, or
a CSV pasted straight from a spreadsheet (first column, quoting respected, header
row skipped). Matching tries the id first, then the name, ignoring case and
padding.

Nothing is written until you choose. Checking a list reports what it found — how
many to add, how many you already have, and the exact text of anything it could
not match — and then offers **Add to my picks** or **Replace my picks**.

Import only ever writes the allowlist, never the baseline, so importing a
colleague's list will not mark your groups as read.

An exported file contains the names of the groups you watch. Treat it the way you
would treat any other export from that console.

## How it gets the data

A content script running on your console's own origin calls the endpoint you
configured. It contacts no host other than the one you approved.

### How it authenticates

By never touching a credential. It borrows the browser's:

```js
await fetch(endpoint, { credentials: 'include' });
```

`credentials: 'include'` supplies nothing. It instructs the browser to attach
whatever cookies belong to that origin, and the browser does so after our code
has finished. You are already signed in; the session cookie is `HttpOnly`, so no
JavaScript can read it — not the page's, not ours — and the request goes out
looking exactly like one the console itself made.

There is consequently no code path in this repository where a session token
exists as a value. That is why the manifest asks for neither `cookies` nor any
`host_permissions` beyond the one origin you grant: it does not need them.

The constraint this creates is worth knowing. **The endpoint must be on the same
origin as the page the panel runs on.** Cross-origin, the browser applies CORS
rules and withholds the cookie unless the server opts in. The settings page
defaults the page pattern to the endpoint's own origin so the two match; change
that second field to a different site and requests will start failing.

It follows that the extension cannot sign in, and cannot renew anything. When
the session expires the fetch returns `401`, polling stops, and the panel asks
you to reload the page.

### Polling

Each request sends the previous `ETag`, so an unchanged list costs a `304` with
no body. That ETag is kept in memory only: it describes a response we stop
holding once the tab reloads, so a stored one would earn a `304` against an
empty list and the panel would show nothing while reporting a successful check.
Each page load therefore starts with one full response.

To watch it work, open DevTools → Network and filter for your endpoint's path.
Expect one request per interval: the first a `200`, then `304`s while nothing
changes.

## What is stored, and what is not

`chrome.storage.local` holds:

| Key | Purpose |
| --- | --- |
| `endpoint` | The chat-list address you entered |
| `pagePattern` | Which pages the panel appears on |
| `allowlist` | The group ids you picked |
| `baseline` | Per group: the message count and timestamp as of your last click |
| `pollMs` | Poll interval, default 30s |

`last_body` and `last_sender` are message content. They are rendered in the panel
from the in-memory response and are never written to storage, never sent
anywhere, and are gone on reload. `chrome.storage.sync` is deliberately unused,
since it would copy group names to Google's servers.

## When your console changes

Clicking a row drives the console's own UI rather than constructing a URL, so it
depends on markup nobody here controls. Every selector and the order the
strategies are tried live in `src/selectors.js` — that is the only file that
should need editing when the click stops working. If no strategy finds the group,
the panel says so and copies the name to your clipboard rather than silently
doing nothing.

## Development

```bash
npm install
npm test         # vitest, pure logic only
npm run test:watch
```

`src/diff.js`, `src/api.js`, `src/portable.js`, and `src/config.js` hold every
decision worth testing and touch neither the DOM nor chrome APIs. `src/panel.js`
and `src/navigate.js` depend on markup we do not own and are verified by loading
the extension.

The panel renders and nothing else — it makes no network calls and reads no
storage. `src/main.js` owns the poll loop and hands it what to draw. That split
is what keeps the interesting logic unit-testable.

`src/main.js` is the entry point. esbuild bundles it and everything it imports
into a single classic script at `dist/content.js`, and that is what gets
injected. `npm test` rebuilds first, so the tests never run against a stale
bundle.

The bundle is not an optimisation. A content script cannot fetch a second file
at runtime: a dynamic import is governed by the **host page's** Content Security
Policy, and a page serving `script-src 'self'` refuses a `chrome-extension:` URL
outright — the import fails and nothing mounts. Bundling removes the fetch, and
with nothing to fetch the extension needs no `web_accessible_resources` either.
`test/registration.test.js` pins this so it cannot regress quietly.

`npm run package` builds the extension and writes
`release/wag-inbox-vX.Y.Z.zip` — the same five files Chrome loads, and nothing
else. Attach that to a GitHub release, or hand the unzipped folder to someone
directly.

Pushing a `vX.Y.Z` tag does the same thing on CI: builds, runs the tests, checks
the tag matches `manifest.json`, and attaches the zip to the GitHub release.
The zip holds `manifest.json`, `options.html` and `dist/` — nothing is loaded
from `src/` at runtime, and `test/package.test.js` keeps it that way, since a
stray source reference would only fail after someone had installed it.

`test/no-hostnames.test.js` fails if any specific deployment's address, product
name, or customer name is committed. Adding a name to its exception list is not
the fix; making the code take it as configuration is.
