/**
 * Day planning: where each walking day ends, and what that costs the next one.
 *
 * The whole route is built first; where the days break is a separate, iterative
 * question — set day 5, run day 6, find it too long, push kilometres back into
 * 5. So a day boundary is a POSITION ALONG the route, never a piece of
 * geometry. Moving one changes two numbers and re-cuts nothing.
 *
 * Boundaries prefer to sit on a named anchor — a post station, a bridge, a pass
 * — because an anchor survives a geometry repair upstream and a raw distance
 * does not. `endAnchorId` wins when it resolves; `endAlongKm` is the fallback.
 *
 * Pure. Unit-tested in tests/unit/dayPlan.test.ts.
 */
import type { AnchorFeature, Day } from '../data/schemas';
import type { PlanningLine } from './planningLine';
import { crossesBreak, positionAt, sliceLine } from './planningLine';
import type { Position } from './geo';
import { nearestPointOnLine } from './geo';

export const DAY_PLAN_SCHEMA_VERSION = 1;

export interface DayPlan {
  dayId: string;
  walkingDayNumber: number;
  /** Distance along the planning line at which this day ends, km. */
  endAlongKm: number;
  /** Anchor the end snaps to, when it does. Takes precedence over endAlongKm. */
  endAnchorId: string | null;
  /**
   * How far beyond the planned end the prepared continuation route runs, km.
   * Null means no continuation has been chosen.
   */
  continueToAlongKm: number | null;
  continueToAnchorId: string | null;
}

export interface DayPlanDocument {
  schemaVersion: number;
  updatedAt: string;
  /** Only the days Kevin has actually moved. Everything else uses the default. */
  overrides: Record<string, Partial<DayPlan>>;
}

export function emptyDayPlanDocument(): DayPlanDocument {
  return { schemaVersion: DAY_PLAN_SCHEMA_VERSION, updatedAt: new Date().toISOString(), overrides: {} };
}

/**
 * Default endpoints, mapped onto the anchors that came with the route.
 *
 * These follow the stage endpoints in DAILY-SCHEDULE-DRAFT.md. Two are
 * approximations because the source route does not label them: Kawasaki-juku
 * sits between Rokugobashi and Hatchonawate, and the final day ends where the
 * source data ends rather than at Sanjo Ohashi.
 */
export const DEFAULT_DAY_END_ANCHORS: Record<number, { titleJa: string; note?: string }> = {
  1: { titleJa: '八丁畷駅', note: 'Kawasaki-juku is not labelled upstream; Hatchonawate is the nearest anchor.' },
  2: { titleJa: '藤沢宿' },
  3: { titleJa: '小田原宿' },
  4: {
    titleJa: '箱根関所',
    note: 'Lake Ashi, not Mishima. Climbing to the pass and descending the far side in one day wastes the best scenery on the route and arrives late; this stops at the top. Confirmed by a paid booking — see RESERVATION-AT-RISK-LEDGER.md, HAKONE-01. Walk 5 then starts at the lake and descends.',
  },
  5: {
    titleJa: '吉原宿',
    note: 'Shortened from Yui. Walk 4 now stops at Lake Ashi, so this day opens with the Hakone west descent and should not also carry a pass.',
  },
  6: {
    titleJa: '府中宿',
    note: 'Carries Satta Pass. Ends at Fuchu (Shizuoka), the largest rail hub between Odawara and Hamamatsu.',
  },
  7: {
    titleJa: '日坂宿',
    note: 'Carries Utsunoya Pass. One pass per day from here to Hamamatsu rather than two on one day.',
  },
  8: { titleJa: '浜松宿' },
  9: { titleJa: '吉田宿' },
  10: {
    titleJa: '東栄町交差点',
    note: 'Extended past Okazaki. Okazaki-juku left Walk 10 at 19.9 mi and Walk 11 at 27.3 mi with no anchor in the nine miles between Okazaki and Chiryu, so the short day and the long day could not be traded against each other. The Toeicho crossing sits in that gap: 26.5 / 20.6, and the bed is 579 m off the road instead of the 3.4 km from Okazaki-juku to Okazaki Station. Walk 11 still finishes at Manba Ohashi and still rides back to Nagoya, but from twenty-one miles rather than twenty-seven.',
  },
  11: {
    titleJa: '岩塚駅南交差点',
    note: 'Pulled back 1.91 km from Manba Ohashi to the point where the Saya Kaido crosses the road to Iwatsuka Station, 396 m from the platform. Manba has no station: finishing there meant walking the same 1.91 km back, or waiting on a bus, at the end of a day that already had to get to Nagoya. Finishing at the crossing walks that stretch ONCE, as the first two kilometres of Walk 12 on 2026-11-03, and turns both the evening and the return into a subway ride. The cost is Walk 12 at 27.6 mi / 44.4 km, the longest day on the route, with 0.6 km of headroom under the 45 km line — on the day whose crossing is still unresolved. Watch that.',
  },
  12: {
    titleJa: '伊勢朝日駅前',
    note: 'Pulled back from Yokkaichi. Walk 11 finishing at Iwatsuka handed this day the 1.91 km to Manba and made it 27.6 mi, the longest on the route, on the day whose Kiso Three Rivers crossing is still the largest unmeasured distance anywhere. Machiya Bridge was the first candidate at 20.9 mi, but it is 2.6 km from Kuwana Station; the Tokaido passes 55 m from the Ise-Asahi platform 0.6 mi further on, so the day ends by stepping off the road onto a train. Kuwana is one stop back on the Kintetsu Nagoya Line. Same principle as Iwatsuka on Walk 11: finish at a station, not at a bridge.',
  },
  13: {
    titleJa: '小野町',
    note: 'Two moves in one day, 2026-09-16. First back from Sakashita, which sits 5.8 km from any station and was the worst bed on the route. Then back again a further 1.3 mi from Seki-juku to Ono-cho, because lodging here is 274 m off the road. That second move is worth more than the mile it costs: finishing at Seki meant a one-stop hop to Kameyama in the evening and the 06:02 back out in the morning, which put a rural timetable in front of the Suzuka start. From Ono-cho the pass day begins on foot at whatever hour the weather and the legs allow, which is the whole point of a first-light start. Walk 14 carries the difference at 25.5 mi / 41.0 km.',
  },
  14: {
    titleJa: '甲西駅前',
    note: 'Pulled back 1.7 mi from Ishibe-juku to even out the last two days at 24.2 and 24.4 — and, more to the point, to take distance off the Suzuka day. This is the second of the two low-rail days, it carries a 378 m climb and an explicit weather gate, and nothing recovers after it. Kosei Station is 306 m off the road on the JR Kusatsu Line, so the day ends at a platform; the Nov 5 bed is about 500 m further on. Mikumo Station at 306.5 mi was the shorter alternative at 21.7 / 26.9 and stays the fallback if the forecast is bad.',
  },
  15: { titleJa: '三条大橋', note: 'The route terminus. Reached since the Kyoto approach was traced on 2026-08-22.' },
};

/** How far off the line an anchor may sit and still be a usable day finish. */
export const ANCHOR_TOLERANCE_KM = 0.05;

/**
 * How close counts as "this anchor IS that vertex".
 *
 * It has to be tight enough to mean identity and no more. This was 0.0005
 * degrees, which is about 55 m — not an exact-match test but a snap, and with
 * the route averaging 69 m between points it quietly pulled anchors onto
 * whichever vertex was nearest. A point deliberately placed part-way along a
 * segment — one of Kevin's own, or a shipped anchor nudged off a bad vertex —
 * was dragged back to the vertex it was moved away from, and the move looked
 * like it had simply not worked.
 *
 * Coordinates are stored to six decimal places, so 1e-6 degrees (~0.1 m)
 * absorbs the rounding and nothing else.
 */
const VERTEX_MATCH_DEG = 1e-6;

/**
 * Distance along the planning line for an anchor, or null if it is not on it.
 *
 * Two cases. Anchors that came with the route sit exactly on a source vertex,
 * so an exact coordinate match is cheaper and finds them. Anchors Kevin placed
 * himself were snapped to a projected point part-way along a segment, which is
 * usually not a vertex at all — so fall back to projecting.
 *
 * Returning null is meaningful: it is how an anchor on an inactive variant, or
 * a point genuinely off the route, is refused as a day finish.
 */
export function anchorAlongKm(
  line: PlanningLine,
  anchors: readonly AnchorFeature[],
  anchorId: string,
): number | null {
  const a = anchors.find((x) => x.properties.id === anchorId);
  if (!a) return null;
  const target: Position = [a.geometry.coordinates[0], a.geometry.coordinates[1]];

  let best: { km: number; d: number } | null = null;
  for (let i = 0; i < line.positions.length; i++) {
    const p = line.positions[i]!;
    const d = Math.abs(p[0] - target[0]) + Math.abs(p[1] - target[1]);
    if (best === null || d < best.d) best = { km: line.cumulativeKm[i]!, d };
  }
  if (best && best.d < VERTEX_MATCH_DEG) return best.km;

  const near = nearestPointOnLine(line.positions, target);
  if (!near) return null;
  return near.offRouteKm <= ANCHOR_TOLERANCE_KM ? near.alongKm : null;
}

export function buildDefaultDayPlans(
  line: PlanningLine,
  anchors: readonly AnchorFeature[],
  days: readonly Day[],
): DayPlan[] {
  const walks = days
    .filter((d) => d.kind === 'walk' && typeof d.walkingDayNumber === 'number')
    .sort((a, b) => (a.walkingDayNumber ?? 0) - (b.walkingDayNumber ?? 0));

  const plans: DayPlan[] = [];
  let previousKm = 0;
  for (const d of walks) {
    const n = d.walkingDayNumber!;
    const spec = DEFAULT_DAY_END_ANCHORS[n];
    const anchor = spec ? anchors.find((a) => a.properties.titleJa === spec.titleJa) : undefined;
    const fromAnchor = anchor ? anchorAlongKm(line, anchors, anchor.properties.id) : null;
    // Fall back to an even division of what remains, so a missing anchor never
    // produces a zero-length day.
    const remainingDays = walks.length - plans.length;
    const fallback = previousKm + (line.lengthKm - previousKm) / remainingDays;
    const endAlongKm = fromAnchor !== null && fromAnchor > previousKm ? fromAnchor : fallback;

    plans.push({
      dayId: d.id,
      walkingDayNumber: n,
      endAlongKm,
      endAnchorId: fromAnchor !== null && fromAnchor > previousKm ? (anchor?.properties.id ?? null) : null,
      continueToAlongKm: null,
      continueToAnchorId: null,
    });
    previousKm = endAlongKm;
  }
  // The last walking day always finishes at the end of the route.
  const last = plans[plans.length - 1];
  if (last) last.endAlongKm = line.lengthKm;
  return plans;
}

/** Apply stored overrides on top of the defaults, keeping the order sane. */
export function applyOverrides(defaults: readonly DayPlan[], doc: DayPlanDocument | null): DayPlan[] {
  if (!doc) return defaults.map((d) => ({ ...d }));
  return defaults.map((d) => ({ ...d, ...(doc.overrides[d.dayId] ?? {}) }));
}

export interface DayLeg {
  plan: DayPlan;
  day: Day | null;
  startAlongKm: number;
  endAlongKm: number;
  distanceKm: number;
  /** Draft figure from DAILY-SCHEDULE-DRAFT.md, for comparison. */
  draftKm: number | null;
  /** Measured minus draft. Positive means the real line is longer. */
  deltaKm: number | null;
  cumulativeKm: number;
  startAnchorId: string | null;
  endAnchorId: string | null;
  /** A route break falling inside this day, if any. */
  breakInside: { alongKm: number; title: string } | null;
  positions: Position[];
  /** The prepared continuation beyond the planned end. */
  continuation: {
    toAlongKm: number;
    extraKm: number;
    positions: Position[];
    /** Continuation starts before the planned end so switching is easy. */
    overlapKm: number;
  } | null;
}

/** How far before the planned end a continuation route starts. */
export const CONTINUATION_OVERLAP_KM = 3;

export function buildLegs(
  line: PlanningLine,
  plans: readonly DayPlan[],
  days: readonly Day[],
  anchors: readonly AnchorFeature[],
): DayLeg[] {
  const legs: DayLeg[] = [];
  let start = 0;
  let cumulative = 0;

  const ordered = [...plans].sort((a, b) => a.walkingDayNumber - b.walkingDayNumber);

  for (const plan of ordered) {
    // An anchor, when it resolves, beats a stored distance.
    const fromAnchor = plan.endAnchorId ? anchorAlongKm(line, anchors, plan.endAnchorId) : null;
    // The last walking day always ends where the route ends, whatever anchor it
    // carries. Otherwise extending the route — adding the missing approach into
    // Kyoto, say — would silently leave those kilometres walked by nobody.
    const isLast = plan === ordered[ordered.length - 1];
    const end = isLast
      ? line.lengthKm
      : Math.max(start, Math.min(line.lengthKm, fromAnchor ?? plan.endAlongKm));
    const distanceKm = end - start;
    cumulative += distanceKm;

    const day = days.find((d) => d.id === plan.dayId) ?? null;
    const draftKm = day?.nominalDistanceKm ?? null;

    let continuation: DayLeg['continuation'] = null;
    const contAnchor = plan.continueToAnchorId
      ? anchorAlongKm(line, anchors, plan.continueToAnchorId)
      : null;
    const contTo = contAnchor ?? plan.continueToAlongKm;
    if (contTo !== null && contTo > end) {
      const overlapStart = Math.max(start, end - CONTINUATION_OVERLAP_KM);
      continuation = {
        toAlongKm: Math.min(line.lengthKm, contTo),
        extraKm: Math.min(line.lengthKm, contTo) - end,
        positions: sliceLine(line, overlapStart, Math.min(line.lengthKm, contTo)),
        overlapKm: end - overlapStart,
      };
    }

    legs.push({
      plan,
      day,
      startAlongKm: start,
      endAlongKm: end,
      distanceKm,
      draftKm,
      deltaKm: draftKm === null ? null : distanceKm - draftKm,
      cumulativeKm: cumulative,
      startAnchorId: legs[legs.length - 1]?.endAnchorId ?? null,
      endAnchorId: plan.endAnchorId,
      breakInside: crossesBreak(line, start, end),
      positions: sliceLine(line, start, end),
      continuation,
    });
    start = end;
  }
  return legs;
}

/**
 * Move one day's end, and report what it does to both affected days.
 *
 * The end cannot pass the day before it or the day after it: a day of negative
 * length is not a thing, and silently reordering days would be worse than
 * refusing.
 */
export interface MoveResult {
  plans: DayPlan[];
  ok: boolean;
  reason: string | null;
}

export function moveDayEnd(
  plans: readonly DayPlan[],
  line: PlanningLine,
  dayId: string,
  newAlongKm: number,
  newAnchorId: string | null = null,
): MoveResult {
  const sorted = [...plans].sort((a, b) => a.walkingDayNumber - b.walkingDayNumber);
  const i = sorted.findIndex((p) => p.dayId === dayId);
  if (i < 0) return { plans: sorted, ok: false, reason: 'No such walking day.' };
  if (i === sorted.length - 1) {
    return { plans: sorted, ok: false, reason: 'The last day ends where the route ends.' };
  }

  const lowerBound = i === 0 ? 0 : sorted[i - 1]!.endAlongKm;
  const upperBound = sorted[i + 1]!.endAlongKm;
  const clamped = Math.min(line.lengthKm, Math.max(0, newAlongKm));

  if (clamped <= lowerBound) {
    return { plans: sorted, ok: false, reason: 'That would put this day before the one that precedes it.' };
  }
  if (clamped >= upperBound) {
    return { plans: sorted, ok: false, reason: 'That would push past the end of the next day.' };
  }

  const next = sorted.map((p, j) =>
    j === i ? { ...p, endAlongKm: clamped, endAnchorId: newAnchorId } : { ...p },
  );
  return { plans: next, ok: true, reason: null };
}

/** Anchors that fall between two distances, in order. Candidate endpoints. */
export function anchorsBetween(
  line: PlanningLine,
  anchors: readonly AnchorFeature[],
  fromKm: number,
  toKm: number,
): { anchor: AnchorFeature; alongKm: number }[] {
  const out: { anchor: AnchorFeature; alongKm: number }[] = [];
  for (const a of anchors) {
    const km = anchorAlongKm(line, anchors, a.properties.id);
    if (km === null) continue;
    if (km > fromKm && km < toKm) out.push({ anchor: a, alongKm: km });
  }
  return out.sort((x, y) => x.alongKm - y.alongKm);
}

/** Summary numbers for the whole plan. */
/**
 * The point at which a day stops being an ordinary long day.
 *
 * Was 40 km, calibrated when the schedule ran 21 to 55 km and three days were
 * genuinely unwalkable. After the 2026-09-13 rebalance the spread is 21 to 44,
 * so 40 flagged five ordinary days — a warning that fires on a third of the
 * trip is one Kevin stops reading. 45 is above the current worst day, which
 * means the marker is silent now and speaks again only if a day grows.
 *
 * It lived as a bare `40` in five places, which is how the Plan screen, the
 * Prepare screen and the import preview could have drifted apart. One export.
 */
export const OVER_LONG_KM = 45;

export function planTotals(legs: readonly DayLeg[]): {
  totalKm: number;
  meanKm: number;
  longest: DayLeg | null;
  shortest: DayLeg | null;
  overLongCount: number;
} {
  const walking = legs.filter((l) => l.distanceKm > 0);
  const totalKm = walking.reduce((t, l) => t + l.distanceKm, 0);
  const sorted = [...walking].sort((a, b) => a.distanceKm - b.distanceKm);
  return {
    totalKm,
    meanKm: walking.length ? totalKm / walking.length : 0,
    longest: sorted[sorted.length - 1] ?? null,
    shortest: sorted[0] ?? null,
    overLongCount: walking.filter((l) => l.distanceKm > OVER_LONG_KM).length,
  };
}

export { positionAt };
