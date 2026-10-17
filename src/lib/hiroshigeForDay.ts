import type { Dataset } from '../data/load';
import type { Day } from '../data/schemas';
import type { DayLeg } from './dayPlan';
import { nearestPointOnLine } from './geo';
import type { Position } from './geo';

/**
 * How far off the walked line a post station may sit and still belong to the
 * day that walks past it. Measured: the furthest station is 407 m from the
 * planning line, because a station is a strip of road reduced to one point.
 */
export const STATION_ON_LEG_KM = 0.5;

/**
 * Which Hiroshige prints belong to a day.
 *
 * WHY this is computed here and not read from `day.hiroshigeRefIds`:
 *
 * The generator assigned prints by walking a cumulative sum of
 * `nominalDistanceKm` and comparing it against station positions measured on
 * the concatenated BASE paths. Those are two different rulers. The base
 * concatenation is 518.53 km; the active route, with the fifty-three retraced
 * variants and the Saya detour, is 537.84 km. Nineteen kilometres of drift
 * accumulate between them, so on 2026-10-16 Walk 4 — the Hakone crossing —
 * listed stations 9, 10 and 11 on its card and showed no prints at all, while
 * Walk 5 showed Hakone's. Kevin found it on the phone.
 *
 * So: measure on the planning line, the same geometry every other distance in
 * this app uses, and take the day's own leg rather than a running total that
 * can drift.
 *
 * The second clause matters as much as the first. A post station can sit just
 * past where the day stops: Hakone-juku is 1.2 km beyond the Moto-Hakone lake
 * shore where Walk 4 ends, so no interval test on geometry alone will ever put
 * it on that day. `day.stationIds` is the hand-kept answer to "what is this
 * stage about", and the card already prints it under "Traditional stations on
 * this stage". Showing a station there and withholding its picture is the
 * defect Kevin actually reported, so the rule is: every station the day names
 * gets its print, plus every station the day walks past.
 */
export function hiroshigeForDay(
  dataset: Dataset,
  day: Day,
  leg: DayLeg | null,
): string[] {
  const printFor = new Map<string, string>();
  for (const h of dataset.hiroshige) {
    if (h.stationId) printFor.set(h.stationId, h.id);
  }

  const chosen = new Set<string>();
  for (const id of day.stationIds) {
    const p = printFor.get(id);
    if (p) chosen.add(p);
  }

  if (leg && leg.positions.length > 1) {
    for (const s of dataset.stations) {
      const p = printFor.get(s.id);
      if (!p || chosen.has(p)) continue;
      const near = nearestPointOnLine(leg.positions, [s.lon, s.lat] as Position);
      if (near && near.offRouteKm <= STATION_ON_LEG_KM) chosen.add(p);
    }
  }

  // Without a leg there is no geometry to ask, so fall back to whatever the
  // data shipped with rather than showing an empty Hiroshige section.
  if (chosen.size === 0) return [...day.hiroshigeRefIds];

  const order = new Map(dataset.hiroshige.map((h, i) => [h.id, h.number ?? i]));
  return [...chosen].sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0));
}
