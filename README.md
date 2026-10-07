# Society6 Planning Hub — Replit setup

Your planning hub, rebuilt as a real shared app: a small server + database that
replaces the Google Sheet. It fixes the things that kept biting you —

- **Silent saves / "it reverted."** Saves go straight to your own server and
  retry if the network hiccups, with a loud "⚠ not saved" warning so nothing is
  lost quietly.
- **Editors overwriting each other.** (v2, Sept 28 2026) Every initiative has a
  permanent ID, and the app merges concurrent edits row-by-row. If two people
  edit at once, both sets of changes are kept. The only time anyone is asked
  anything is when two people changed the *same* initiative differently — and
  the question is about that one initiative, with the differences shown.
- **Live sync.** Other people's changes appear in your view every 15 seconds,
  even while you have an Edit form open.

Plus: a team password, click-to-edit cells, sortable columns, a roadmap calendar, and Download/Import backups.

## Files
- `server.js` — the backend (Node/Express)
- `public/index.html` — the app (front-end)
- `package.json` — dependencies
- `seed.json` — starting data (empty; you load your real data after deploy)
- `.replit` — run/deploy config
- `.gitignore` — keeps `node_modules/` and Replit scratch files out of git

This repo lives at **github.com/johnaldermanleaf/s6-planning-hub** (branch `main`).
The easiest way to get it into Replit is **Import from GitHub** (see step 1 below).

---

## v3 (Oct 7 2026) — inline editing, Priority number, Status simplified

Replace **`server.js`** and **`public/index.html`**, click Run once, then Redeploy.
(Or, if the Repl was imported from GitHub: pull `main` from the Git pane, Run, Redeploy.)

What changed:
- **Status now just means which tab an initiative is in** — Active, Backlog, or Done.
  The old per-row status values (On Track, Low Risk, Not Started, A New Proposal…)
  are retired. On first run the server does a one-time migration: every Active row
  that was "Not Started" or "A New Proposal" moves to Backlog, the old field is
  dropped, and a `snap:pre-v3` safety copy is stored in the database first.
  The Shell prints `v3 migration: moved N rows…` once.
- Status shows in the expanded details and the full edit form (as a dropdown), and
  the **Set status** buttons in the details move an initiative to Backlog / Done /
  Removed. Moving to Done stamps the completed date; moving out clears it.
- **Priority is now a number** (stored in the old `rank` field — nothing to migrate).
  1 is highest; the same number on several initiatives is fine, ties keep their
  current order. The old High / Medium / Backlog priority is retired (values stay in
  the database but aren't shown).
- **Main table columns:** Initiative · Objective · Sponsor · Priority · Start ·
  Target · Update. Done/Removed tabs show Priority next to the Completed/Removed date.
- **Sorting lives in the column headers.** Click a header once for A→Z (ascending),
  again for Z→A. Active and Backlog open sorted by Priority; Done/Removed open
  newest-first. The "↑ Rank" pill and Status/Priority filter pills are gone. Blank
  priorities and blank dates always sink to the bottom.
- **Edit in place.** Click any value in the table (name, objective, sponsor, priority,
  dates, update) to edit it right there. Enter or clicking away saves to the server
  immediately; Esc cancels. The Update cell opens a text box (Shift+Enter for a new
  line). The chevron (›) opens the details drawer, which has "Edit all fields" for
  description, lead, people, etc.
- **Drag-to-reorder removed.** Order comes purely from the Priority number.
- Background sync pauses while a cell editor is open so your typing isn't interrupted;
  concurrent edits still merge row-by-row exactly as in v2.

## Upgrading an existing Repl to v2 (the merge fix)

Nothing in your data changes and nothing needs re-importing.

1. In Replit, open your `s6-planning-hub` Repl.
2. Replace the contents of **`server.js`** with the new `server.js`.
3. Replace the contents of **`public/index.html`** with the new `public/index.html`.
4. Click **Run** once. The Shell prints `Assigned permanent IDs to existing rows.`
   the first time — that's the one-time migration.
5. **Deploy** → **Redeploy** so the team's URL gets the new version.
6. Ask everyone to reload the page once (hard-refresh: Cmd/Ctrl+Shift+R).

## 1. Create the Repl (first-time setup)

**Option A — Import from GitHub (recommended)**
1. Go to **replit.com** → **Create Repl** → **Import from GitHub**.
2. Paste `https://github.com/johnaldermanleaf/s6-planning-hub` (connect your GitHub
   account if Replit asks) → **Import**.
3. Replit reads `.replit` from the repo, so the run command (`npm start`) and the
   Node.js module are already configured. Click **Confirm and close** if the
   configuration dialog appears.

**Option B — Upload a zip**
1. **Create Repl** → template **Node.js** → name it `s6-planning-hub` → **Create**.
2. Drag the zip into the **Files** panel, then in the **Shell** run
   `unzip -o s6-planning-hub.zip && rm s6-planning-hub.zip`.

## 2. Set the team password
1. Left sidebar → **Secrets** (the lock icon).
2. Add: key = `APP_PASSWORD`, value = the password your team will use.
   (Keep it out of the code — Secrets is the safe place for it.)

## 3. Run it
Click **Run**. The Shell should print `Planning Hub running on port ...`.
Open the web view, log in with the password — you'll see an empty board.
(If Run doesn't start the server, set the Repl's run command to `npm start`.)

## 4. Load your current data
Easiest: in the app, click **Import** and choose your `planning-backup.txt`
(the backup we saved). It loads your plan and saves it to the server for everyone.
(Alternatively, replace `seed.json` with your backup's contents before the first Run.)

## 5. Deploy (always-on for the team)
1. **Deploy** (top right) → choose **Autoscale** → **Deploy**.
2. Make sure `APP_PASSWORD` is set for the deployment too (check the deployment's
   Secrets).
3. You'll get a permanent URL — share that with the team.

Autoscale is cheapest (~a few $/month, possibly covered by your plan credits) and
sleeps when idle, so the first load after a quiet spell takes a second or two. Want
it always warm? Switch the deployment to **Reserved VM** ($15/mo).

---

## Day-to-day
- Everyone uses the deployment URL + the shared password.
- Click any value in the table to edit it; it saves to the shared server instantly.
- Open the details (›) and use **Set status** to send an initiative to Backlog / Done / Removed.
- Two people editing different initiatives at once: both saves go through, no prompts.
- Two people editing the *same* initiative at once: the second person to save sees
  what the other changed and picks which version of that one initiative to keep.
- Click **Backup** now and then for a downloaded safety copy; **Import** restores one
  (Import deliberately replaces the whole plan for everyone).
- The server also keeps a daily snapshot for the last 14 days (`snap:YYYY-MM-DD` keys
  in the Replit database) if something ever needs to be recovered.

## How the merge works (for whoever maintains this next)
- Every row has a `_id` (UUID) stored in the database. The server assigns one to any
  row that arrives without it.
- The browser keeps a snapshot of the plan as it last loaded/saved it (`baseSnapshot`)
  plus the server's version number (`baseRev`).
- On save, if the server's version has moved on, the server returns its current copy
  and the browser runs `mergePlans(base, mine, theirs)` in `index.html`: a row only I
  changed → mine; only they changed → theirs; both changed identically → fine; both
  changed differently → a per-row prompt. Row order follows whoever reordered;
  if both did, the most recently saved order wins but no rows are lost. Then it re-saves.
- While an Edit form is open, the app keeps polling. On Save it compares the row
  against what it looked like when editing began (`editBase`); if a colleague changed
  it in between, the same per-row prompt appears.
- `Import` sets `forceReplace` so a restore overwrites rather than merges.

## Notes
- Your old Google Sheet is untouched — it stays as a frozen archive. Nothing was deleted.
- The password is "light" protection (keeps bots and randoms out); it isn't individual
  logins, which is fine for an internal tool.
