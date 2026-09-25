# Architecture — Samwise

Decisions, and the reasoning behind them, so another agent or developer can
disagree with them on the merits rather than guessing at intent.

## The governing constraint

This is a tool for one person, on one phone, on a road, sometimes with no signal,
often tired. Every choice below resolves in favour of: *works with the radio off*,
*readable in bright light one-handed*, *cannot silently change under you*, and
*a stranger can pick it up and continue*.

Portability is a hard requirement. Nothing here depends on Claude, Codex,
ChatGPT, a proprietary builder, a hosting provider's server runtime, an external
database, or on any conversation that produced it. The durable knowledge is in
these files.

## Stack

| Choice | Version | Why |
| --- | --- | --- |
| Vite | 8 | Ordinary, fast, static output, well documented |
| TypeScript | 6 | `strict`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax` |
| React | 19 | Boring and recognisable; the screens are mostly forms and lists |
| Leaflet | 1.9 | See below |
| Zod | 4 | Runtime validation at every trust boundary |
| vite-plugin-pwa (Workbox) | 1.3 | The standard service-worker generator |
| Vitest | 4 | Unit and build assertions |
| Playwright | 1.62 | Mobile-viewport and offline flows against the real build |

Four runtime dependencies. That is the whole list, and it is deliberate: every
package is one more thing that has to survive the offline precache and one more
thing a future maintainer has to reason about.

### Route data ships in the repository, not only in IndexedDB

The canonical route lives in `public/data/` and is precached by the service
worker. It is not sensitive — it is a road — and shipping it means an iOS Safari
storage eviction loses captures and imported private data but **not the route**,
which can be re-fetched. Had the route lived only in IndexedDB, an eviction on
day nine would have lost it outright. Field edits and revisions are the delta on
top, and those are what the export controls exist to back up.

### Leaflet, not MapLibre or a vector-tile renderer

MapLibre would give offline vector tiles via PMTiles, which sounds like the right
answer for a route through mountains with no signal. It is not, yet. A PMTiles
archive covering 500 km of corridor at useful zoom is tens to hundreds of
megabytes — well past what iOS Safari will hold, and past what should be shipped
before there is a real route to cover.

Leaflet's failure mode is the one that matters here. When tiles cannot load, the
base layer simply does not paint, and the route line, the waypoints and the
position dot stay on screen against a plain background. That degraded view —
the shape of the route, where the exits are, where I am relative to both — is
most of the operational value, and it costs 45 KB.

All markers are `circleMarker`, i.e. vectors. Leaflet's default pin loads image
files from inside the package, which bundlers routinely break and which would be
one more asset to keep in the precache.

**If offline base maps become a requirement**, the migration is: swap
`MapView.tsx` for a MapLibre implementation with a PMTiles source, and ship a
corridor-clipped extract. Nothing outside that one component knows what the map
library is.

### A hand-written hash router, not React Router

The deploy target is GitHub Pages at a project subpath. Pages serves static files
and cannot rewrite unknown paths to `index.html`, so history routing needs the
`404.html` redirect trick — which breaks the moment the app is opened offline
from the home screen, because there is no server to produce the 404. A hash route
resolves inside a document the service worker already holds. Deep links survive
reload, airplane mode, and a rename of the repository.

`src/router.ts` is about sixty lines. It is a dependency not taken, not a
framework reimplemented, and it is fully unit-tested.

### The same base path in dev, preview, and production

`vite.config.ts` sets `base` to `/tokaido-companion/` unconditionally, so the dev
server runs at `http://localhost:5173/tokaido-companion/`.

Serving dev at `/` and production at a subpath hides exactly the class of bug
this project cannot afford. It also has a specific trap: `vite preview` reports
itself as command `"serve"`, so a `command === 'serve' ? '/' : BASE` switch
silently serves a subpath build from the root and every asset 404s. That happened
during this build and is why the switch is gone.

Override with `BASE_PATH=/other-name/ npm run build` if the repository is renamed.
`tests/build/bundle.test.ts` builds at a second base and asserts it works.

## Data architecture

### Two layers, kept apart by construction

**Public/static** — `public/data/*.json` and `*.geojson`. Committed, precached by
the service worker, validated by Zod on load. The route framework, station and
waypoint data, public safety notes, demonstration schedule data.

**Private/local** — imported from a file Kevin picks, validated strictly, written
to IndexedDB, never committed, never uploaded, exportable, removable. See
`PRIVACY-AND-THREAT-MODEL.md`.

The separation is structural, not a convention: there is no code path that writes
private data into a file the build can see, and `tests/build/bundle.test.ts`
asserts no private example content reaches `dist/`.

### Fixtures are generated, not hand-edited

`scripts/build-fixtures.mjs` is the single place every coordinate is written
down, with a header saying plainly what those coordinates are worth. Running
`npm run fixtures` regenerates `public/data/`. The outputs are committed so the
app works from a clean checkout without a build step for data.

Every record carries `source`, `confidence`, `verification`, `lastChecked` and
`classification`. The point is not bookkeeping. It is that a number without its
provenance will be reasoned from — by Kevin at dusk, or by an AI handed the
context packet — as though it were surveyed.

### GeoJSON for spatial features, JSON for the rest

Route and waypoints are GeoJSON so any GIS tool, any GPX converter, and any other
agent can read them without a translator. Days, stations, trip container and
Hiroshige metadata are plain versioned JSON, because they are records, not
geometry. `DATA-SCHEMAS.md` documents both, including the planned GPX import
path.

## Offline architecture

Precache (guaranteed after one successful load): shell, JS, CSS, manifest, icons,
and all seven data files. 23 entries, about 620 KB.

Runtime cache, best-effort only: OpenStreetMap tiles, `CacheFirst`, 600 entries,
30 days. Explicitly **not** part of the offline guarantee, and the map says so
when tiles fail.

`registerType: 'prompt'` with `skipWaiting: false` and `clientsClaim: false`. A
new build downloads and waits. It replaces the running version only when Kevin
taps the button. Replacing a working field version unasked is the one failure
that could leave him on a mountainside with a broken app and no way back.

A consequence worth knowing: the very first page load of a fresh install is not
controlled by the service worker. One reload hands control over. That is asserted
in `tests/e2e/offline.spec.ts` rather than left as folklore.

## Calculation architecture

All decision maths lives in pure TypeScript under `src/lib/`, with no React and
no DOM:

- `geo.ts` — haversine, polyline length, cumulative distance, nearest point
- `daylight.ts` — NOAA solar position, from scratch
- `pace.ts` — pace, ETA, duration formatting
- `decision.ts` — the continue/reassess/stop model
- `dayContext.ts` — assembling one day's derived state
- `contextPacket.ts` — the AI handoff text

**Why sunrise/sunset is implemented rather than imported:** "how much light is
left" has to work in a valley with no signal. A network call is out, and a
package is one more thing that must survive the precache. Sixty lines of NOAA
equations are testable against known values — the tests assert Seattle's
sixteen-hour June solstice, Tokyo's eleven-hour October day, and twelve hours
everywhere at the equinox.

**Why `pace` means average speed including stops:** a moving pace that ignores
twenty minutes of photographs and a convenience-store stop promises daylight that
is not there.

**Why the posture is not advice:** `evaluateDecision` returns a `posture`, a list
of `reasons`, and a list of `warnings`. Any missing or implausible input resolves
to `insufficient-data` rather than a guess — an out-of-range pace suppresses every
time rather than trusting a typo. The UI states, on the card itself, that this is
arithmetic and not a safety recommendation. `tests/e2e/smoke.spec.ts` asserts that
sentence is present, so it cannot quietly disappear in a refactor.

## Information architecture — evaluated, not followed

The suggested IA was Today / Map / Day / Places / Capture / Offline+Settings.
Shipped: **Today · Decide · Map · Capture · More**, with Days, Places, Offline,
Settings and About under More.

Two changes and the reasoning:

1. **Decide gets a tab.** The stated central field problem is the continue-or-stop
   decision. Burying that calculator behind Today would put the most consequential
   screen at the greatest tap depth, which is backwards.
2. **Day and Places move under More.** On a walking day, Today *is* the day card —
   a separate Day tab duplicates it. Places is a browse surface, and browsing is a
   planning activity, not a field one.

Five targets across a phone width also keeps each comfortably past 48 px; six was
tight on a 375 px viewport.

Every screen that shows a distance, a coordinate, or a route line repeats the
non-navigational banner. A warning seen once on first launch is not present at
dusk on day four.

## Interface constraints

Mobile-first, in this priority order: readable in bright outdoor light at arm's
length one-handed; every target at least 48×48 CSS px; high contrast with no
colour-only meaning; no decorative animation; nothing essential behind hover;
16 px minimum font size on inputs so iOS Safari does not zoom on focus. Dark by
default, light when the OS asks. `viewport-fit=cover` with safe-area insets so
the tab bar clears the home indicator.

Desktop remains usable for planning and editing but is secondary; the Playwright
suite runs both viewports and the iPhone project is first.

## The route model

*Added 2026-08-20. This supersedes the line below that said Samwise is "not a
route builder". That was correct for the initial slice — there was no route to
build on. It stopped being correct when a real source route was adopted. The
original reasoning is preserved further down rather than deleted.*

### One line, and everything else positioned along it

The canonical route is an **ordered collection of paths**, where a path is a
continuous stretch of one kind. It is deliberately NOT chopped into editable
chunks, and it is deliberately not one single LineString either.

Everything else — annotations, hazards, surface notes, variant divergence
points, and **day boundaries** — is a *position or a range along* a path. A day
boundary is a movable number, not a piece of geometry. Moving it changes two
day distances and re-cuts nothing.

That separation exists because route construction and day-splitting are
different activities on different timescales. The whole 500 km line gets built
first; where the days break is then an iterative question driven by hotels and
knock-on effects between stages — set day 5, run day 6, find it too long, push
kilometres back into 5. If segments were the primitive, that loop would force
segmentation before the route was finished.

**Anchoring rule:** things anchor to *named points* — a station, a bridge, a
pass — in preference to raw distance-from-start. Repairing 400 m of the Hakone
west slope changes the length of everything downstream; an anchor at Hatajuku
does not move, a distance of 91.3 km does.

### Gaps are stated, never drawn

A path with no geometry is a gap: the Seven-ri ferry crossing, an approach
nobody has mapped, a stretch excluded as unwalkable. The route data can say
"there is a discontinuity here" without inventing a line across it.

A **variant** is an alternative alignment between two anchors, and activating
one can *resolve* a gap. The Saya Kaido — the Edo-period land route around the
sea crossing — diverges from the east path at a labelled junction and rejoins at
Kuwana, closing the Miya–Kuwana discontinuity on real ground rather than with a
drawn straight line.

`buildStretches()` assembles the active alignment from paths, active variants
and anchors, and returns **an array of continuous stretches plus a list of
breaks**. The subtle case, which this route actually has: a variant can diverge
from a path *before that path ends*, so the east path is truncated at the
divergence anchor and the spur down to the ferry landing is not walked.

That shape is not incidental. It is exactly what the Footpath export needs —
one `<trk>` per stretch — because Footpath silently bridges multiple segments
inside a single track. The data model and the export constraint agree.

### Day planning sits on the distance axis

`buildPlanningLine()` flattens the active stretches into one distance axis and
records where the breaks fall. Everything positional measures against that axis.

A day is stored as **one number**: `endAlongKm`, plus an `endAnchorId` when it
snaps to a named point. The anchor wins when it resolves, because a repair
upstream moves every distance downstream but does not move Hatajuku. Day *n*
runs from day *n−1*'s finish to its own, so moving one boundary changes exactly
two days and re-cuts no geometry — asserted directly in `dayPlan.test.ts`.

`moveDayEnd()` refuses a move that would cross the day before or the day after
rather than silently reordering. The UI never offers such a move in the first
place: candidate endpoints are the anchors strictly between the two bounds, and
each option is labelled with what it does to *both* affected days before it is
chosen. That is the balancing loop made visible.

**Defaults are derived, not stored.** Only days Kevin has actually moved are
persisted, as a delta in IndexedDB. A change to the underlying route therefore
flows through to every untouched day instead of freezing a stale distance.

**Snapshots, not undo/redo.** Whole-document and immutable. Simpler to reason
about, survives a reload, and is what "put it back" actually needs. The tracing
tool will get its own local point-stack undo when it exists; that is a different
problem.

### Writes to IndexedDB are serialized

Every store write is read-modify-write, so two in flight can clobber each other.
Ticking the last checklist box and immediately marking a day prepared did
exactly that, and the timestamp lost. All writes now go through one promise
queue in `dayPlanStore.ts`. Checkbox ticks stay optimistic — the box moves
immediately and persists behind — while a deliberate commit awaits the write, so
closing the app straight afterwards cannot lose it.

### Map colour and labels

**The route is orienteering magenta, `#e5007d`, over a white casing.** The amber
it started as was the same colour as OSM's highway casings — and the route runs
beside Route 1 for hundreds of kilometres, so the line disappeared into the road
it was meant to be distinguished from. Magenta appears nowhere in the OSM
palette, and it is the colour Kevin already reads as "this is the course". The
casing is the standard cartographic trick: a wider pale line underneath, so the
route survives a dark forest tile and a pale urban one without changing colour.

**Place names are ours, not the basemap's.** OSM renders `name`, which in Japan
is Japanese, and every *keyless* raster basemap does the same. English labels
would need Mapbox, MapTiler, Thunderforest or Stadia — all of which mean an API
key, an account, and a secret in the build, which `PRIVACY-AND-THREAT-MODEL.md`
rules out.

So the romanised names come from our own 98 anchors, drawn as permanent
tooltips. That is better than an English basemap in two ways: the names are the
ones that matter operationally (post stations, passes, bridges, checkpoints),
and unlike tiles they **still work with no network**.

Leaflet has no label collision handling, so `MapView` does it: anchors are
walked with post stations first, and a label is dropped if it would land within
96×16 px of one already placed. Three anchors within a few hundred metres on the
Hakone climb is normal, and unreadable if they all shout at once. Post stations
label from zoom 11, everything else from 13.

A **"No basemap"** option is offered deliberately. It is what no signal looks
like, and being able to check that view on purpose is worth a button.

### Every route edit is a variant

Nothing mutates the imported source geometry. A change to the route is a variant
that diverges from a path and either rejoins it, resolves a gap, or runs on to
the end. `buildStretches` assembles the result.

Three things fall out of that, and they are the reason for the choice:

1. **The original stays intact and comparable.** Both lines can be drawn.
2. **An edit is undone by switching it off**, not by restoring a backup.
3. **No anchor ever needs reindexing.** Splicing a path would invalidate the
   `indexOnPath` and `alongKm` of every anchor after the splice, and orphan any
   inside it. Because nothing is spliced, an anchor inside a replaced section
   simply stops being on the active line — and `anchorAlongKm` already returns
   null for that, which is exactly the right answer.

Edits live in IndexedDB as a delta on the shipped route, and are exportable.
`npm run route:apply-edits` bakes an export into `public/data/` permanently and
bumps the data version. That split matters: the shipped route survives an iOS
Safari storage eviction, a delta does not — so only the delta needs backing up,
and a permanent change should be promoted rather than left on the phone.

**An edit to a variant splices it.** "Every edit is a variant" left one case
unsaid: what happens when the thing being edited *is* a variant. Adding a second
variant alongside the first makes two alignments leave the route at the same
junction, and both get walked — which on the Saya Kaido added 45 km of route
that does not exist. So an edit whose two ends both sit on a variant is spliced
into that variant's geometry.

**The newest edit wins where two overlap.** Retracing a section and adopting the
better version is the normal way to improve it, so the first version adopted
must not keep winning — that leaves an edit visible in the app and absent from
the route, which is worse than an error. Superseded ids are returned and shown.

**Both ends must be on the same alignment.** `validateRouteEdit` refuses an edit
whose ends sit on different paths unless it is closing a gap, and endpoint
suggestion resolves the pair together rather than each end separately — because
a junction carries two anchors at the identical coordinate and matching them
independently picks whichever comes first.

**Endpoints must meet their anchors.** `validateRouteEdit` refuses geometry
whose ends sit more than 250 m from the anchors it claims to join, and warns
beyond 20 m. Adopting a section that does not meet the route would give the
assembled line an invisible jump — the self-inflicted version of the bridging
problem Footpath has.

### The route line is a centreline, deliberately

Route geometry follows road centrelines, and sections are retraced with the
editor's **cycling** profile rather than its walking one. That is a decision,
not an accident — see the provenance file for the traced source.

Japanese footway mapping is patchy. Routing a pedestrian profile over it
produces a line that zigzags between mapped fragments, asserting crossings that
will not be made at intersections where you simply walk across. False precision
is worse than a clean abstraction: the line's job is to say which way and which
street, and it should not claim more than it knows.

The resulting underestimate is well under one percent and smaller than several
terms already in play. Where the side of the road genuinely decides something —
the Hakone Pass IC shoulder, the Hamanako bridges, the Kiso crossings — the
answer is a recorded annotation, which survives a retrace, not a finer line,
which does not.

### Anchors can be nudged, and most of them must not be

An anchor is a linear reference: days and sections attach to the route through
it. Anchors came from recorded GPS trajectories, and walkers start and finish at
stations, so a trace that leaned toward a station forecourt left the anchor
leaning with it. 草薙駅前 sits on a vertex that pulls the line 38 m sideways and
straight back.

Retracing the section does not fix that, which is the point of the feature. The
anchor *is* the section boundary, so a retraced section is pinned to exactly the
bad point. Moving the anchor moves the boundary; the retrace then removes the
stray vertex. Two steps, in that order.

Adjustments are a device-side delta, like route edits — the shipped anchors are
never rewritten, and removing an adjustment restores the published position
exactly.

Three guards, each from a failure this project has already had:

- **Structural anchors are refused.** Where a path starts or ends, and where the
  Saya Kaido diverges or rejoins, the route model is pinned to the anchor.
  Anchors sitting on the same join are refused too — two indistinguishable
  anchors at one fork is precisely how 45 km was added to the route once.
- **An anchor may not pass its neighbours.** That would reorder the sections and
  change the apparent route length with no geometry having moved.
- **A move is capped at 500 m.** Beyond that it is a different place, not a
  correction.

The ranking earns its keep by separating a spike from a corner. Post towns were
laid out with dog-leg junctions to slow traffic, so the old road genuinely turns
ninety degrees at a post station: eight of the twelve sharpest turns on the
route are that, and ranking on detour alone put Tenryugawa Bridge and
Hodogaya-juku at the top of a list of things to fix, where there is nothing to
fix. A spike leaves the heading and resumes it; a corner turns and stays turned.

### Two entry points: the field app and the desk

`index.html` is the field app. `desk.html` is route work. They were one app
until 2026-09-13, and both halves suffered for it.

The field app was carrying six screens of editing tools — Route, Section,
Import, Adjust and the editing halves of Places and Plan — that will never be
opened on the road. On the road the app has to answer four questions: where am
I, how far to the finish, can I make it before dark, and let me capture this.
Everything else is something to navigate past on a phone, tired, one-handed,
and Kevin has no laptop for the twenty-six days of the walk.

Meanwhile the editing workflow had no home at all. The loop is export → trace
elsewhere → import → verify → adopt → bake, six steps across those six screens,
and the sequence lived only in Kevin's memory. It failed the way undocumented
sequences fail: a finished retrace of Yoshida-juku to Goyu-juku was exported on
2026-08-24, traced, and never came back. It sat in Downloads for three weeks
while the route kept the coarse line, and nothing noticed because nothing was
watching.

So the desk holds the loop as a loop. Its worklist ranks what to do next, and
an export that never came back outranks everything — including a worse section
nobody has started — because that is the only state here that loses work.

Two things make it trustworthy rather than more bookkeeping to maintain:

- **Progress is read off the shipped route, not remembered.** A section at 60 m
  point spacing or better was traced by hand; nothing else produces that. The
  geometry is the evidence, so the record in IndexedDB is never load-bearing.
  When device storage was cleared on 2026-09-13 it took five adopted retraces
  with it and the geometry was untouched — progress that can be derived cannot
  be lost that way. Stored status only survives where it says something the
  geometry cannot: deliberately skipped, or currently out for tracing.
- **Adopting shows what it does to the days first.** A retraced section measures
  longer than the coarse line it replaces, because the coarse line cut corners,
  so every cutoff after it moves forward. Hotels are booked against those
  cutoffs. `dayImpact` computes the real before-and-after legs rather than
  estimating, and says plainly when a day would finish at a different anchor.

The desk is deliberately **not precached** and has no service worker. Putting it
in the field app's cache would put the editing surface on the phone, which is
the thing this split exists to prevent, and would spend offline budget on it.
`navigateFallbackDenylist` keeps the field app's fallback from answering a desk
URL with the field app and making the desk look like it had vanished.

### Cutting a section out

Editing the whole route in one browser document is how 49 km of accidental
backtrack got appended to the end of an export without anyone noticing — the
document was too large for an extra 49 km to be visible. So the export half of
the round trip works **between two anchors**: five to fifteen kilometres, small
enough to see whole.

The section file carries the neighbouring anchors and nearby hazards as GPX
waypoints, so the Tokaido furniture is visible while tracing instead of bare
OSM. Coming back, the importer's nearest-anchor detection lands on exactly the
two ends the section was cut from, which makes the round trip close cleanly.

**`sectionsByCoarseness()` decides where the work is.** Mean point spacing is a
proxy for cutting corners, which is what makes a distance an underestimate and
what makes Footpath's cue sheet say `Unknown path`. The list is sorted worst
first so the choice is not guesswork — though rural stretches with few
junctions can stay coarse; it is cities and river crossings where it costs
something.

Lodging is excluded from section exports outright, and private user points are
filtered, for the same reason they are filtered everywhere else.

### Reading geometry back in

`parseRouteFile` handles GPX (`trk`, multi-`trk`, `trkseg`, `rte`) and GeoJSON
(`LineString`, `MultiLineString`, `Feature`, `FeatureCollection`), using
DOMParser — which is what the browser actually runs, so the unit tests run in
jsdom rather than against a hand-rolled parser that would diverge.

Two rules it does not bend. **Separate pieces stay separate**: multiple tracks,
multiple segments and MultiLineString parts all come back as distinct pieces
with a warning, because joining them invents a line across whatever separates
them. **Nothing is resampled or simplified**: the points come back as drawn.

Elevation is read and then dropped, with the reason stated in the UI: Footpath
substitutes its own terrain model, so a second set of numbers would only
contradict it.

### Placing a point: crosshair, not tap

The map moves under a stationary crosshair, and a button commits the position.
Tapping a target is worse on a phone in three ways: a stray pan misfires it, the
point being chosen sits under a thumb, and precision is limited by fingertip
size. The crosshair has none of those problems and works one-handed.

"Use my location" and a coordinate field cover the other two ways a place
becomes known. All three converge on the same commit.

### No automatic routing, ever

No OSRM, GraphHopper, OpenRouteService, Mapbox, Google, or Apple routing. No
road snapping. The line goes where it is put. Kevin owns every route-selection
decision, and a network dependency for route geometry would also be a
dependency the field cannot satisfy. `tests/build/bundle.test.ts` enforces the
network-host allowlist that keeps this true.

### Bulk tracing happens elsewhere

Samwise does not build a general geometry editor. Manual tracing of hundreds of
kilometres at street level is a solved problem, and gpx.studio or CalTopo do it
better than this project would. Samwise exports a **reference layer** — post
stations, passes, bridges, known hazards — to load underneath in that editor,
and imports the result back.

What Samwise owns is everything downstream and trip-specific: provenance,
classification, variants, day boundaries, derivation of active and continuation
routes, annotations, and the decision support. Nothing off the shelf does that.

Short in-app tracing for emergency replacement sections is still planned, and
is the only tracing the phone needs.

## What this deliberately is not

- Not a general geometry editor. Bulk tracing happens in a dedicated tool; see
  above. *(Originally: "Not a route builder. Building the real route is separate,
  larger work." True until 2026-08-20, when a source route was adopted.)*
- Not a GPS tracker. It cannot record in the background and says so.
- Not a manuscript environment. Capture is a short note and a pointer to a voice
  memo, not a writing tool.
- Not an AI client. It builds text; Kevin pastes it. No API, no key, no provider
  lock-in.
- Not a travel website.
