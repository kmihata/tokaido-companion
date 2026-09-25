# Source route — Kevin's traced line, 2026-08-22

**Supersedes** `../kaidotrail-2026-08-20/`, which remains in place as the
upstream original and must not be deleted: this is a derivative of it.

| | |
| --- | --- |
| Working file | `tokaido.gpx.original` — do not edit |
| SHA-256 | `6939d47f7e291d2405a69690ff554c5f45389affe72b6fc9daf3f130d67d317c` |
| Raw editor export | `gpx-studio-export-raw.gpx` — as it came out of gpx.studio |
| Traced | 2026-08-22, gpx.studio, road snapping on |
| Length | 534.6 km, Nihonbashi to 31 m from Sanjo Ohashi |
| Points | 7,786 |

## Licence

Derived from **旧街道足跡マップ (kaidotrail), CC BY-SA 4.0**. Share-alike
therefore binds this file and anything derived from it. Attribution:

> 旧街道足跡マップ (kaidotrail), CC BY-SA 4.0, modified.

## What changed from the upstream original

1. **Road snapping across much of the route.** Mean point spacing went from
   105 m to 69 m; sections at 60 m or better went from 8 of 92 to 26 of 92. The
   line stays within a median 49 m of the original, 90th percentile 151 m — same
   corridor, more faithful to the actual streets.
2. **The Kyoto approach was traced.** 7.05 km from Higechaya Oiwake, ending 31 m
   from Sanjo Ohashi. The upstream source stopped at Higechaya Oiwake, roughly
   6 km short, and that gap is now closed.

## What was removed before adopting it

The raw editor export ran to 583.9 km because 49.3 km of accidental backtrack
had been appended: after the Kyoto approach the line turned around at Sanjo and
ran back east through Kusatsu and Ishibe to near Minakuchi. gpx.studio holds the
whole route as one track and appends new points at the end, so clicks made while
working on a later section extended the route from Kyoto backwards.

The backtrack was cut computationally rather than by hand — 1,261 points lying
directly on top of the outbound line make every handle ambiguous. The raw export
is kept here unmodified so the cut can be checked.

**Lesson, and the reason `#/section` exists:** edit one section at a time. A
534 km document is too large for 49 km of error to be visible.

## Tracing method — decided 2026-08-23

**Snap to roads, not footways.** In the editor this means choosing the cycling
profile rather than the walking one.

Japanese footway mapping is patchy and inconsistent. Pedestrian routing over it
produces false precision: at a complex intersection where Street View shows the
crossings simply are not mapped, the router sends the line zigzagging from one
mapped fragment to another, asserting crossings that will not be made, when in
reality you walk straight across. A road centreline says what it knows and does
not invent what it does not.

The cost is a slight underestimate — doglegs at intersections where you cannot
cross directly, perhaps 30–80 m each, at the awkward ones only. That is well
under one percent, and smaller than hotel access mileage, wrong turns, and the
corner-cutting still present in the sections not yet retraced. The total was
always a floor.

**Sections traced before this was settled were checked and are consistent with
it**: all show under 0.5 turns over 100 degrees per kilometre, where a
footway-snapped line would show several. No rework was needed.

**The exception** is the three places where which side of the road you are on is
the entire question: the Hakone Pass IC shoulder, the Hamanako bridges, and the
Kiso river crossings on the Saya Kaido. Those want a recorded annotation saying
which side and why — an annotation survives a retrace; a line does not.

## Still outstanding

All 98 anchors sit on this line within 500 m, almost all within 10 m. The
coarsest sections were not touched by the tracing session and remain the work
queue — see `#/section` in the app, which ranks them live.
