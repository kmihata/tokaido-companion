# Samwise

*Tokaido Field Companion. Named for the one who carries the load, keeps the
record, knows how far there is to go, and never decides the quest.*

A one-person operational field tool for walking the Tokaido from Tokyo to Kyoto,
October–November 2026. It is delivered as an installable website because a phone
web app needs no app store, no account, and no server — but it is a field
instrument, not a travel site.

> **Traced but unverified. Do not navigate with it.**
> The route runs Nihonbashi to Sanjō Ōhashi, 534.6 km — GPS traces from other
> walkers (旧街道足跡マップ, CC BY-SA 4.0), road-snapped and extended in
> gpx.studio on 2026-08-22. Nobody on this trip has checked it on the ground.
> Only 26 of 93 sections are sampled finely enough not to cut corners, the
> Hakone crossing still takes the switchbacks rather than the hybrid line this
> project prefers, and the Hakone Pass IC shoulder is unresolved. Hazards,
> bailouts and lodging are placeholders; the hotels are fictional.

## Purpose

Late in a long walking day, the questions are not "where am I" but "should I keep
going, and what does stopping cost me tomorrow". This app exists to answer those
without Kevin having to reconstruct the itinerary standing in the street:

- Where am I in the trip, and what is today's plan?
- What is the next consequential point — a hazard, the last practical rail exit?
- How much daylight and distance remain, and when will I arrive?
- If I stop here, how much moves to tomorrow?
- Is any of this available with no signal?

It also carries the things worth noticing at a place, a way to capture a short
note or a pointer to a voice memo, and a way to hand context to whichever AI
assistant Kevin is talking to.

## Current development status

Initial vertical slice, complete and verified locally. Not deployed anywhere.

| Area | State |
| --- | --- |
| PWA shell, manifest, icons | Working; installable |
| Service worker, offline precache | Working; verified with the network cut |
| Controlled update flow | Working; a new build never self-installs |
| Today / Decide / Map / Capture / More | Working |
| Day cards | 15 walking days seeded; 5 written out in operational detail |
| Decision calculator | Working; pure functions, 155 unit tests |
| Map | Working; Leaflet, real route, degrades without tiles |
| **Canonical route** | **534.6 km, one continuous stretch, no breaks, 99 anchors, reaching Sanjō Ōhashi** |
| **Route model** | **Paths, gaps, variants, anchors; discontinuities preserved** |
| **Route exports** | **Master GPX (one track per stretch), reference layer, active route GeoJSON** |
| Waypoints and places | 38 waypoints, 31 stations — only Kawasaki-juku still estimated |
| AI context packet | Working; copy/share, editable, provider-neutral |
| Field capture | Working; IndexedDB, NDJSON and plain-text export |
| Private data import/export | Working; strict validation, IndexedDB only |
| Offline readiness screen | Working; per-asset report |
| Hiroshige images | Metadata structures only. No images. No rights claimed |
| **Day planning** | **Working; boundaries as movable positions, both affected days shown before a move** |
| **Prepare Tomorrow** | **Working; per-day GPX, summary, user-confirmed readiness checklist** |
| **Snapshots** | **Working; save, restore, delete** |
| **Your own places** | **Working; crosshair, location or coordinates; anchors usable as day finishes; lodging private by default** |
| **Section export** | **Working; cut between two anchors, with a coarseness list showing where tracing would change something** |
| **Route import** | **Working; GPX and GeoJSON, adopted as replace-section, resolve-gap or variant, with a consequence preview** |
| **Route edits** | **Working; device-local delta, switchable, exportable, bakeable into shipped data** |
| In-app tracing | **Phase 3c.** Not started |
| Adjust Today (on-road) | **Phase 4.** Not started |
| Deployment | **Not done.** Prepared only; needs Kevin's approval |

## Setup

Node 20.19+ (22 recommended — see `.nvmrc`).

```bash
npm install
```

`node_modules/`, `dist/`, `test-results/` and `playwright-report/` are marked with
the Dropbox `com.dropbox.ignored` extended attribute so they do not sync. If you
clone this to a machine outside Dropbox, that is irrelevant; if you move it
inside another Dropbox folder, re-apply it:

```bash
xattr -w com.dropbox.ignored 1 node_modules dist test-results playwright-report
```

## Two apps, one repository

**The field app** (`index.html`) is what goes on the phone: small, offline,
legible one-handed at the end of a long day. Where am I, how far to the finish,
can I make it before dark, capture this.

**The desk** (`desk.html`) is route work: the export → trace → import → adopt →
bake loop in one place, with a worklist that knows which sections are done and
which file is currently out for tracing. It assumes a big screen and a network,
is never precached, and is not meant to be opened on the road.

If you are tracing sections, you want the desk. If you are walking, you want the
field app and nothing else.

## Commands

```bash
npm run dev          # dev server at http://localhost:5173/tokaido-companion/
                     #   field app:  .../tokaido-companion/
                     #   the desk:   .../tokaido-companion/desk.html
npm run build        # typecheck, then production build to dist/
npm run preview      # serve dist/ at the production subpath
npm run typecheck    # tsc --noEmit
npm run lint         # eslint
npm test             # unit tests (Vitest)
npm run test:build   # assertions about dist/ — run AFTER npm run build
npm run test:e2e     # Playwright, iPhone and desktop viewports, against dist/
npm run verify       # typecheck + lint + unit + build + build tests
npm run fixtures     # regenerate public/data/ from scripts/build-fixtures.mjs
npm run route:import # regenerate the route from the preserved source — run BEFORE fixtures
npm run route:gpx    # write footpath-test/TOKAIDO-MASTER.gpx using the app's own exporter
npm run route:audit -- <file|folder|zip>
                     # read-only: which traced files hold work the route does not have
npm run route:apply-edits -- <edits.json>   # bake exported route edits into public/data/
npm run icons        # regenerate public/icons/ from scripts/generate-icons.mjs
```

Data regeneration order is `route:import` then `fixtures`; the fixtures read
`public/data/anchors.geojson` for real coordinates and fail loudly without it.

`npm run test:e2e` needs browsers once: `npx playwright install chromium`.

The dev server runs at the same subpath as production, deliberately. See
`ARCHITECTURE.md`.

## Project structure

```
field-companion/
├── public/
│   ├── data/                 # versioned public dataset (generated, committed)
│   └── icons/                # PWA icons (generated, committed)
│   ├── lib/planningLine.ts   # the distance axis everything positional sits on
│   └── lib/dayPlan.ts        # day boundaries, legs, continuation, moves
├── route-sources/            # preserved source routes, unmodified, + provenance
├── footpath-test/            # device-test GPX files and the master export
├── examples/
│   └── private-data.example.json   # fictional; NOT bundled into the app
├── proposed/
│   └── deploy-github-pages.yml     # inert until deliberately moved
├── scripts/
│   ├── build-fixtures.mjs    # the one place coordinates are written down
│   └── generate-icons.mjs    # dependency-free PNG writer
├── src/
│   ├── lib/                  # pure logic: geo, daylight, pace, decision, packet
│   ├── data/                 # schemas (Zod), loader, private-data validation
│   ├── state/                # app state, settings, geolocation, connectivity
│   ├── components/           # shell, map, metrics, AI handoff
│   ├── screens/              # one file per screen
│   ├── pwa/register.ts       # service worker with an explicit update gate
│   └── router.ts             # ~60-line hash router
└── tests/
    ├── unit/                 # 155 tests, no DOM
    ├── build/                # assertions about dist/
    └── e2e/                  # Playwright: smoke, offline, accessibility
```

## Known limitations

These are properties of the platform, not bugs to be fixed later.

1. **No background location.** A browser PWA on iOS stops recording the moment
   the phone locks or the app is backgrounded. Apple Workout, Footpath, or
   another dedicated app remains the authoritative activity track. This app
   shows a foreground position only.
2. **Map tiles are not part of the offline guarantee.** They are best-effort
   runtime cache. Without them the map still draws the route line, the waypoints
   and the position dot on a blank background.
4. **Browser storage is not permanent.** iOS Safari evicts storage from sites it
   judges unused. Export captures regularly. See `OFFLINE-AND-RECOVERY.md`.
5. **Bailout distances are measured along the route now**, but the route samples
   at roughly 100 m and cuts corners, and the hop from the route to the station
   itself is still a straight line.
6. **Sunset is astronomical.** It ignores terrain. In a valley the light goes
   earlier than the number says.
7. **No Hiroshige images.** Metadata structures exist; nothing is displayed until
   rights are verified for a specific reproduction.
8. **The route is unverified and incomplete.** See the banner at the top.
9. **Elevation is not computed here.** Footpath ignores exported `<ele>` and
   substitutes its own terrain model, which is better; a second number would
   only contradict it.

## Next decisions

Named in `HANDOFF.md` with the reasoning. In short: which source route to adopt,
how to represent the Miya–Kuwana discontinuity, and whether to deploy to GitHub
Pages now or after the route data is real.

## Related project files

Kept in place, not duplicated here:

- `../STATUS.md` — project decision state
- `../DAILY-SCHEDULE-DRAFT.md` — the balancing draft the day cards are seeded from
- `../FOUNDATION.md` — route, safety, Hakone, Utsunoya, Suzuka research
- `../PRETRIP-CHECKLIST.md` — the living preparation list
