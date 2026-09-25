# Offline behaviour and recovery

## What is guaranteed

After one successful online load, with the radio off:

- The application shell
- Every day card, with distances, terrain, start-light guidance and rail redundancy
- The canonical route, its variants, its breaks, and all 98 anchors
- Route exports — master GPX, reference layer, active route — generated from
  cached geometry with no network
- All station and waypoint data
- Safety notes, hazards and bailout information
- Editorial prompts and field callouts
- Anything previously imported into IndexedDB — private data and captures
- Every calculation: distance, pace, ETA, daylight, stop-here, tomorrow-distance
- Saving new captures
- **Day planning** — moving a boundary, setting a continuation, snapshots
- **Every export** — day GPX, master GPX, summaries, reference layer — all
  generated from cached geometry with no network
- **The Prepare Tomorrow workflow and its readiness checklist**

Verified by `tests/e2e/offline.spec.ts`, which installs the service worker, cuts
the network at the browser level, reloads, and then reads a day card, opens the
Hakone safety notes, runs the calculator and saves a capture.

## What is not guaranteed

**Do not try to pre-load the route's tiles.** Panning and zooming the whole 535
km corridor to warm the cache is the exact pattern OpenStreetMap's tile policy
forbids, and it is what got the app blocked on 2026-09-13 — the basemap was
replaced by "Access blocked" images, which then cached like real tiles and
persisted. 600 entries could not hold the corridor in any case. Tiles are a
convenience near where you have recently looked, not offline coverage. If the
basemap matters in the mountains, the answer is the PMTiles route in
`ARCHITECTURE.md`, not more caching of someone else's volunteer-run servers.

If you see "Access blocked" tiles, check whether the server is actually
refusing before assuming you are blocked — a tile fetched outside the app will
tell you. Builds from 2026-09-13 onward request tiles with CORS and cache only
a real 200, so a refusal is no longer stored and the map recovers by itself.
A device that cached the bad images before that fix needs its site data cleared
once.

- **Map tiles.** Runtime cache, best-effort, `CacheFirst` — 600 entries for the
  standard basemap and 200 for terrain, kept in separate caches so the planning
  aid cannot crowd out the one you walk with. 30 days each.
  The English place labels are NOT tiles: they come from the app's own anchors
  and work with no network at all.
  Tiles you have looked at recently will probably be there. Tiles you have not
  will not. When they fail the map says so and keeps drawing the route line, the
  waypoints and the position dot on a blank background.
- **Every external link.** Trail notices, city pages, the AI assistants.
- **Your position.** Geolocation is foreground only and needs a GPS fix, not a
  network — but it stops when the phone locks.

## Browser caching is not permanent

This is the part that must not be soft-pedalled.

iOS Safari applies eviction to script-writable storage — Cache Storage,
IndexedDB, localStorage — for origins the user has not visited. Historically that
window has been around seven days of no interaction, and the policy has changed
more than once. Storage can also be cleared at any time under device storage
pressure, by "Clear History and Website Data", or by iOS offloading.

Adding to the Home Screen and opening the app regularly reduces the risk. Nothing
removes it.

`navigator.storage.persist()` is offered on the Offline screen. Safari commonly
declines it, and even a grant makes eviction *less likely*, not impossible. Do
not treat a green tick there as a backup.

**Practical consequence:** open the app at least once every few days from mid
October, run "Prepare for offline use" on hotel wifi each evening, export captures
regularly, and carry the paper backup for the days that matter.

## The offline readiness screen

More → Offline readiness. It reports, per asset, whether it is actually in the
Cache Storage: the shell, the seven data files, the JavaScript, the stylesheet,
the manifest and the icons. It shows the data version, when it was last
synchronised, whether a service worker is controlling the page, which caches
exist, and the device's storage estimate.

"Prepare for offline use" re-fetches everything critical with `cache: 'reload'`,
reloads the dataset, and re-runs the check. Run it before a low-signal day.

It reports missing items individually rather than a single green tick, because
"mostly cached" is the state that bites: the shell loads and then a screen is
empty.

## The update flow

New builds do not self-install.

`registerType: 'prompt'`, `skipWaiting: false`, `clientsClaim: false`. A new
version downloads, installs, and waits. A banner appears at the top of Today and
Offline. The running version is untouched until the button is tapped.

If you are mid-walk, it can wait until tonight. That is the point.

**Export before updating.** Captures and private data live in IndexedDB and are
not touched by a service-worker update — but the one time that assumption is
wrong should not be the time it also has not been backed up. More → Settings →
Export captures, Export private data.

Four other things live only on the device and only in IndexedDB: the day plan
(`dayplan.v1`), places added by hand (`userpoints.v1`), adopted route edits
(`routeedits.v1`), and anchor adjustments (`anchoradjust.v1`). Route edits are
recoverable from the traced GPX files in `route-sources/working/`. The other
three are not recoverable from anything — they are hours of judgment stored in
one browser's database. Export places from More → Settings, and route edits and
anchor moves from the Route screen, before clearing site data or reinstalling.

The day plan exports too, from More → Settings → **Export the day plan**. It
writes both the overrides — the restorable part — and the resolved boundaries
with the route version they were measured against, so a stale file cannot be
mistaken for a current one. Export it before booking anything against those
boundaries.

**A known consequence of this design:** the very first load of a fresh install is
not controlled by the service worker. One reload hands control over. So after
installing to the Home Screen, open it, close it, and open it again before
relying on it offline.

## Recovery procedures

### The app will not load at all

1. Force-quit and reopen the Home Screen icon.
2. Open the deployed URL in Safari directly, rather than the installed icon.
3. If the shell loads but data does not, and there is signal: Offline readiness →
   Prepare for offline use.
4. If nothing works and there is signal: reinstall (below).
5. If there is no signal: use the paper backup. This app is a convenience; the
   walk does not depend on it.

### Storage was evicted

Symptoms: the app loads but shows no captures, no private data, and Offline
readiness reports critical items missing.

1. With signal, run "Prepare for offline use". Public data comes back — it is in
   the repository, not on your device only.
2. Captures and private data do **not** come back. Re-import the private file
   from wherever you keep it. Captures since your last export are gone.

This is why exporting matters.

### Reinstalling from scratch

1. Export captures and private data first, if the app still opens.
2. Delete the Home Screen icon.
3. Safari → Settings → Advanced → Website Data → remove the site's entry.
4. Visit the deployed URL, wait for it to load fully, reload once so the service
   worker takes control.
5. Add to Home Screen.
6. Open it, run Offline readiness → Prepare for offline use, confirm "Ready".
7. Re-import your private file and any capture export you want back.

### Rebuilding the app from source

Everything needed is in this folder. No hosted state, no database, no account.

```bash
npm install
npm run verify        # typecheck, lint, unit tests, build, build assertions
npm run preview       # serve dist/ locally
```

To publish, see `GITHUB-PAGES-DEPLOYMENT.md`. Rollback is `git revert` plus a
redeploy; the data version in the status strip tells you which dataset a phone is
actually holding.

## Field testing still to do

Not yet done, because it needs the physical device:

- [ ] Install to the iPhone Home Screen and confirm the icon, the standalone
      display, and the safe-area insets around the tab bar.
- [ ] Airplane mode, cold launch from the Home Screen icon.
- [ ] Leave it untouched for seven or more days, then open it and see what
      survived. This is the real eviction test and it takes a week.
- [ ] Full Safari restart, then relaunch.
- [ ] Battery draw over a real walking day with geolocation on.
- [ ] Legibility in direct sunlight, one-handed, with wet hands.
- [ ] Confirm the export flow actually produces a file you can retrieve on iOS —
      Safari routes downloads through a share sheet rather than a Downloads
      folder, which is why every export screen also offers copy-to-clipboard.

## Non-negotiable backups

The app is not the record. The primary field evidence remains:

- A dedicated GPS tracker for the actual walked track (this app cannot record in
  the background)
- Voice Memos for spoken notes
- The camera
- The paper notebook
- Printed day cards and addresses for the days where being wrong is expensive:
  Hakone, Utsunoya, Miya–Kuwana, Suzuka
