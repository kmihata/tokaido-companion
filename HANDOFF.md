# Handoff — Samwise

For the next session — Claude, Codex, or a human. Written 2026-08-18 at the end
of the initial build.

## Inbound — from another session, 2026-08-25

*Written by R2 (Claude Code) from Kevin's laptop, not by the Samwise session on
the Mac mini. This is a requirement note, not a completion record, and nothing
below has been implemented. Read `../MAIL-AND-LOGISTICS.md` for the full context
before acting on it.*

Two additions, both trip-critical, target **September 20** so they are in place
for the September 27 tired-day pilot and frozen with everything else on
October 5-11.

**1. Project imported lodging onto the route.** `src/screens/DayDetail.tsx:43`
renders private lodging as a text line — name and address only. It never reads
the `lat`/`lon` the private schema already carries and never calls
`projectOntoRoute`. The machinery exists: `src/lib/userPoints.ts` already gives
user-placed `hotel` points an `onRoute: { alongKm, offRouteKm }` projection. The
two halves simply do not meet. Surface `offRouteKm` on the day card and in
Decide — the question actually asked at dusk is how far off the line the bed is,
and what stopping here costs tomorrow.

**2. Japanese addresses geocode badly — decide the policy before building it.**
A wrong `lat`/`lon` produces a *confidently wrong* off-route distance, which is
worse than showing none. Open question, for Kevin: does geocoding run
automatically when the private file is generated in Seattle, or is it
hand-checked against the route before it reaches the phone? Whichever way it
goes, Samwise should treat a lodging coordinate as untrusted — carry its
confidence the way public records already do, and refuse to render a distance
it cannot stand behind rather than printing a plausible number.

**Scope boundary.** A generator outside this repository will write
`private-data-*.json` from Kevin's email on a nightly cycle. Samwise's job is
unchanged: consume a valid private file correctly. Nothing derived from email
may enter the repository, and the generator must never touch `public/data/`.

## Inbound — Writing Desk, 2026-09-11

> Written by R2 (Claude Code), 2026-09-11, from Kevin's statement that he takes
> no laptop and no iPad to Japan, and that he is not drafting on the road but
> capturing opportunistically so he does not miss story foundations. This is a
> requirement note, not a completion record.

The phone is Kevin's only writing surface for the twenty-six days of the trip.
`../WRITING-RUNWAY.md` already lists a phone-only editorial-prep and field-memory
system under "Meaningful evidence by departure"; it has never been built.

The full specification is in **`WRITING-DESK-SPEC.md`** in this folder. Read it
before acting. It is mostly a set of changes to `src/screens/Capture.tsx`, not a
new app — the capture model in `src/lib/capture.ts` and the share-sheet export in
`src/lib/download.ts` already do most of this.

Highest-value points:

- **`attachLocation` defaults off and must not.** Place and time are the anchor,
  and an anchor Kevin has to remember to tick while tired is one he will miss on
  exactly the days the material is best.
- **Dictation through the iOS keyboard is the whole voice feature.** No in-app
  audio recording; the existing Voice Memos pointer decision stands.
- **No filing at capture time.** Do not ask whether something is a chapter or a
  post. That is a desk job after return.
- **Export durability is a survival property, not a feature.** One action, and a
  visible days-since-last-export figure. No device insurance was selected.
- A thickening pass, surfaced opportunistically when the app is next opened,
  never as an evening ritual — `../WRITING-RUNWAY.md` forbids requiring Kevin to
  compile the day at night.
- Prompt material (field assignments, return-site prompts) is fixed at the
  October 11 freeze, so bake it in. No import pipeline.

Not yet placed against the three requirements already queued for the October 5-11
freeze. Kevin decides the trade; do not start on the strength of this note alone.

## Inbound — road lodging and cancellation decisions, 2026-09-03

> Written by Codex as R2, 2026-09-03, from Kevin's description of likely same-day versus three-plus-day course changes and a read of the current private schema and day/decision screens. This is a requirement note, not a completion record.

Kevin expects same-day and one-to-two-day route changes usually to preserve the booked hotel by taking a train around the changed section and returning to the route. A change three or more days ahead may justify changing a future hotel, but he needs to know whether free cancellation is still open before deciding.

Build two linked, private/offline views:

1. **Hotel detail**, reachable from Today, Prepare Tomorrow, the day card, and the relevant Decide result. Show hotel name; stay dates; address; copyable phone; check-in/out; booking provider or management source; payment state; exact free-cancellation deadline in property-local time/timezone plus countdown; later penalty/exposure; verified `offRouteKm`; rail-to-hotel and route-return notes; and last verification. A `tel:` link is optional convenience, not the only action path.
2. **Upcoming reservation decisions**, ordered by the next exact cancellation deadline. Distinguish `free cancellation open`, `penalty window`, `non-refundable`, and `deadline/terms unknown`. When a day boundary or future route plan changes, show which reservations may no longer fit and whether each can still be changed freely. Kevin's three-plus-day horizon is a useful default look-ahead, not a hardcoded rule; urgency comes from the exact cutoff timestamp. Do not cancel, modify, or recommend cancellation automatically.

This cannot be implemented by merely rendering the current `PrivateLodgingSchema`. Its `cancellationDeadline` is only an ISO date and loses the time and timezone needed for bookings whose free-cancel windows close at 09:00, 16:00, or 23:59 JST. Version the private schema explicitly and provide a migration or deliberate re-import path. Do not weaken strict import. Suggested semantic fields—not final names—are an exact offset timestamp for the free-cancel cutoff, structured later exposure/terms, phone, management/source reference, payment state, rail/return notes, and `verifiedAt`. All real values remain device-local and absent from fixtures, bundles, exports, tests, screenshots, and repository history.

## Inbound — offline food and recovery guide, 2026-09-03

> Written by Codex as R2, 2026-09-03, from Coach's evidence review, Kevin's conbini/yogurt discussion, and the current public/private Samwise boundary. This is a requirement note, not a completion record.

Add a compact **Food & recovery** guide reachable from Today and Prepare Tomorrow and available offline. It is an operational recognition and fallback tool, not a calorie counter or medical feature. The public guide should cover:

- a carbohydrate-plus-protein breakfast built from categories such as rice/bread, eggs/fish/chicken/tofu, and a tolerated yogurt or soy drink;
- eating from the first hour, a stage reserve, responsive drinking, and the finish-area carbohydrate-plus-protein bridge;
- exact-label recognition for common examples: standard Meiji R-1 (red branding) and LG21 (blue branding) drinks each provide only 3.3 g protein and are optional add-ons, while plain unsweetened Oikos is a more meaningful but still partial 13–18 g protein serving;
- an explicit warning not to encode advice as “red bottle” versus “blue bottle”: Meiji Bulgaria LB81 also uses blue-and-white branding, and the bowel-frequency evidence concerns regular LB81 intake over weeks rather than a predictable same-morning effect;
- a generic tolerance decision tree: use only a product already known to be comfortable on a critical morning; when dairy is uncertain or unwanted, choose soy plus a substantial ordinary protein food; stop rather than force a daily probiotic if symptoms appear; and treat lactase as a separately tested personal contingency, not default advice;
- evening Greek yogurt as an optional protein bridge when dinner/day intake is short, not a mandatory pre-sleep casein treatment; and
- tart cherry, if selected after training, as a small targeted recovery course for the hardest consecutive/high-descent block—not daily fuel.

The day data should carry sourced, dated operational facts for breakfast availability, first reliable food/water resupply, longest gap, last reliable resupply, and finish-area recovery access. Store stock varies: never promise a specific SKU merely because a chain normally carries it. Make the category fallback usable when the named example is absent.

Do not hard-code Kevin's lactose response, supplement use, or other health detail into public data, fixtures, screenshots, or repository history. If personalized dietary constraints are added later, version them as strict device-local private data and expose only the minimum operational flag needed by the guide. The physiology and exact tolerance-test record remain owned by `../../../Training/training-living-plan.md`; Samwise consumes the settled operational choice rather than becoming the health record.

## Current pickup — 2026-09-15

Two streams are live. A resuming session should know both before choosing work.

**Route — 0.16.0-traced, 536.43 km / 333.3 mi, 50 of 94 sections at 60 m or
better.** Seven sections were baked in on 2026-09-15, six of which held work
Kevin had already finished and lost track of. The schedule is rebalanced and
nothing is over 45 km. See "Seven more sections, and the button that lost them,
2026-09-15" below — **read that before touching the desk**, because the reason
those six went missing was a defect in the desk itself, not in the tracing.

**The tracing workflow changed, and it is simpler than the app implies.** Export
a section from the desk, trace it in gpx.studio, export it to Downloads, and
stop. Do NOT import it back into Samwise and adopt it — that path exists for
the phone in Japan, where a device-local edit is the only edit possible, and at
a desk it makes a second copy of work that is already safe in Dropbox and then
invites you to mark it done. `scripts/gpx-to-route-edit.mjs` takes the file
straight from Downloads.

    npm run route:audit -- ~/Downloads

**Run that at the end of every tracing session.** It prints `UNUSED WORK` for
any traced file finer than the route that was never baked in. It is the only
check that reads the actual Downloads folder against the actual route, and it
would have caught all nine of the sections that went missing.

**Route and map — active, and the last session moved it.** Phase 3a and 3b are
done. 2026-09-13 shipped **Route → Adjust an anchor** (`#/adjust`) and fixed two
real defects along the way: `anchorAlongKm` was snapping anchors to any vertex
within 55 m, and the detour ranking was confidently wrong because post-town
dog-legs are genuine corners, not defects. Two anchors were newly found worse
than the one Kevin asked about — **Yoshiwara-juku at 140 m with a 90-degree spike,
and Numazu-juku at 77 m**. See "Anchors can be moved onto the road, 2026-09-13".
The stated next task is still **split Day 12, then fill the route gaps**.

**Field writing — new since 2026-09-11, and the reason it matters is new.**
Kevin takes **no laptop and no iPad** to Japan. The phone is his only writing
surface for the twenty-six days, October 18 to November 12. He is not drafting on
the road; he is capturing opportunistically so story foundations are not lost,
and whether a fragment becomes a book chapter or an Aschematic post is a desk
decision after return.

What a session needs to know before touching that side:

- `WRITING-DESK-SPEC.md` in this folder is the specification. **Read its
  "Reconciliation" section first** — the earlier part of that document was
  written before `../WRITING-RUNWAY.md`'s "During Japan" section had been read,
  and the reconciliation corrects it.
- Samwise is **item 4 in a capture hierarchy it does not own**: voice notes
  primary, notebook second, photographs and track as evidence, location marks as
  the index. The app's job is the mark that makes a voice memo findable later by
  shared timestamp — not the place the writing lives. Do not build in-app audio
  recording.
- **Known defect 1 is the actionable one**: `attachLocation` defaults off in
  `src/screens/Capture.tsx`, so captures silently lose the anchor
  `../WRITING-RUNWAY.md` requires. One line. Highest value per effort in the
  whole app right now.
- **Not placed.** Whether the rest of the writing work happens before the
  October 5-11 freeze, against the three requirements already queued, is Kevin's
  decision and he has not made it.
- The September 27 tired-day pilot should answer one question before anything
  further is built: does a location mark plus a voice memo, joined by timestamp,
  reconstruct a scene a week later? If yes, the thickening pass in the spec dies.

Preserve the architecture boundary in both streams: bulk tracing stays in a
dedicated external editor; Samwise owns import-back, trip-specific route state,
and short emergency replacement sections.

## Read these first, in this order

1. `README.md` — what it is, how to run it
2. `ARCHITECTURE.md` — the decisions and why, including where they were argued
   against the original brief
3. `src/lib/decision.ts` — the centre of the whole thing
4. `scripts/build-fixtures.mjs` — the one place every coordinate is written down,
   with a header saying what those coordinates are worth
5. `DATA-SCHEMAS.md` — before touching any data file
6. `PRIVACY-AND-THREAT-MODEL.md` — before adding any field, link, or dependency

If the session touches `Capture`, dictation, or anything on the writing side:
`WRITING-DESK-SPEC.md`, and the "Inbound — Writing Desk" note above. Kevin has no
laptop and no iPad on the trip, so that screen is his only writing surface for
twenty-six days.

Then, in the parent folder: `../STATUS.md` and `../DAILY-SCHEDULE-DRAFT.md` for
planning state. `../FOUNDATION.md` has the Hakone, Utsunoya, Miya–Kuwana and
Suzuka research the day cards were seeded from.

## Commands to continue

```bash
cd Notes/tokaido-reset/field-companion
npm install
npm run verify                 # typecheck, lint, 155 unit tests, build, 18 bundle tests
npx playwright install chromium
npm run test:e2e               # 80 tests across iPhone and desktop viewports
npm run dev                    # http://localhost:5173/tokaido-companion/
```

Note the subpath in the dev URL. It is the same in dev, preview and production,
deliberately — see `ARCHITECTURE.md`.

## What was built

An installable, offline-capable PWA with a working vertical slice:

- **Today** — where I am in the trip, today's card, next consequential point,
  daylight and distance, offline status
- **Decide** — the continue/reassess/stop calculator with all inputs and working
  shown
- **Map** — Leaflet, corridor sketch, waypoints, stations, foreground position;
  degrades to a blank background when tiles fail
- **Capture** — typed notes, kinds, coordinates, verify-later flag, external
  reference, NDJSON and plain-text export, IndexedDB
- **More** → all days, places with filters, place detail, offline readiness,
  settings, about/privacy
- **AI handoff** on Today, Decide, day cards and place detail — editable,
  provider-neutral, private data off by default
- **Private data** import with strict validation, export, and removal
- **Offline readiness** with a per-asset report and a preparation action
- **Controlled updates** — a new build waits for a tap

## What is verified

Everything below was run, not assumed.

| Check | Result |
| --- | --- |
| `npm run typecheck` | clean |
| `npm run lint` | clean |
| `npm test` | 340 passed |
| `npm run build` | clean; 23 precache entries, ~620 KB |
| `npm run test:build` | 20 passed |
| `npm run test:e2e` | 154 passed (iPhone 13 and Desktop Chrome) |
| Offline, network cut in-browser | day cards, safety notes, calculator, places, capture all work |
| Subpath at a *second* base | rebuilt at `/some-other-name/` and asserted |
| Accessibility | axe, WCAG 2.1 AA, no serious or critical violations on ten screens |

Two bugs were found and fixed by these tests, both worth knowing about:

- `parseLocalTime` mis-corrected the timezone offset when the readback wrapped
  across midnight, so a 16:56 JST deadline resolved to the wrong day.
- `vite preview` reports itself as command `"serve"`, so a `command`-based base
  switch served a subpath build from the root and every asset 404'd.

## What remains provisional or demonstrative

**All of the data.** Say this plainly to Kevin every time it comes up.

- The route is a schematic corridor sketch: straight lines between approximate
  town placemarks, from general knowledge, never checked against a map. It
  follows no road and is not pedestrian-legal anywhere.
- Every coordinate is an approximate placemark, good to roughly a neighbourhood
  and sometimes worse.
- Distances come from `DAILY-SCHEDULE-DRAFT.md`, which is itself a balancing
  draft of historical post-station distances. Door-to-door figures are rough
  inflations, not measurements.
- Bailout distances are straight lines, not walking distances.
- Hotels are fictional placeholders.
- Trail conditions, tunnel status, timetables and pedestrian legality are all
  unverified. The Hakone, Utsunoya and Suzuka notes are transcribed from
  `../FOUNDATION.md` research, not confirmed.
- Sunset is astronomical and ignores terrain.
- Hiroshige records are metadata shells. No image, no institution, no rights, no
  viewpoint.

Only 5 of the 15 walking days have full operational content: walks 1, 4 (Hakone),
6 (Satta/Utsunoya), 12 (Miya–Kuwana), 14 (Suzuka). The other ten carry distance,
rail redundancy, sleep base and a tired-day line, which is enough to exercise the
app but not enough to walk from.

## Seven more sections, and the button that lost them, 2026-09-15

Route went **0.13.0-traced → 0.16.0-traced**, 536.16 → **536.43 km**, sections at
60 m or better **45 → 50 of 94**. Nothing on the route is above 140 m now.

Seven sections baked in:

| Section | was | now |
| --- | --- | --- |
| Okazaki-juku → Chiryu-juku (15.1 km) | 133 m | 43 m |
| Outside Kozu Station → Odawara-juku | 146 m | 61 m |
| Rokugobashi → Hatchonawate Station | 122 m | 35 m |
| Futagawa-juku → Iwaya Ryokuchi entrance | 132 m | 59 m |
| Ise Ohashi → Shichiri-no-watashi (Kuwana) | 123 m | 52 m |
| Abekawa Bridge → Mariko-juku | 125 m | 32 m |
| Mishima Taisha → Mishima-juku | 143 m | 72 m |

**Six of the seven were already traced and sitting in Downloads.** Three had been
there since the evening of 2026-09-13. That is nine recovered sections in three
days, and the cause is now known.

### "Mark baked" wrote a word and nothing else

`SectionPanel.tsx` had a **Mark baked** button under the card that tells you to
run the bake. It set `status: 'baked'` in IndexedDB. It could not have done more
— baking writes `public/data`, and a browser cannot. But `rank()` sorts `baked`
to the bottom, into the collapsed Done list, so **one click removed a section
from the worklist permanently while the shipped route still carried the coarse
line.**

Kevin found this, not the session. He said the desk showed Mishima as baked when
it plainly was not in the data; the session traced the two *derived* done-ness
paths, found neither could fire, and stopped — never checking the branch where
the stored record simply says `baked` and is believed.

The button is gone. `demoteUnsupportedBake` in `src/desk/sectionWork.ts` now
falls back to the furthest state the evidence supports — `adopted` if a trace was
adopted, `exported` if a file went out, `untouched` otherwise — so an unsupported
claim returns to the top of the worklist instead of sinking. Two tests cover it,
one named for the Mishima case.

The accepted cost: a genuinely baked section that never reached 60 m — the Abe
bridge case — will ask again if IndexedDB is cleared and `spacingAfterM` goes
with it. A desk that asks twice for finished work is a nuisance. A desk that
hides unfinished work is how nine sections went missing.

### The bake pipeline, and two things it caught

`scripts/gpx-to-route-edit.mjs` (new) turns a raw gpx.studio file into the
route-edit payload `route:apply-edits` already validates. It deliberately does
not write `public/data`; everything that can corrupt the dataset stays in the
baker, which is the tested part.

Two real defects surfaced during the first bake, both caught by existing tests:

- **An anchor 5.0 m off its own line.** Splicing the Ise Ohashi trace into
  `variant-saya` moved the line to the road, and `places every anchor on the
  geometry it claims to sit on` failed for a-075. The splice re-indexed the
  anchor but never moved it. `apply-route-edits.mjs` now moves an anchor whose
  `pathId` **is** the spliced variant onto its own line, capped at
  `ANCHOR_SNAP_KM = 0.025`, refusing above that. The cap is the a-036
  distinction: onto its own variant is fine, onto someone else's is corruption.
- **Fourteen-digit coordinates.** gpx.studio exports full float precision, so
  `136.68778943957156` tripped `keeps long digit runs — card, passport,
  confirmation numbers — out of the shipped data`. The test cannot tell a
  mantissa from a confirmation number, which is correct. The converter rounds to
  six decimals, matching every other feature.

### One anchor added — the first on a retrace variant

**`a-100 · 東栄町交差点 · Toeicho crossing (Shin-Anjo)`**, at 34.992280,
137.085008, on the Okazaki → Chiryu retrace variant at index 257.

It sits on the variant rather than `path-east` because the base path's nearest
vertex is **50.0 m away — exactly on `ANCHOR_TOLERANCE_KM`**, which would have
made the day finish resolve or not depending on rounding. This is the first
anchor in the project whose `pathId` is a retrace variant. **The coupling
matters: deactivate that retrace and Walk 10 loses its finish.**

It is `verification: 'manually-traced'` with `lastChecked: null`. It was first
written as `desk-checked` with a date, and `leaves every anchor unchecked on the
ground` failed — rightly. Nothing on this route has been seen by a human on the
ground, and stamping a date implies it has.

### The threshold moved to 45 km

`OVER_LONG_KM` in `src/lib/dayPlan.ts`, exported. It was a bare `40` in five
places — `planTotals`, the Plan screen, the Prepare screen, and twice in the
import preview — which is how those could have drifted apart. 40 was calibrated
when days ran 21 to 55 km; after the rebalance the spread is 21 to 44, so it
flagged five ordinary days and said nothing. **Plan now reads 0 days over 45.**

### Tests that named data rather than rules

Four more this session, bringing the running count to **eleven**:

- `sinks finished work to the bottom` — built a 250 m section with a bare
  `status: 'baked'` and asserted it sorted last. It was **pinning the defect**,
  the first time that has happened here.
- `no longer leaves Day 12 unwalkable` — asserted Walks 11+12 sum over 85 km.
  True for one day. Now asserts what cannot change: Walks 10–12 cover exactly
  the ground between Walk 9's finish and Walk 12's.
- The two over-40 e2e tests now read the threshold off the screen's own label.

The rule for this repo: **in a project whose data is under active correction,
assert the rule, not the reading.**

## Two ways the desk lied about its own progress, 2026-09-13

Both were mine, both had the same shape — a mechanism doing exactly what it was
told while hiding the thing it existed to report — and neither could be fixed by
reloading.

**The data was stale, permanently.** Every file under `data/` is precached by
the field app's service worker, and the desk reads the same files. With
`skipWaiting: false` — deliberate, so a working field build is never replaced
mid-walk — the new route did not reach the desk until every tab closed. Kevin's
desk sat on `0.5.0-traced` through seven bakes. `cache: 'no-cache'` does not
help: it governs the browser cache, and the service worker's fetch handler runs
first.

`loadDataset({ fresh: true })` now appends a query parameter, which does not
match the precached entry, so the request goes to the network. **The desk sets
it; the field app must never.** Its whole offline guarantee is that those files
come from the precache.

I had excluded `desk.html` from the precache to keep the editing surface off the
phone, and then left it reading data that was still in there — half a
separation.

**Then the fresh data made it worse.** With correct versions, finished sections
sorted to the bottom of a list capped at forty rows, so the header could report
"43 baked" while the list showed none of them. The cap is gone and done work is
collapsed under its own summary rather than cut off.

Related, same day: an `exported` status was allowed to outlive the evidence, so
two finished sections showed as "out for tracing". The rule is now that the
geometry outranks the record in every case except `skipped`, which is the one
state the data cannot express.

## Captures attach location by default, 2026-09-13

Known defect 1 in `WRITING-DESK-SPEC.md` is closed. It was described there as
one line, and was three.

`attachLocation` defaulted to `false`, so every capture silently lost the
location mark that `../WRITING-RUNWAY.md` makes the index — the thing that lets
a voice memo be found again later by shared timestamp and place.

Flipping the default alone would have made it worse. `geo.start()` was called
from the checkbox's own `onChange`, so a box that starts ticked never started
the watch: captures would have saved `lat: null` while appearing to carry a
position. The watch now starts when the Capture screen mounts, which also gives
the fix the seconds it needs before there is anything typed to save.

And a capture with no fix now **says so** rather than saving quietly:
"Saved to this device — but WITHOUT coordinates". It still saves. Losing the
thought is much worse than losing the coordinate, but a note that claims a
location it does not have is the same defect class as everything else this day
was spent on.

**On the privacy model.** The threat model forbids "live location, or any feed
of it" and that still holds. A feed is continuous, automatic and unasked-for,
and is impossible here anyway — an iOS PWA does not record in the background. A
capture is one point attached to one note Kevin decided to write. Sent nowhere,
`.gitignore`d, watch running only while that screen is open, checkbox still
there to refuse it. The reasoning is written into
`PRIVACY-AND-THREAT-MODEL.md` under its own heading so it is not re-argued from
scratch.

Worth noting the old default had a privacy cost of its own: a capture without
its location is a note whose "where" gets reconstructed from memory weeks
later, and reconstruction from memory is how things get recorded wrongly.

## Field knowledge goes in the shipped data, 2026-09-13

`wp-tenryu-bridge-access` records what Kevin worked out in Street View about the
Tenryu crossing: three spans, only one with a walkway, reachable only by
continuing under the bridge and looping back. It is attached to Walk 8's
`hazardWaypointIds`, so it surfaces on the day card rather than only to someone
who pans the map there, and it carries a verification task saying plainly that
this is Street View and not the ground.

**It is a shipped waypoint, not a user point.** User points live in IndexedDB,
which is what was cleared this morning and took five retraces with it. There is
nothing private here — it is a fact about a bridge — so it belongs in
`public/data/`, precached and network-recoverable.

The general rule this settles: **a user point is for things that are Kevin's —
a booking, a private meeting place. Public field knowledge belongs in the
repository**, where it survives a cleared cache and a new device, and where the
reasoning can sit next to it in `build-fixtures.mjs`.

Both halves of the 423 m are described separately, because they are different
kinds of thing: the ferry-site spur is optional on a tired day, the bridge
access is not. A day card that says only "423 m detour here" would leave that
distinction to be worked out at the end of a long walk.

## The checks moved into the desk, and found one more, 2026-09-13

`src/lib/traceChecks.ts` now runs on every file the desk imports, before
anything about how the edit joins the route. Two checks, both from real
failures:

- **Revisit** — two points within 40 m with more than 400 m of line between
  them. Catches the Tenryugawa 2.7 km loop and the Ejiri 419 m tail.
- **Sinuosity** — path length over the straight line between the endpoints. The
  bad Mitsuke file ran 35.31; the corrected one runs 2.14, because the old road
  genuinely wanders. One division separates them.

A flagged file is warned about, not blocked: the button becomes **Adopt
anyway**. A detour in the middle of an otherwise sound trace can be real, and
the operator is better placed to judge than the threshold is.

The checks render **outside** the validation branch. An out-and-back usually
fails to join as well, and the join error was hiding the actual fault — the
file, not the join.

**It immediately surfaced the 423 m tail loop in Mitsuke to Tenryugawa**, which
a hand check had cleared an hour earlier — that check required 12 points between
a revisit and the loop spans 11.

**The loop is real and stays in the route.** Kevin verified it in Street View:
it is an out-and-back to the **historic Tenryu ferry site**, which is where the
Tokaido actually went, plus a forced loop **under the bridge**. Three bridge
sections cross there, one two-way road and two one-way highway spans, and only
one carries a pedestrian walkway — reachable only by going under and looping
back. That is the whole reason for the shape.

I had called it an artifact because the 60-point source line has no such loop.
That was bad reasoning and worth remembering: **a line sampled at 152 m cannot
represent a 423 m feature, so its silence is not evidence.** Street View
settles this class of question; comparing against a coarser line does not.

This is the second time in a day that a flagged detour turned out to be real
information — the Kusanagi crash barrier was the first. The check is still
worth having: three of the four things it caught were genuine faults. But the
default reading of a flag should be "go and look", not "delete".

## The day plan can be exported, 2026-09-13

More → Settings → **Export the day plan**. It was the last device-local state
with no file behind it: route edits rebuild from `route-sources/working/`,
places export from Settings, anchor moves from the Route screen, but which day
finishes where was recoverable from nothing.

The file holds `overrides` — the restorable part, only days moved by hand, so a
retrace flows through to untouched days instead of freezing a stale distance —
and `days`, the resolved boundaries with dates and finishing points, readable
without the app.

It stamps `routeDataVersion`, and that is the part worth keeping. The route
moved from `0.3.0-traced` to `0.11.0-traced` in a single day and every retrace
pushes the later boundaries forward. Without the version, a plan exported this
morning is indistinguishable from one exported this afternoon, and hotels are
booked against these numbers.

## The end marker is where traces go wrong, 2026-09-13

Three of the day's traces came back carrying an out-and-back, and all three had
the same cause: the end marker sitting somewhere the router had to return to.

- Tenryugawa to Hamamatsu: 2.7 km loop at the start, 11.74 km for an 8.81 km section
- Ejiri to Kusanagi: 419 m at the end, reaching within 23 m of the anchor and
  then walking 250 m back
- **Mitsuke to Tenryugawa: 8.8 km out and 8.4 km back** — 17.64 km for a 8.95 km
  section, ending 500 m from where it started

The last would have put nearly nine phantom kilometres into the route. What made
it obvious was **sinuosity 35.31**: path length over straight-line distance
between the endpoints. A section that returns near its origin has an enormous
ratio and no amount of eyeballing the map beats one division.

The loop detector — any two points within 40 m of each other with more than
400 m of line between them — catches all three. Both checks now run on every
file before it is baked, and they belong in the desk's import preview rather
than in a script only Claude runs.

Kevin's re-save fixed Mitsuke completely: 9.10 km, 40 m spacing, both endpoints
exact, max deviation 14 m from the old line — which also confirmed the trace
never wandered onto the 姫街道, whose junction with the Tokaido is at Mitsuke
and is the one place on the remaining list where the wrong branch would look
entirely plausible.

## An anchor cannot be moved onto a variant, 2026-09-13

Kevin asked for the Kusanagi anchor to be moved onto the retraced line, which is
a reasonable thing to ask and is not possible in this model.

Anchors carry `pathId` and `indexOnPath` into the **base path**. A retrace is a
variant layered over that path, not a replacement for it, so an anchor moved
onto the variant no longer sits on the geometry it claims to. `routeModel`'s
"places every anchor on the geometry it claims to sit on" catches it — it caught
a-036 after I moved it by hand.

Worse, `apply-route-edits.mjs` had been taught an hour earlier to do exactly
that automatically for any retrace whose endpoints ended up beyond 50 m. It
would have silently produced self-contradicting data on every such edit. It now
**refuses and explains**: either end the trace nearer its anchor, or retrace the
base path. A retrace that moves a line that far is asking for something the
delta model cannot express, and saying so is better than a file that disagrees
with itself.

The practical answer is usually nothing: below `ANCHOR_TOLERANCE_KM` (50 m) the
anchor still projects onto the active route and everything resolves. a-036 sits
23 m from the retraced line and works.

## The adjust screen ran out of things to show, 2026-09-13

After thirteen retraces, `anchorsOffRoute` finds **no spikes and no corners** —
the flagged lists are empty, which is the correct answer and made the screen
unusable, because the only way to open an anchor was to click one it had
flagged.

There is now an **"Any anchor" picker**, always present, listing every
non-structural anchor by kilometre. An anchor can be a poor place to stand
without the geometry showing anything wrong; that was the Kusanagi case from the
start.

**Watch this:** 26 of 99 anchors are now structural, up from about 8. Every
retrace pins its two endpoints, because a variant is attached to the anchors it
diverges and rejoins at. As more sections are retraced, fewer anchors can be
adjusted. Correct, but the tool's reach shrinks as the route improves.

## Twelve sections retraced, and where the work was hiding, 2026-09-13

The route went from 534.64 km to **535.81 km**, and from **8 of 93 sections at
60 m point spacing or better to 39**. Twelve retraces are baked into
`public/data/` at `0.8.0-traced`.

**Most of that was not new tracing.** Seven of the twelve were work Kevin had
already done and lost track of:

- Yoshida-juku to Goyu-juku — in Downloads since 2026-08-24, unused for three weeks
- Banyubashi to Hiratsuka — traced inside gpx.studio, never exported
- Tennocho to Hodogaya, Maisaka to Arai Sekisho, Iwaya Ryokuchi to Yoshida,
  Arai-juku to Futagawa — found by exporting everything out of gpx.studio and
  running `npm run route:audit`

`scripts/audit-traced-files.mjs` exists because of this. Point it at a file,
folder or zip and it says which files hold work the route does not have. Its
first version compared against the base path geometry and confidently reported
all seven already-baked retraces as unused — a retrace is a variant layered
*over* its path, not spliced into it, so the base still holds the coarse line.
It now reads the variants and prints how many sections carry one; if that count
is zero, distrust the output.

**Tenryugawa Bridge to Hamamatsu had a 2.7 km out-and-back at the start.** The
line went out 1.37 km and retraced its own points exactly back to the origin
before setting off — the same shape as the 49 km backtrack in August, small
enough to look like nothing. It showed up as a 546 m deviation from the existing
line; once Kevin cut it, deviation fell to 17 m and the length went 11.74 km →
8.85 km. **A section that comes back much longer than it went out is the first
thing to check**, and the loop detector is a few lines: any two points within
40 m of each other with real distance of line between them.

**The route's worst single step is now 712 m, and that is correct.** It is the
Tenryu river crossing. A bridge is a straight line; adding points along it would
change nothing. The metric got worse while the route got better, which is
recorded in `route-meta.json` so nobody re-discovers it as a defect.

**Not baked, deliberately:** Ejiri-juku to Kusanagi. The traced file follows the
existing line to within 2 m median — and that line is on Route 407, not the
street named 旧東海道 that Google and the OSM basemap both show carrying the old
road. Densifying it would lock the error in more finely. It also stops 162 m
short of the anchor. That section needs re-routing, not re-sampling.

**A pattern worth naming:** four separate tests broke today because they named a
piece of route data — "central Tokyo is the coarsest stretch", "Odawara to
Mishima starts at 85 km", "Tenryugawa Bridge is a dog-leg", a fixture pinned to
one section. Each failed because the data improved. In a project whose data is
actively being corrected, a test that names a datum has an expiry date; assert
the rule, or derive the datum at test time from the same source the app reads.

## The desk, 2026-09-13

`desk.html` — a second entry point for route work, built after Kevin said the
editing work was spread through the app he will use on the road and he was
having to memorise the sequence.

The argument for it is the Yoshida file: exported 2026-08-24, traced, and never
brought back. It sat in Downloads for three weeks at 43 m spacing while the
route kept the 184 m line, and nothing noticed because nothing was watching the
loop. The desk watches it. An export that has been out three days is called out
above every other row, including coarser sections nobody has started.

Two design points worth keeping:

- **Progress is derived from the route, not from stored state.** A section at
  60 m spacing or better was traced by hand. The record in IndexedDB is never
  load-bearing, which matters because that database has already been cleared
  once in this project's life and took five retraces with it. Stored status
  wins only where the geometry cannot speak: skipped, or out for tracing.
- **Adopting shows the day-boundary consequence first.** Kevin books hotels
  against the cutoffs, and every retrace lengthens the route slightly and pushes
  every later cutoff forward. `dayImpact` computes the real legs before and
  after and says when a day would finish at a different anchor.

Not precached, no service worker, `navigateFallbackDenylist` on `/desk/`.
Verified: zero desk files in the precache manifest.

**Still open, and deliberately not done:** the editing screens are still in the
field app. Removing Route, Section, Import and Adjust from the tab bar is the
obvious next step and would make the field app meaningfully smaller, but it
removes capability from the phone and Kevin may want Adjust out there. His call.

**Phase B, not built:** a local write path so adopting bakes directly, with no
CLI and no round trip through Downloads. Worth doing only if Phase A proves the
flow.

## Five retraces baked into the shipped route, 2026-09-13

**How this came up:** I told Kevin to clear site data to shift some cached
"Access blocked" tiles, without saying that IndexedDB goes with it. It took his
five adopted section retraces, the Kusanagi anchor adjustment, and anything else
device-local. The traced GPX files in `route-sources/working/` are the only
reason this was recoverable, and they exist because Kevin asked for them in
August specifically so he would not lose hours.

The five edits were rebuilt from those files and baked in, so they can no longer
be lost with a cache. `dataVersion` is now `0.4.0-traced`, the active route is
**535.27 km**, and 31 of 93 sections are at 60 m point spacing or better, up
from 8. Worst remaining gap anywhere is 614 m.

Three defects surfaced in `scripts/apply-route-edits.mjs` doing it, all of which
would have bitten anyone baking in an edit:

- **An edit on a variant was appended beside it, not spliced into it.** The Saya
  retrace produced a variant nothing referenced: `buildStretches` walks the
  active alignment and never saw it, so the section still measured 266 m between
  points after supposedly being baked in, while the file looked correct.
  `applyRouteEdits` had always spliced; the script had not.
- **Splicing reindexes the variant, and anchors on it were not re-projected.**
  Manba Ohashi came out 8.1 km adrift. The script now re-projects every anchor
  on a spliced path and rewrites `anchors.geojson`.
- **`totals` was left at the pre-edit numbers.** The script still does not
  reassemble the route, so this stays a manual step — but it now says so, and
  the `routeModel` test "measures the assembled line as the sum of its parts"
  fails until the totals are corrected. That test is what caught it.

Reconstructing the edits also needed care at the Saya fork: the junction anchor
on `path-east` and the variant's own start anchor share a coordinate, so
"nearest anchor" picked between them by rounding error and would have produced a
cross-alignment edit — the shape of the +45 km incident. Endpoints are now
resolved onto a single alignment before an edit is built.

**Device state is now empty and should stay that way** until the next retrace.
Nothing on the device is load-bearing.

## OpenStreetMap blocked the basemap, 2026-09-13

Kevin zoomed in on the map and the tiles were replaced by "Access blocked — App
is not following the tile usage policy of OpenStreetMap's volunteer-run
servers".

`index.html` set `<meta name="referrer" content="no-referrer">`, a deliberate
privacy choice recorded in `PRIVACY-AND-THREAT-MODEL.md`. It collides with
OpenStreetMap's requirement that a request identify the app that made it: a
browser cannot set a User-Agent, so the Referer is the only identification
there is, and sending none is a policy violation. Now
`strict-origin-when-cross-origin`, which sends the origin and nothing else — no
path, no query, and hashes never appear in a Referer, so the day, place or route
stretch on screen stays private. The tile server already learns the IP and the
tile coordinates. All five outbound links carry `rel="noreferrer"` themselves,
which overrides the document policy, so link privacy is unchanged.

**It blocked again, and the referrer was not the cause.** Direct requests from
the same machine returned real tiles throughout — with a browser User-Agent and
no Referer at all. Nothing was being refused. The browser was serving the
"Access blocked" images **out of its own cache**, and no refresh could dislodge
them, because `CacheFirst` answers from disk before the network is consulted.

The real defect: Leaflet loaded tiles as plain `<img>`, so responses were opaque
and every one reported status 0 — a refused tile and a real tile
indistinguishable — while the Workbox rule cached `statuses: [0, 200]`. A 403
was therefore stored exactly like a valid tile, for thirty days. Fixed by
setting `crossOrigin: 'anonymous'` on the tile layers (both servers send
`access-control-allow-origin: *`) and narrowing the rule to `statuses: [200]`.
A refusal is now visible as a refusal, is never cached, and the map recovers on
its own once a block lifts.

**Honest about causation:** the missing Referer was a genuine policy violation
and is fixed on its own merits, but it was *not* what Kevin was seeing. The
first write-up of this incident guessed at a cause and treated tiles loading
afterwards as confirmation, when the clearing of the cache during testing was
doing the work. The lesson is the ordinary one: check whether the server is
actually refusing before theorising about why it might be.

Also fixed: the tile cache names are now `-v2`. Leaflet requests tiles as
`<img>`, so a blocked tile arrives as an opaque status-0 response and is cached
exactly like a real one, for thirty days. Bumping the name is what actually
clears them — a device that saw the block keeps showing it otherwise.

**Do not pre-load the corridor.** Panning the whole 535 km to warm the cache is
precisely what the policy forbids, and 600 entries could not hold it anyway.
Tiles are a convenience near where you have recently looked, not offline
coverage. The real answer for the mountains is the PMTiles route in
`ARCHITECTURE.md`.

## Anchors can be moved onto the road, 2026-09-13

Kevin asked why the route jogs up to the Kusanagi anchor. It is one stray vertex
that pulls the line 38 m sideways and straight back, in a section sampled at
158 m — ordinary noise in recorded GPS, except that the anchor is the section
boundary, so retracing could never fix it.

New: **Route → Adjust an anchor** (`#/adjust`). Lists anchors the line detours to
reach, and moves one onto the route as a device-side delta.

Two things fell out of building it.

**`anchorAlongKm` was snapping anchors to any vertex within 55 m.** The tolerance
was 0.0005 degrees where the comment claimed an exact-vertex match, and with the
route averaging 69 m between points that silently dragged deliberately-placed
points back to the nearest vertex — Kevin's own anchors included. Now 1e-6
degrees, which is below the six-decimal storage precision. All 99 shipped
anchors sit exactly on a vertex, so nothing moved.

**Ranking by detour was wrong, and confidently so.** Post towns were built with
dog-leg junctions, so the Tokaido really does turn ninety degrees at a post
station; eight of the twelve sharpest turns are genuine corners. The first list
put Tenryugawa Bridge and Hodogaya-juku at the top of a list of defects that had
none. The ranking now separates a spike (leaves the heading, resumes it) from a
corner (turns and stays turned), and shows corners in their own section saying
they are fine.

**Worth knowing: Yoshiwara-juku is worse than Kusanagi** — 140 m detour, 90 degree
spike — and Numazu-juku is 77 m. Neither had been noticed.

Guards: structural anchors refused (path ends, Saya diverge/rejoin, and anything
sitting on the same join); no passing a neighbour; 500 m cap; a reason required.

360 unit, 20 build, 154 e2e.

## The route ended at four identical anchors, 2026-09-03

Kevin asked why the Kusanagi Station anchor was not where a map search put the
station. It was not misplaced. The Japanese name is 草薙駅前 — the forecourt in
*front* of the station, which is where the Tokaido passes. The romanised English
title dropped the 前 and claimed the anchor was the station itself, so a correct
anchor read as a wrong one. Same fault at 国府津駅前. Both now say "Outside …".

Checking that turned up something worse. `scripts/import-traced-route.mjs` reads
its own previous output as input, and appended a terminus anchor at Sanjo Ohashi
on **every run**, each under a new id. Three had accumulated: a-099, a-100 and
a-101, all named 三条大橋, all at the same coordinate, all offered as choices in
the day-end and section pickers with nothing to tell them apart. This is the
same shape as the Saya Kaido incident — indistinguishable anchors, an edit that
attaches to the wrong one, and no way to see which.

Three fixes:

- The script now filters previously self-added anchors out before re-adding
  them, matching on the terminus **name**. Matching on a `source` marker did not
  work: the re-projection loop rewrites `source` on every anchor it touches, so
  only the newest copy still carried the marker and the older two survived.
- The new id is derived from the highest id present rather than the count, so a
  gap in the sequence cannot reissue an id already in use.
- The script now **throws** if any two anchors share an id, or share a name and
  a position. That check is what caught the accumulated duplicates.

Running it three times in a row now produces identical output. Route geometry is
byte-identical to before, no anchor moved, and no `alongKm` changed — only the
two retitles and the two removals. Stored day plans referencing a removed id
fall back to the stored kilometre, which is the same point, so nothing shifts.

## Retraced sections were being ignored, 2026-08-23

Kevin retraced Hara-juku → Yoshiwara-juku to close a 701 m gap, adopted the
better version, and it had no effect. The first edit adopted for a stretch kept
winning; the newer one sat in the list looking active while being absent from
the route.

- **`applyRouteEdits` now gives precedence to the newest edit** where two cover
  overlapping ranges on the same alignment, and returns `superseded` ids.
- **The Route screen labels a superseded edit as such** and says a newer change
  replaced it, rather than leaving it to be discovered.
- **The Import screen warns before adopting** over a stretch an active edit
  already covers.

Four regression tests under *two edits covering the same stretch*, including
that adoption order does not matter and that an inactive edit supersedes
nothing.

## The Saya Kaido incident, 2026-08-23

Kevin exported the Saya divergence → Manba Ohashi section, traced it, and the
import preview said the route would grow from 534.6 km to **580 km**. He did not
finalise it. He was right not to: three defects, all mine.

**1. Coincident anchors landed on the wrong geometry.** A junction is the last
point of one alignment and the first of the next, so two anchors share a
coordinate. `import-traced-route.mjs` matched by nearest point and put the
Saya's own start (`a-071`) on `path-east`. Fixed with an explicit
`PATH_OVERRIDES` map — where a junction anchor belongs is a fact to state, not
to infer. `a-077` Kuwana-juku was wrong the same way.

**2. Both anchors were named "Tokaido / Saya Kaido divergence" in English**, so
the picker could not tell them apart. Now "Saya Kaido junction (on the Tokaido)"
and "Saya Kaido start".

**3. The model had no way to edit a variant.** With both the Saya and the new
edit appearing to leave `path-east` at the same junction, `buildStretches`
appended both — the whole Saya (36.4 km) plus the new section (9.25 km) — for
the 45 km. Three changes:

- **`applyRouteEdits` splices a variant** when both ends lie on it, instead of
  adding a second one alongside. This was the missing case: "every edit is a
  variant" never said what happens when the thing being edited *is* a variant.
- **`validateRouteEdit` refuses an edit spanning two alignments** unless it is
  closing a gap. That check alone would have caught this.
- **`buildStretches` guards** against two active variants leaving the same
  point, so the duplication cannot recur however it arises.

**Endpoint suggestion now resolves the pair, not each end separately.** Where
two anchors tie on distance, the ends agree about which alignment they are on.
The section now imports as **+0.20 km**, which is the difference between a
9.05 km section and a 9.25 km one.

Five regression tests in `tests/unit/routeEdits.test.ts` under *editing a
section of a variant*.

## The route reaches Kyoto, 2026-08-23

Kevin traced a session in gpx.studio and the result is now the shipped route.

- **`scripts/import-traced-route.mjs`** replaces `import-kaidotrail.mjs` as
  `npm run route:import`. The old one is kept and marked superseded; the traced
  line is a derivative of that source and inherits its CC BY-SA 4.0 licence.
- The traced line is **split back into the path/variant model** rather than
  flattened, so the Miya–Kuwana crossing stays an honest gap that the Saya Kaidō
  resolves. All 99 anchors are re-projected onto the new geometry; **none moved
  more than 500 m**.
- A **terminus anchor was added** — 三条大橋, Sanjō Ōhashi. The upstream source
  stopped 6 km short, so there was no named point for the last day to finish at.

### The route as it now stands

**534.6 km, one continuous stretch, no breaks.** Mean point spacing 69 m,
against 105 m before.

| | before | after |
| --- | ---: | ---: |
| Length | 526.9 km | **534.6 km** |
| Reaches Sanjō Ōhashi | no | **yes** |
| Breaks | 1 | **0** |
| Sections at 60 m spacing or better | 8 of 92 | **26 of 93** |

Day 15 goes from 29.4 km to **36.5 km** — what it was always going to be once
the route reached Kyoto. The fifteen-day mean is now **35.6 km**.

**Day 12 is still 51.5 km** and remains the outstanding schedule problem.

### Still the work queue

Only 26 of 93 sections are finely sampled. The coarsest, which the tracing
session did not touch:

| Spacing | Length | Section |
| ---: | ---: | --- |
| 272 m | 8.7 km | Nihonbashi → Shinagawa-juku |
| 266 m | 9.0 km | Saya divergence → Manba Ōhashi |
| 255 m | 6.6 km | Numazu-juku → Hara-juku |
| 240 m | 12.0 km | Hamamatsu-juku → Maisaka-juku |

`#/section` ranks them live. Rural stretches can stay coarse; cities and river
crossings are where it costs something.

### A cautionary note worth keeping

The raw editor export was 583.9 km, because 49.3 km of accidental backtrack had
appended itself after the Kyoto approach — gpx.studio holds the route as one
track and adds new points at the end, so clicks made while working on a later
section extended the route from Kyoto backwards. It was invisible in a 534 km
document. Both the raw export and the cleaned line are preserved in
`route-sources/kevin-traced-2026-08-22/`. **This is why `#/section` exists.**

## Section export, 2026-08-22

The missing half of the editing workflow. Kevin traced a session in gpx.studio
with the whole 534 km route loaded, and 49 km of accidental backtrack appended
itself to the end without being noticed — the document was too big for it to be
visible. Sections fix that.

- **`src/lib/sectionExport.ts`** — cut between two anchors, with stats; one
  track per file, neighbouring anchors and hazards as context waypoints; lodging
  excluded and private user points filtered.
- **`#/section`** — a live coarseness list, worst first, and free choice of both
  ends. Sections over 25 km get a warning that they are too big to edit safely.
- The importer's nearest-anchor detection lands on exactly the ends a section
  was cut from, so the round trip closes without hunting a list of 98.

**Where the route still needs tracing**, on the currently shipped geometry:

| Spacing | Length | Section |
| ---: | ---: | --- |
| 272 m | 8.7 km | Nihonbashi → Shinagawa-juku |
| 266 m | 9.0 km | Saya divergence → Manba Ohashi |
| 255 m | 6.6 km | Numazu-juku → Hara-juku |
| 240 m | 12.0 km | Hamamatsu-juku → Maisaka-juku |
| 234 m | 12.2 km | Hara-juku → Yoshiwara-juku |

Only 8 of 92 sections are at 60 m spacing or better.

## Phase 3b — the route round trip, 2026-08-22

The export half existed; this is the import half, and it is what stands between
Kevin and a finished route.

- **`src/lib/routeImport.ts`** — GPX (`trk`, multi-`trk`, `trkseg`, `rte`) and
  GeoJSON (`LineString`, `MultiLineString`, `Feature`, `FeatureCollection`) via
  DOMParser, so the tests run in jsdom against the same parser the browser uses.
  Separate pieces stay separate; nothing is resampled; elevation is dropped with
  the reason shown.
- **`src/lib/routeEdits.ts`** — **every edit is a variant.** Nothing splices a
  path, so the source stays intact, an edit is undone by switching it off, and
  no anchor is ever reindexed. `validateRouteEdit` refuses geometry that does
  not meet the anchors it claims, within 250 m.
- **Import screen** (`#/import`) — nearest-anchor suggestions for both
  endpoints, adoption as replace-section / resolve-gap / prepared alternative,
  and **a consequence preview**: new route length, break count, days over 40 km,
  and every day whose distance changes, before anything is adopted.
- **Route screen** lists the edits with switch on/off, delete, and export.
- **`npm run route:apply-edits`** bakes an export into `public/data/` and bumps
  the data version, so a permanent change stops depending on evictable storage.

### Verified against the real problem

`tests/e2e/fixtures/kyoto-approach.gpx` is a synthetic trace of the missing
final leg. Importing it closes the break, takes the route from 526.9 km to
**533.1 km**, and takes Day 15 from 29.4 km to **35.6 km** — which is what that
day was always going to be once the route reached Sanjo Ohashi. Switching the
edit off puts all of it back with no restore step.

### One real bug found

`buildLegs` let the last day's anchor override the route end, so extending the
route left the new kilometres walked by nobody. The final leg now always ends
where the route ends.

## Phase 3a — your own places, 2026-08-20

Kevin can now add points. Previously every point came from the source route or
the demonstration fixtures, and there was no way to add a hotel, a station, or a
day finish that no anchor sat on.

- **`src/lib/userPoints.ts`** — two roles. An **anchor** is moved onto the route
  when saved, so it can end a day without adding distance to two days; a
  **waypoint** keeps where it was put and records how far off the line that is.
- **Placement is a fixed crosshair with the map moving under it**, plus "use my
  location" and a coordinate field. Tapping a target misfires on a stray pan and
  hides the point under a thumb.
- **Lodging is private by default.** `publicOnly()` filters every export;
  a private hotel reaches neither the reference layer nor a day GPX, asserted by
  test. Places are exportable from Settings.
- **User anchors appear in the day-endpoint picker** exactly like post stations.
  `anchorAlongKm()` now falls back to projection, because a snapped point sits
  part-way along a segment rather than on a source vertex.
- **Fine-adjust nudges** (±1, ±5 km) for a boundary no named point sits on. The
  UI says plainly that a bare distance will shift if the route is repaired
  upstream, and suggests adding a place instead.
- The write queue moved to `state/writeQueue.ts` and is now shared by every
  store rather than one per store.

### A test that caught a real thing

The first e2e attempt used `35.2560, 139.1550` for Odawara — my old hand-written
estimate. The app reported it as **1.0 km off the route**, which is exactly the
error the source import corrected. The app was right and the test was wrong.
Worth remembering when reading any coordinate written before 2026-08-20.

## Phase 2 — day planning and export, 2026-08-20

### What changed

- **`src/lib/planningLine.ts`** — flattens the active stretches into one
  distance axis with break positions recorded, plus `sliceLine()` that
  interpolates at both ends so a day starts and finishes exactly where told,
  not at the nearest source vertex.
- **`src/lib/dayPlan.ts`** — day boundaries as single numbers along that axis,
  anchored to named points where possible. `buildLegs()` derives every day's
  distance, its delta against the draft, its cumulative, its geometry and its
  continuation. `moveDayEnd()` refuses to reorder days.
- **Plan screen** (`#/plan`) — the balancing loop. Fifteen rows, each showing
  measured distance, the draft figure, the delta and the cumulative. Days over
  40 km are outlined in red. Expanding a row gives a picker where **every option
  states what it does to this day and the next before it is chosen**.
- **Prepare Tomorrow** (`#/prepare/:dayId`) — the hotel-night workflow, reached
  from Today. Distance, continuation, daylight, safety notes, bailouts, one-file
  export, and a readiness checklist that gates the "mark prepared" button.
- **Per-day GPX** — one file, one `<trk>` for ACTIVE and one for CONTINUE, named
  so Footpath makes a list called `Tokaido D04`. Plus a plain-text day summary
  worth printing for the days that matter.
- **Snapshots** — whole-document, labelled, restorable, last 20.

### What it revealed about the schedule

The default plan, mapped onto route anchors:

| Day | Ends | Measured | Draft | Δ |
| ---: | --- | ---: | ---: | ---: |
| 1 | Hatchonawate (Kawasaki) | 20.9 | 17.7 | +3.2 |
| 5 | Yui-shuku | **40.6** | 38.7 | +1.9 |
| 6 | Okabe-juku | **40.8** | 37.4 | +3.4 |
| 10 | Okazaki-juku | 31.7 | 27.5 | +4.2 |
| **12** | **Yokkaichi-juku** | **51.4** | 40.2 | **+11.2** |
| 15 | Higechaya Oiwake | 29.4 | 38.0 | −8.6 |

Total 526.9 km, mean 35.1 km, **three days over 40 km**.

Day 15 looks short only because the route ends 6 km early; add the missing
approach and it is ~35 km. Day 1 — the deliberately short systems-check day —
is 3.2 km longer than intended, which is worth knowing given what it exists to
prevent.

**Day 12 at 51.4 km is the finding.** The draft's 40.2 km was the historical SEA
crossing plus Kuwana–Yokkaichi, never a walkable figure. Walking the Saya Kaido
makes it 51.4 km. It cannot stand.

### Two bugs found and fixed by the tests

- **IndexedDB writes were racing.** Every store write is read-modify-write, so
  ticking the last checklist box and immediately marking a day prepared lost the
  timestamp. All writes now go through one promise queue.
- **Fire-and-forget writes could be lost on navigation.** Checkbox ticks stay
  optimistic; a deliberate commit now awaits the write.

### Known gaps in Phase 2

1. **Variant selection is read-only.** The Saya Kaido is active because the data
   says so; there is no UI to switch it off and see the route break. That is a
   small addition to the Route screen.
2. **Continuation endpoints are limited to anchors within 25 km.** Fine in
   practice, arbitrary in principle.
3. **No per-day map view.** The Plan screen is a list; seeing the day drawn
   would help when moving a boundary. The Map screen can already do it with a
   focus parameter, it is just not wired.
4. **The default for day 1 is Hatchonawate Station**, because Kawasaki-juku is
   not labelled upstream. Close, not exact.

## Phase 1 — real route data, 2026-08-20

### What changed

The schematic corridor sketch is gone. Samwise now carries a real route.

- **Source adopted:** 旧街道足跡マップ (kaidotrail), **CC BY-SA 4.0** — chosen
  over the Gokaido-Map dataset (CC BY-NC-SA) specifically because the
  NonCommercial clause would have complicated a map in the book. GPS traces from
  people who walked the road. Preserved unmodified with SHA-256 and provenance
  at `route-sources/kaidotrail-2026-08-20/`.
- **Route model implemented**: ordered **paths**, **gaps** with no geometry,
  **variants** that can resolve a gap, and **anchors** carrying `alongKm` as the
  linear-referencing handle. Day boundaries will be positions along this, never
  separate geometry. See ARCHITECTURE.md.
- **527.0 km of active walking**, one continuous stretch, one break.
  374 km east + 36.4 km Saya Kaido + 116.7 km west, plus ~6 km still missing
  into Kyoto. Call the finished route ~533 km.
- **98 anchors**, all romanised, 50 numbered post stations.
- **Fixtures now derive from real coordinates.** 29 of 31 stations and 10
  waypoints sit on imported positions; `positionSource` distinguishes them from
  the estimates. Suzuka Pass moved 3.4 km.
- **Decide measures along the route**, splits along-route from off-route
  distance, and knows which exits are behind you — which fixes a defect listed
  in the previous handoff.
- **New Route screen** under More: totals, breaks, variants, source and licence,
  and three exports.
- **Exports**: master GPX in the proven one-track-per-stretch shape, a reference
  layer for tracing in an external editor, and the active route as GeoJSON.

### Two findings that change the trip, not just the app

1. **The real route is about 8% longer than `DAILY-SCHEDULE-DRAFT.md`.** That
   draft balances the traditional 495.5 km post-station table; measured stages
   run 3–4 km longer each. The fifteen-day average moves from 33.0 km to roughly
   35.5. And 527 km is a **floor** — the source samples at ~100 m and cuts
   corners, so densifying will raise it, before hotel access mileage.
2. **The Saya Kaido is 36.4 km.** Miya to Kuwana on land, before Kuwana to
   Yokkaichi is counted, makes Day 12 roughly a 49 km day in the least forgiving
   section. It has to split. The 7 November flex day is not spare capacity.

### Route work still outstanding

Listed in `route-meta.json` under `knownWork`, so the app shows them:

1. Add the final ~6 km from Higechaya Oiwake to Sanjo Ohashi.
2. Densify urban sampling — 155 m through central Tokyo against 66 m across
   Hakone, which is backwards from what navigation needs.
3. Replace the Hakone east slope between Hatajuku and the checkpoint with the
   Hiryu Falls / Ashinoyu hybrid from `FOUNDATION.md`. The branch anchor already
   exists at 畑宿本陣.
4. Inspect the Hakone west slope around the Hakone Pass IC interchange.
5. Two >1 km straight jumps near Nihonbashi cut corners through central Tokyo.

### Not yet tested on device

`footpath-test/TOKAIDO-MASTER.gpx` — 276 KB, 5,016 points, one track. **Whether
Footpath accepts a file this large is unknown.** If it chokes, the answer is to
export per-day files rather than a master, which Phase 2 does anyway.

## Footpath handoff — TESTED ON DEVICE, 2026-08-20

Kevin ran the diagnostic files in `footpath-test/` on his iPhone against Footpath
Elite. These are measured results, not assumptions, and they are binding
constraints on the export design. Regenerate the files with
`node scripts/make-footpath-test-gpx.mjs`.

### The export shape, settled

**One GPX file per day, containing several `<trk>` elements.** Footpath detects
multiple tracks, offers "Save to list", and creates a **named list holding one
route per track**. Verified: `TEST-D` produced a list named from
`<metadata><name>` containing two separate routes named from each `<trk><name>`,
0.40 mi and 0.42 mi, with the 21 km gap between them intact.

```
<metadata><name>  →  list name    "Tokaido D04 — Sat 24 Oct"
<trk> 1           →  route        "D04 ACTIVE — Odawara to Hakone-Yumoto"
<trk> 2           →  route        "D04 CONTINUE — Hakone-Yumoto toward Mishima"
<trk> 3           →  route        "D04 ALT — wet-weather line"
<wpt> …           →  waypoints    bailouts, hazards, water for that day
```

One share-sheet trip, one "Save to list", and the whole day arrives as a named
folder. Lists are first-class in Footpath: named, sorted, shareable, editable,
and you can add routes to them later.

The master reference export works the same way — list name `TOKAIDO MASTER`, one
`<trk>` per continuous walking section.

**The construction rule that replaces the earlier refusal rule:** never put two
non-contiguous sections inside one `<trk>`. Give each continuous walking section
its own `<trk>`. Discontinuities are then preserved by construction, with no
refusal, no warning, and no extra files for Kevin to manage.

### What works

- GPX import succeeds. A single-track file opens as a transient preview with a
  Save button, and importing a second file discards an unsaved first — imports
  are sequential and save-or-lose. The multi-track list flow avoids this
  entirely, which is why it is the default export shape.
- Names survive in full, em dash included. Routes and lists are both renameable
  in-app, so naming is helpful rather than load-bearing. **Front-load the
  discriminator**: list headers and row labels truncate at roughly 25 characters
  ("D12b KUWANA — walking sect…").
- `<wpt>` waypoints import with their names and render on the map, including
  mid-route ones. Bailouts, hazards and water points can ride inside the route
  file and appear while navigating.
- Geometry is preserved as placed. A test line drawn straight across a hillside
  was drawn straight across the hillside; Footpath did not rewrite it to follow
  roads.
- Cue sheet is generated, with Japanese road names plus English glosses
  (小田原山北線 / "Toward Odawara Station Line").
- Send to Watch works. The route loaded on an Apple Watch Ultra, worked offline,
  and computed off-route distance correctly.
- Route lines and elevation profiles are **colour-shaded by gradient**. Useful on
  the Hakone and Suzuka days — steepness is visible at a glance without reading
  numbers.

### Constraints that change the design

1. **Multiple `<trkseg>` inside one `<trk>` are silently bridged.** `TEST-C`, with
   the real 21 km Miya–Kuwana gap as two segments of one track, imported as ONE
   continuous 13.8 mi line straight across Ise Bay, elevation profile draped over
   the water. Use separate `<trk>` elements, never separate `<trkseg>`.

2. **Footpath ignores `<ele>` and substitutes its own terrain model.** A file with
   a smooth 15→110 m ramp (+312 ft, 0 loss) reported 871 ft gain and 569 ft loss
   from real topography. Manually traced sections with no elevation still get a
   real profile — but the companion's ascent figures will disagree with
   Footpath's, and Footpath's is better. **Do not compute ascent in the
   companion**, or label it explicitly as an estimate Footpath will contradict.

3. **Footpath road-matches for cue generation and reports a different distance.**
   Overview showed 3.28 mi, matching raw geometry; the Cue Sheet showed 3.4 mi
   with "Sections of this route could not be snapped to the map." Trace the real
   route WITH road snapping in whatever tool builds it — the closer the line sits
   to real roads, the better the cue sheet.

4. **Footpath's duration estimate uses a default moving pace of 3.1 mph
   (5 km/h).** The Decide screen deliberately uses pace *including stops*, which
   is slower and is the honest planning number. Never let Footpath's ETA be the
   figure a day is planned around; say so in the UI wherever both appear.

### A free verification queue

The cue sheet emits `Warning: Unknown path` wherever the line does not match a
known road. Importing the finished route and reading the cue sheet produces a
desk-checking list: every warning marks a section needing verification before
departure.

### Superseded claims

- An earlier assessment said Day 12 must be at least two files regardless of how
  Miya–Kuwana is resolved. Wrong. If Kevin walks a continuous land line there is
  no discontinuity and it is one track. The gap machinery covers three narrower
  cases: honest representation before the crossing is decided, safety exclusions
  routed around by rail, and the record of what actually happened when a section
  is skipped in the field.
- An earlier draft of this section said the export layer must *refuse* to emit a
  file spanning a discontinuity. Superseded by the multi-`<trk>` finding above.

### Not tested, and not needed

`TEST-B-route-element.gpx` (`<rte>` instead of `<trk>`, no elevation) is
superseded. `<trk>` is proven end to end, and Footpath ignores file elevation,
which were its only two questions. The companion's **importer** must still accept
`<rte>`, `<trk>`, and multi-segment tracks — test that with fixtures, not on the
phone.

## Important architecture decisions

Argued in `ARCHITECTURE.md`; listed here so they are not re-litigated by accident.

1. **Leaflet, not a vector-tile renderer.** Its offline failure mode is the one
   that is wanted. Migration path documented if offline base maps ever become a
   requirement.
2. **Hand-written hash router.** GitHub Pages cannot rewrite paths, and the
   `404.html` trick fails offline.
3. **Same base path everywhere**, including dev.
4. **`registerType: 'prompt'`.** A new build never replaces a working field
   version on its own.
5. **NOAA solar equations implemented, not imported.** Daylight has to work with
   no network and no extra package in the precache.
6. **All decision maths in pure functions.** No React, no DOM, heavily tested.
7. **Five tabs, with Decide promoted and Day/Places demoted.** A deliberate
   departure from the suggested IA — reasoning in `ARCHITECTURE.md`.
8. **Fixtures generated by a script**, so the coordinate table has one home and
   one honest header.
9. **Strict private-data import.** An unrecognised key is a refusal.
10. **`node_modules/`, `dist/`, test output marked `com.dropbox.ignored`** so the
    project can live in Dropbox without a sync storm.

## Known defects and rough edges

None blocking, though item 1 loses data quietly. In rough priority order:

1. **`attachLocation` defaults off in `src/screens/Capture.tsx`, so captures
   silently lose their anchor.** Place and time are the only anchor a field
   capture gets, and the checkbox has to be ticked while Kevin is tired, cold or
   mid-stride — which means it will be missed on exactly the days the material is
   best. `makeCapture` already carries `lat`/`lon`/`accuracyM`; nothing else needs
   to change. Default it on whenever a fix is available, keep recording accuracy
   honestly, and record none rather than a coordinate the app cannot stand behind.
   This one is data loss, not a rough edge. See `WRITING-DESK-SPEC.md`.

2. **The main bundle is 499 KB (149 KB gzipped)** and unsplit. Fine over hotel
   wifi, unpleasant on one bar. Leaflet and Zod are the bulk. Route-level code
   splitting would help; so would replacing Zod with hand-written validators if
   the schema stops changing.
3. ~~**Bailout selection ignores direction of travel.**~~ Fixed 2026-08-20:
   `measureBailouts` projects onto the route, reports along-route and off-route
   distance separately, and sorts exits ahead before exits behind.
4. **No "distance walked today" is measured** — Kevin types it. There is no
   foreground odometer. Adding one is possible but would not survive the phone
   locking, so it may be a trap rather than a feature.
5. **`likelyDoorToDoorKm` is invented.** It is a plausible-looking number with no
   method behind it. Either derive it from real hotel placement or remove it.
6. **No unit tests for `dayContext.ts` or `offlineCheck.ts`.** Both are exercised
   end to end, but not directly.
7. **The Decide screen recreates its `base` object every render**, so the AI
   packet regenerates more often than it needs to. Not visible, but it is why
   the `useMemo` dependency list looks odd.

## Next highest-value task

**Split Day 12, then fill the route gaps.**

Day 12 measures 51.4 km. The tooling to fix it now exists — open `#/plan`,
expand day 12, and move the finish. But the fix is a real decision about the
western block, not a slider: splitting it means borrowing from the 7 November
flex day or recompressing days 13–15.

Then, in a dedicated mapping session:

1. Add the final ~6 km, Higechaya Oiwake to Sanjo Ohashi.
2. Replace the Hakone east slope with the Hiryu Falls / Ashinoyu hybrid. The
   branch anchor at Hatajuku Honjin already exists.
3. Densify urban sampling, which also improves Footpath's cue sheet.
4. Import the finished route and re-check every day distance.

Independently: fill in the ten day cards that still carry only skeleton content.
Mechanical, no new decisions, and it makes the app walkable end to end.

## The three decisions Kevin needs to make

1. **Which source route, and how the Miya–Kuwana discontinuity is represented.**
   `STATUS.md` frames the options: walk a safe modern land line over the Kiso
   Three Rivers, take transit between the preserved ferry sites and let the gap
   stand, or split a long substitute across the 7 November flex day. The app can
   model any of them, but not until one is chosen. This is also a book question,
   not only a logistics one.
2. **Repository boundary, and whether to deploy now.** `GITHUB-PAGES-DEPLOYMENT.md`
   recommends a separate repository holding only `field-companion/`, with the
   working copy outside Dropbox. Deploying now would let real-device testing start
   early — the seven-day Safari eviction test alone takes a week — at the cost of a
   public repository containing an app full of fake distances. Deploying later is
   safer and slower.
3. **Whether the tired-day view is the right default.** The day card opens with
   the short summary and hides the full card behind a tap. That is a real bet
   about what gets read at 4 p.m. on day nine, and only Kevin can say whether it
   is the right one.

## Approvals still outstanding

Nothing in this build touched any of these:

- `git init` anywhere inside Dropbox
- Creating a GitHub repository, authenticating, adding a remote, or pushing
- Enabling GitHub Pages
- Moving `proposed/deploy-github-pages.yml` into `.github/workflows/`
- Anything involving DNS or `kevinmihata.net`
- Any paid service — nothing here costs anything

## Do not

- Do not treat any distance, coordinate, hazard or bailout in this build as real.
- Do not add an AI API call. The handoff is text on purpose.
- Do not add analytics, telemetry, or a third-party host. A test will fail, and
  it should.
- Do not put real bookings, medications, or contacts in the repository. They go
  in the private file, on the device.
- Do not display a Hiroshige image until rights are verified for that specific
  reproduction from that specific institution.
- Do not change `registerType` to `autoUpdate`.
- Do not move or rename the parent project files. This folder is additive.
