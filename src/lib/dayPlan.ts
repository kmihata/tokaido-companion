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
  /** Null for a walking day that is not a numbered stage, i.e. Walk 8b. */
  walkingDayNumber: number | null;
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
export const DEFAULT_DAY_END_ANCHORS: Record<string, { titleJa: string; note?: string }> = {
  'd-2026-10-20': { titleJa: '八丁畷駅', note: 'Kawasaki-juku is not labelled upstream; Hatchonawate is the nearest anchor.' },
  'd-2026-10-22': { titleJa: '藤沢宿' },
  'd-2026-10-23': { titleJa: '小田原宿' },
  'd-2026-10-24': {
    titleJa: '元箱根湖畔',
    note: 'The lake shore, 1.20 km short of Hakone Sekisho, not the Sekisho itself and not Mishima. Climbing the pass and descending the far side in one day wastes the best scenery and arrives late, so this stops at the top; and it stops at the point on the road nearest the bed rather than walking past it to the checkpoint and 1,410 m back. Walk 5 takes the Sekisho at its start. Confirmed by a paid booking — see RESERVATION-AT-RISK-LEDGER.md, HAKONE-01.',
  },
  'd-2026-10-25': {
    titleJa: '富士・吉原宿西',
    note: 'Fuji, 818 m past Yoshiwara-juku. The road passes 62 m from the bed here against 723 m at the post station, which is walked through on the way. Opens with the Hakone west descent, so it carries no pass of its own.',
  },
  'd-2026-10-26': {
    titleJa: '静岡・府中宿西',
    note: 'Shizuoka, 1,091 m past Fuchu-juku. Carries Satta Pass. Fuchu-juku and JR Shizuoka Station are both walked through before the finish; the road passes 26 m from the bed here.',
  },
  'd-2026-10-27': {
    titleJa: '島田宿',
    note: 'Shimada, not Nissaka. Carries Utsunoya Pass. Nissaka was the only day end on the route with no station — 4.8 km to Kikugawa, 6.7 km to Kakegawa — and reaching the bed meant a rural bus timetable carrying the whole day, twice. Shimada Station is 343 m from the juku and the day ends on foot.',
  },
  'd-2026-10-28': {
    titleJa: '磐田',
    note: 'Iwata, not Hamamatsu. Shimada to Hamamatsu is 55.2 km and cannot be one day, so the Shimada split leaves the remainder to Walk 8b. Iwata is 181 m off the road, the closest any station between Kanaya and Hamamatsu comes, and three JR stops from the bed.',
  },
  'd-2026-10-29': {
    titleJa: '浜松宿',
    note: 'Walk 8b. Not a numbered stage and not a rest day: the Shimada split leaves 15.8 km that has to be walked, and the recovery token is spent doing it. Rail back to Iwata, walk in, sleep in the same bed as the night before.',
  },
  'd-2026-10-30': { titleJa: '吉田宿' },
  'd-2026-10-31': {
    titleJa: '東栄町交差点',
    note: 'Extended past Okazaki. Okazaki-juku left this day at 19.9 mi and Walk 11 at 27.3 mi with no anchor in the nine miles between Okazaki and Chiryu, so the short day and the long day could not be traded against each other. The Toeicho crossing sits in that gap, and the bed is 579 m off the road instead of the 3.4 km from Okazaki-juku to Okazaki Station. At 42.7 km this is the longest day on the route.',
  },
  'd-2026-11-01': { titleJa: '岩塚駅南交差点' },
  'd-2026-11-03': { titleJa: '伊勢朝日駅前' },
  'd-2026-11-04': { titleJa: '小野町' },
  'd-2026-11-05': { titleJa: '甲西駅前' },
  'd-2026-11-06': { titleJa: '三条大橋' },
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
  // Every day with walking on it, in date order — not just the numbered stages.
  // Keying this by walking-day number silently excluded Walk 8b, which has no
  // number because it is a half day carved out of a recovery day, and the
  // planner then handed its 15.8 km to the day after it.
  const walks = days
    .filter((d) => d.kind === 'walk')
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date));

  const plans: DayPlan[] = [];
  let previousKm = 0;
  for (const d of walks) {
    const n = d.walkingDayNumber ?? null;
    const spec = DEFAULT_DAY_END_ANCHORS[d.id];
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

  const ordered = [...plans].sort((a, b) => a.endAlongKm - b.endAlongKm);

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
  const sorted = [...plans].sort((a, b) => a.endAlongKm - b.endAlongKm);
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
