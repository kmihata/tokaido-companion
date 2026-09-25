# Privacy and threat model

## The assumption everything else follows from

**The deployed site is publicly reachable.** GitHub Pages has no access control on
a free project site. There is no login, no allowlist, no obscurity worth relying
on. Kevin is the only intended user, but anyone who finds the URL — or the
repository, which is public for Pages to work on a free plan — can read
everything in it.

So: nothing in the repository may be anything Kevin would mind a stranger reading.

## What must never enter the repository

Enumerated so a future session has a checklist rather than a judgement call:

- Reservation confirmation numbers
- Ticket numbers, PNRs, e-ticket numbers
- Loyalty account numbers and balances
- Medication names, doses, schedules, prescribers, pharmacies
- Personal emergency contacts — names, numbers, relationships
- Private family information
- Live location, or any feed of it
- Credentials, API keys, tokens of any kind
- Real lodging bookings, addresses, or cancellation deadlines tied to a real booking
- Passport, NEXUS, or other document numbers
- Unpublished notes Kevin has not explicitly approved for publication

Hotels in the public fixtures are fictional placeholders, named as such in the
title and the notes. `tests/unit/fixtures.test.ts` asserts that.

### "Live location, or any feed of it" — and what a capture is

**Captures attach coordinates by default, changed from off on 2026-09-13.** That
is not a relaxation of the line above, and the distinction is worth stating
precisely because it will be questioned again.

A **feed** is continuous, automatic, and not asked for: a track that accumulates
whether or not Kevin is paying attention, and that describes where he has been
for a whole day. The app holds none of that and cannot — a browser PWA on iOS
does not record in the background at all.

A **capture** is a deliberate act. Kevin decides there is something worth
writing down, and the coordinate says where that thing was. It is one point
attached to one note he chose to make. `../WRITING-RUNWAY.md` makes exactly this
the index that lets a voice memo be found again later, which is the capture
screen's main job.

What has not changed:

- Captures are written to IndexedDB on the device and **sent nowhere**.
- They leave only when Kevin exports them himself, by hand, from Settings.
- `captures-export*` is in `.gitignore`, so an export cannot be committed by
  accident.
- The geolocation watch runs only while the Capture screen is open, and stops
  when it is closed.
- The checkbox is still there. Untick it and no coordinate is recorded.

The failure the old default produced was its own privacy problem in miniature:
a capture saved without its location is a note whose "where" has to be
reconstructed from memory weeks later, and reconstruction from memory is how
things get recorded wrongly.

## Enforcement, not just intention

Four automated gates:

1. **`tests/unit/fixtures.test.ts`** — the shipped example private file contains
   nothing but obviously fictional content; any phone-number-shaped string is the
   all-zero placeholder; no image files exist under `public/`.
2. **`tests/build/bundle.test.ts`** — no content value from the example private
   fixture appears anywhere in `dist/`; the `examples/` directory is not shipped;
   no secret-shaped strings (PEM blocks, bearer tokens, AWS/Google/GitHub/API-key
   patterns); no digit run of nine or more in the shipped data; none of the
   forbidden category words appear in shipped data.
3. **`.gitignore`** — `private-data*.json` and `captures-export*` are excluded,
   with an explicit exception for the fictional example.
4. **A network-host allowlist test** — every `http(s)://` host referenced in the
   bundle is checked against a list. A new third-party host fails the build tests.

Key *names* from the private schema do legitimately appear in the bundle, because
the validator that refuses a malformed private file is part of the app. What must
never appear is private *content*, which is what the tests check.

## The private layer

Private data reaches the device by exactly one path: Kevin picks a local file in
More → Settings → Import private file. It is validated, then written to
IndexedDB. There is no server, no sync, no account, and no code path that sends it
anywhere.

**Storage.** IndexedDB, origin-scoped, on that device only.

**Export.** Settings → Export private data, as JSON. Captures export as NDJSON or
plain text.

**Removal.** Settings → Remove from device deletes the IndexedDB record. Clearing
Safari website data removes everything.

**Import validation is strict, and refuses:**

| Refuses | Because |
| --- | --- |
| Over 2 MB | A private trip file has no business being large |
| Not JSON, or not an object | Wrong file |
| The public demonstration dataset | An easy file to pick by mistake |
| Any GeoJSON | Same |
| Missing or wrong `kind` | Not this app's file |
| An unimplemented `schemaVersion` | Silent coercion loses data |
| **Any unrecognised key** | A file with unexpected structure is more likely the wrong file than a newer one |

The shipped example carries a `_readme` key and is therefore **refused as it
stands**. Removing that key is a deliberate act that forces Kevin to look at the
file before it reaches the device. That is the intended friction.

## No analytics. No telemetry.

No analytics, no telemetry, no advertising, no trackers, no third-party logging,
no error reporting service, no CDN. Nothing loads from a third-party host except
map tiles.

## The three places data leaves the device

Named honestly, because "we don't send your data anywhere" is only true if you
enumerate the exceptions.

### 1. Map tiles

`tile.openstreetmap.org` sees your IP address and which tiles you requested,
which is roughly where you are looking. It does not see your position, your
notes, or your itinerary. Avoid it by not opening the Map screen; every other
screen works without any network request at all.

### 2. External links

Trail notices, city pages, and the optional AI shortcuts open in the browser and
are subject to those sites' own practices. Every screen carrying links says which
ones need a network.

All external links carry `rel="noreferrer noopener"`, so the destination is not
told where you came from.

The document policy is `strict-origin-when-cross-origin`, **changed from
`no-referrer` on 2026-09-13**. OpenStreetMap's tile policy requires a request to
identify the app that made it; a browser cannot set a User-Agent, so the Referer
is the only identification available, and sending none is a violation. The tile
servers returned 403 "App is not following the tile usage policy" and the
basemap vanished mid-zoom.

What the new policy sends cross-origin is the origin and nothing else — no path,
no query, and hashes are never sent in a Referer at all, so which day, place or
route stretch is on screen stays private. The tile server already learns the IP
and the tile coordinates, which say roughly where you are looking; the origin
adds nothing to that.

Outbound links are unaffected. `rel="noreferrer"` on a link overrides the
document policy, and all five external links carry it, so they still send
nothing.

### 3. The AI context packet — only when Kevin acts

The app makes **no** AI API call and holds no provider credential. "Copy /
share packet" builds text and hands it to the OS clipboard or share sheet. What
happens next is Kevin pasting it somewhere.

Rules the packet generator enforces:

- **Private data is excluded by default.** It is included only when Kevin ticks a
  checkbox on the preview screen, and that checkbox resets every time the
  component mounts. An opt-in that persists is an opt-in that gets forgotten.
- **The packet is previewable and editable** before it goes anywhere.
- **Provenance travels with every fact.** The packet opens with a warning that
  the data is a demonstration, that the route is a sketch, and that the assistant
  should say so if Kevin appears to be relying on a figure. An assistant given a
  distance without that warning will confidently reason from it.
- **No provider is named anywhere in the packet.** Asserted by test.

Once pasted into any assistant, that text is subject to that provider's terms and
retention. The app cannot and does not claim otherwise.

## Threats considered

| Threat | Assessment | Control |
| --- | --- | --- |
| Someone finds the public URL or repository | Likely enough to design for | Nothing sensitive is in either; four automated gates |
| Phone lost or stolen | Realistic on a long trip | Device passcode and biometrics are the control. IndexedDB is readable by anyone who unlocks the phone. **Keep genuinely sensitive material out of the private file too** — it is a convenience layer, not a safe |
| Someone shoulder-reads the screen | Realistic | Private lodging appears only on the day card and Settings, not on Today or the map |
| A third party tracks usage | Prevented | No analytics; host allowlist enforced by test |
| Kevin accidentally pastes private data into an AI | The real risk in this design | Off by default, resets each mount, packet is previewed and editable, private lines are labelled as deliberately included |
| A malicious data file | Low | Strict validation, size limit, no code execution path from data |
| A supply-chain compromise in a dependency | Real but unmitigated here | Four runtime dependencies, all mainstream. `package-lock.json` is committed. Review before upgrading before departure |
| Silent app update breaks the field version | Designed against | Explicit update gate; a new build waits for a tap |
| Browser evicts storage | Likely | Documented in `OFFLINE-AND-RECOVERY.md`; export controls; paper backup |

## Third-party licence obligations

Since 2026-08-20 the repository carries route data derived from
**旧街道足跡マップ (kaidotrail), CC BY-SA 4.0**. This is not a privacy question
but it binds any public deployment in the same way, so it is recorded here:

1. **Attribute** the source with a link. Done in `route-meta.json`, the map
   credit line, and the Route screen.
2. **Share-alike** — derived route data must carry CC BY-SA 4.0.
3. **Indicate changes were made.** The attribution string says "modified".

`tests/build/bundle.test.ts` asserts the attribution survives into the shipped
bundle, so removing it breaks the build rather than quietly breaching the
licence. Full detail in `route-sources/kaidotrail-2026-08-20/PROVENANCE.md`.

The CC BY-SA choice was deliberate: the alternative dataset was CC BY-**NC**-SA,
and a NonCommercial clause would have complicated a map appearing in a
commercially published book.

## If the repository must hold something sensitive

It must not. But if that changes, the options in order of preference:

1. Keep it out entirely and import it as private data. This is almost always the
   answer.
2. Make the repository private and deploy from a separate public branch or
   repository containing only built output — noting the built output is still
   public.
3. Do not encrypt-and-commit. A passphrase in a phone browser protects against
   casual reading and nothing else, and it creates a false sense of safety that
   is worse than the honest constraint.

## Review before departure

- [ ] Re-read this file and confirm the forbidden list still matches what exists
- [ ] `npm run verify` clean, including the bundle tests
- [ ] Confirm the deployed URL serves nothing beyond `dist/`
- [ ] Confirm the private file on the device contains nothing that would matter if
      the phone were unlocked by someone else
- [ ] Review `package-lock.json` for unexpected dependency changes
