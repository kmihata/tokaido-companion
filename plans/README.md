# Day plan snapshots

*Written by Claude Code (Opus 5), 2026-09-13, at Kevin's request after the day
plan export was built.*

Dated snapshots of where each walking day starts and finishes, taken against a
named route version.

**Why they are dated and versioned.** The route moved from `0.3.0-traced` to
`0.13.0-traced` in a single day, and every retrace lengthens it slightly and
pushes every later boundary forward. A plan without its route version cannot be
told from a stale one, and hotels are booked against these numbers.

**`overrides` is the restorable part.** It holds only days moved by hand, so
days left alone follow the defaults for whatever route is shipped — a later
retrace flows through instead of freezing a stale distance. `days` is the
resolved plan, for reading.

These are snapshots, not the source of truth. The live plan is on the device;
More → Settings → Export the day plan writes the same shape.
