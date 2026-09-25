# Writing Desk — specification

> Written by R2 (Claude Code) on 2026-09-11 from Kevin's request, and **revised
> the same day** after he answered the open questions: phone only, no iPad, and
> he does not expect to be drafting anything specific — he is building
> opportunistically so he does not miss story foundations, which might later
> become book chapters or Aschematic posts.
>
> **Corrected 2026-09-13:** three line citations in the first version were wrong
> (produced by a multi-file `awk` whose line numbers run cumulatively across files),
> and the voice section was written without having read `../WRITING-RUNWAY.md`'s
> "During Japan" section. See "Reconciliation" at the end — that section, not this
> one, is the controlling design.
>
> Sources read: `R2-Editor.html`, `src/lib/capture.ts`, `src/screens/Capture.tsx`,
> `src/lib/download.ts`, `../WRITING-RUNWAY.md`, `../STATUS.md`.
> **This is a requirement note, not a completion record.** Nothing below is
> implemented, and nothing below is a commitment until Kevin places it.

## Why this exists

Kevin takes no laptop and no iPad to Japan, October 18 to November 12 —
twenty-six days. The phone is the only writing surface he will have.

The existing remote paths do not cover it. `../STATUS.md:185` records that Codex
Remote and Cowork/Dispatch both need the home Mac awake, Claude Desktop open, and
internet on both ends, and that neither is required while walking. They are desk
work reachable from a hotel on a good night. This covers the other case: material
that arrives while walking, often with no signal, that will be gone by evening.

`../WRITING-RUNWAY.md` already asks for this under "Meaningful evidence by
departure" — *a compact, phone-only editorial-prep and field-memory system that
supplies timely day/location context, preserves timestamp-linked raw evidence,
and has survived both ordinary and tired/no-service long-walk tests without
requiring Kevin to write or compile the day at night.* It has never been built.

## What this is for, stated precisely

Kevin is not drafting on the road. He is **not missing things**. The material he
catches might become a book chapter or an Aschematic post, and which one it
becomes is not knowable in the field and does not need to be.

That single fact settles most of the design:

- **Do not ask him to file anything at capture time.** No chapter-versus-post
  choice, no section, no project tag. Sorting is a desk job for after return, and
  a decision demanded at kilometre thirty-one is a decision made badly or a
  capture abandoned.
- **The enemy is the thin note.** The failure is not losing a capture; it is
  opening one in January that says *the old man at the shrine was interesting*
  and having no idea what was interesting. A foundation is only a foundation if
  it carries enough concrete material to rebuild the scene months later.
- **The anchor is place and time, not text.** An earlier draft of this spec
  proposed anchoring notes to a paragraph of an existing draft. Kevin's answer
  retires that: there is no draft being reacted to. Where and when is the anchor,
  and Samwise already collects it.

`../WRITING-RUNWAY.md` puts manuscript production during the walk out of scope
through return, and keeps road capture in, with one weekly photo-led Road Note of
roughly 100 to 300 words. Nothing here crosses that line.

## What is already built — most of it

This is the central finding of the revision. The capture model Kevin needs
**already exists in `src/lib/capture.ts`**. `makeCapture` carries `createdAt`,
`dayId`, `waypointId`, `lat`, `lon`, `accuracyM`, `externalRef`, `verifyLater`,
and a versioned schema, writes to IndexedDB on save, and exports as NDJSON chosen
so a truncated file still yields every complete record before the break.
`src/screens/Capture.tsx` already puts *"What is actually here?"* in the
textarea, which is the right question.

`src/lib/download.ts` already produces an iOS share sheet, which reaches Save to
Files and therefore Dropbox. The outbound path exists.

So this is not a new app and should not be built as one. It is a small number of
changes to a screen that is nearly right, plus one new reader.

## The four changes

### 1. Capture ergonomics — the anchor must not be opt-in

`src/screens/Capture.tsx` currently presents five controls: a Kind select, the
note textarea, an External reference input, an **Attach current coordinates
checkbox that defaults off**, and a verify-later toggle.

The location checkbox is the defect. The most valuable anchor Kevin has is the
one he must remember to tick while tired, cold, or mid-stride — which means on
the days the material is best he will not tick it. **Attach coordinates by
default whenever a fix is available**, record the accuracy honestly as the schema
already does, and let him turn it off rather than turn it on. Where there is no
fix, record none and say so; never print a coordinate the app cannot stand
behind, consistent with the confidence discipline in `HANDOFF.md`.

> **Done, 2026-09-13.** Implemented as specified. It needed three changes rather
> than the one the defect list described: the default, starting the geolocation
> watch when the screen opens rather than from the checkbox handler — otherwise
> a ticked box saves a null coordinate — and a save message that says plainly
> when a capture went without the fix it promised. See `HANDOFF.md`,
> "Captures attach location by default", and the new section in
> `PRIVACY-AND-THREAT-MODEL.md` covering why a capture is not a location feed.

Reduce the rest to one thing: a large textarea and a save. Kind can default to
`note` and move below the fold or into an edit-after pass. `externalRef` should
not be a field he fills while walking — see photos, below.

### 2. Dictation, not recording

**Do not build audio recording** — on this both this spec and
`../WRITING-RUNWAY.md` agree, and the runway got there first. Where they differed
was what replaces it. This spec originally made keyboard dictation into a textarea
*the* voice feature. `../WRITING-RUNWAY.md:294` and `../../aschematic/PLAN.md:164`
both put **voice memos first and the app's mark second**, and the runway says
plainly that natural speech beats filling a template in the moment. That is the
considered position and it wins.

So: the iOS dictation key remains available and costs nothing — it is on-device,
works with no network, and produces text that needs no transcribing. Offer it.
Do not design around it as the primary path. The primary path is Voice Memos for
the substance and Samwise for the mark that makes the memo findable later.

Keep the existing `voice-note-reference` kind for the case where the audio itself
is the evidence — ambient sound, another person speaking — and let Voice Memos
record it while Samwise stores the pointer. `src/screens/Capture.tsx` already
documents that decision and it is still correct.

### 3. Photographs join by timestamp, free

The Road Note format is photo-led, 3 to 6 images. Photos are the highest-bandwidth
field capture available and iOS Photos already stores them better than this app
could. Samwise should store **no image data**.

Because every capture already has `createdAt`, a photo taken in the same minute is
already findable. Make that explicit rather than making Kevin type a filename into
`externalRef`: a capture and the photos around it are joined on the desktop later
by time. If anything is added here, it is a one-tap "there are photos with this"
marker, not a file reference typed while standing in the rain.

### 4. The thickening pass — how a thin note becomes a foundation

This is the only genuinely new behaviour, and it is what makes the difference
between a capture pile and usable material.

A note dictated while walking will be thin. It needs concrete detail added while
memory is still warm — but `../WRITING-RUNWAY.md` explicitly requires that the
system not make Kevin write or compile the day at night, and a nightly ritual on
day nine of a long walk will not survive contact.

So: **no evening session, no queue that nags.** Instead, when Kevin next opens
the app for any reason — over breakfast, on a train, waiting out rain, checking
Decide at a stop — surface one recent thin capture and offer to thicken it.
Opportunistic, the same way the capture itself was. One at a time, never a list
of arrears, and dismissible without penalty. An un-thickened note is still a note.

The prompts should push toward the concrete and the reconstructable — what was
there, who was doing what, what it sounded like, what it reminded him of — and
should never ask what the material is *for*. That question is the desk's.

### 5. Prompt material — a small reader, not a draft library

Kevin is not reading drafts, so the document reader shrinks to almost nothing. But
capture is only non-random if he is carrying what he meant to notice.
`../WRITING-RUNWAY.md:294` has "Field assignments already known" — river,
Shinjuku/Yamanote, the Kyoto 2010 return site, Hiroshige, the November 9
Shinkansen — plus the recovered-memory and return-site prompts and the working
book question, all frozen with the sample on October 11.

That is a handful of short, read-only, unchanging documents. **Bake them into the
build.** Everything the earlier draft of this spec proposed — `.md` import,
strict validation, a document list, refresh from the road — is unnecessary once
the material is fixed at the freeze and never edited on the trip. Surface the
relevant assignment on the day card when the route reaches its place.

## Getting the writing back out — the non-negotiable

This is the highest-consequence requirement in this document and it is not a
feature, it is a survival property.

Twenty-six days of writing will live in IndexedDB on one phone, and
`../STATUS.md:71` records that no device insurance was selected. A lost, stolen,
drowned, or wiped phone in week three is a total loss of the road's material
unless export has already happened.

- Export must reach Dropbox through the existing share-sheet path, and it must be
  **one action from the screen Kevin is already on**, not four taps down a More
  menu.
- The app must show, somewhere he sees daily, **how long since the last successful
  export**. Not a nag — a fact, the way the offline readiness screen reports
  per-asset state.
- Export NDJSON as captures already do, plus a plain-text rendering for when he
  just wants to read what he wrote.
- A failed or unfinished Files sync must be visible rather than silent.

Treat an un-exported week as the failure this whole feature defends against.

## Sequencing — the cost, revised down

`../../../Agent OS/ACTIVE_PORTFOLIO.md` holds nonessential system expansion
through November 15, and its Tokaido watch line says not to let an optional
field-app feature block route, beds, tested feet and pack and rain systems,
medication supply, or Chapter 1. Three Samwise requirements are already queued
ahead of the October 5-11 freeze: lodging projected onto the route to surface
`offRouteKm`, the Japanese-address geocoding policy, and the private offline
hotel and cancellation-deadline views.

The earlier version of this spec proposed a document reader, an import pipeline
with strict validation, and a text-anchoring model, and concluded it was a real
trade against those three. **That is no longer the estimate.** What is left is a
default flipped from off to on, a screen simplified, a days-since-export figure, a
baked-in prompt file, and one modest new behaviour in the thickening pass. No new
schema, no import path, no audio, no images.

That is small enough to attempt without displacing the queued three — but it
should be *verified* small before it is started, not assumed small because this
document says so. Put it in the September 27 tired-day pilot alongside the others
so it is tested tired rather than tested fresh.

If it cannot be that small, cut the thickening pass first and ship the rest. The
thickening pass is the highest-value item and the only one that could grow;
capture ergonomics and export durability are the ones that must not be missing.

## What would make this wrong

The previous version of this spec fired its own version of this clause within a
day, so it is worth writing carefully.

This design assumes the thin-note problem is real — that Kevin's field captures
will need detail added to be usable months later. If the September 27 pilot shows
his dictated captures already arrive thick enough to rebuild a scene from, the
thickening pass is solving a problem he does not have, and what remains is just
the ergonomics and the export, which is a half-day of work and should be done
regardless.

Run the pilot with the location default flipped and dictation as the only input
method, then read the captures cold a week later and ask whether a scene can be
rebuilt from them. That question, not a feature list, decides what gets built.

## Reconciliation with `../WRITING-RUNWAY.md` — controlling

> Added 2026-09-13. The first version of this spec was written without reading the
> "During Japan — live fieldwork, not manuscript production" section of
> `../WRITING-RUNWAY.md`. That section already designs the field practice in
> detail. **Where the two disagree, the runway wins**; it is the owning file for
> what writing happens when, and it thought about this first.

What the runway already settles, and this spec should stop re-deciding:

- **The capture hierarchy** (`../WRITING-RUNWAY.md:294` area, and
  `../../aschematic/PLAN.md:164`): voice notes primary, written notebook
  secondary, photographs and a recorded track as evidence, and **deliberate
  location marks as the index**. Samwise is item 4. It is not where the writing
  lives; it is what makes the writing findable.
- **The app's job is the join.** The runway asks for "a tested one-action phone
  method [that preserves] timestamp, coordinates, route day, and a simple event
  ID at consequential stops," so that a shared timestamp later connects the mark,
  the route track, the voice memo and the photographs. That is the whole
  requirement, and it is stricter than anything this spec proposed.
- **Record mode versus travel-partner mode.** Record mode receives no AI response
  and preserves Kevin's own account. Anything built here belongs in record mode.
- **No required evening loop**, stated there before it was stated here.

### What this means for the four changes above

1. **Capture ergonomics — unchanged and now stronger.** The runway's item 4 asks
   for a *one-action* mark carrying timestamp, coordinates, and route day.
   `attachLocation` defaulting off meant the app did not meet a requirement that
   was already written down. This was never a judgement call in a spec; it was a
   documented requirement the screen failed. **Closed 2026-09-13** — the mark is
   now attached by default, refusable, and honest when no fix arrives.
2. **Voice — corrected.** See the revised section above. Voice Memos carry the
   substance; Samwise carries the mark. Dictation is an option, not the design.
3. **Photographs — unchanged.** Join by timestamp, store no image data. The
   runway says the same.
4. **The thickening pass — demoted, possibly unnecessary.** It assumed the app
   holds the substance. Under the runway's model the substance is in the voice
   memo, and thickening a text note may be solving a problem that belongs to a
   different artifact. **Do not build it before the September 27 pilot.** The
   pilot question is narrower than the one stated earlier in this document: does
   a location mark plus a voice memo, joined by timestamp, reconstruct a scene a
   week later? If yes, there is nothing to thicken and this item dies.
5. **Prompt material — unchanged, but it is not Samwise's job to author it.**
   The October 5-11 week in `../WRITING-RUNWAY.md:168` already carries "Load the
   essential drafts, prompts, old photographs, addresses, and capture template for
   offline access." Samwise owns the offline part. Someone else owns writing the
   assignments, and they are not written yet.

### What survives this reconciliation unchanged

The export-durability requirement. Nothing in `../WRITING-RUNWAY.md` addresses
what happens when the phone holding twenty-six days of location marks is lost,
and `../STATUS.md:71` records no device insurance. One-action export plus a
visible days-since-last-export figure remains the non-negotiable, and it is the
one requirement in this document that no other file is carrying.
