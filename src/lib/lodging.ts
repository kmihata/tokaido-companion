/**
 * Lodging seen as deadlines rather than as a list of hotels.
 *
 * WHY this exists: the reservations are all booked and all still cancellable,
 * and the thing that can go wrong on the road is not forgetting where you are
 * sleeping — it is a free-cancellation window closing while you are deciding
 * whether to change a day. Two of them close before departure. The rest close
 * one or two days before their own night, several at an evening cut-off rather
 * than midnight, and one at midnight two days out.
 *
 * So the question this module answers is not "where am I staying" but "what
 * does it cost me to change my mind, and by when".
 *
 * Everything here is pure. It takes private records that live only on the
 * device and returns derived values; nothing is stored, sent or logged.
 */
import { haversineKm } from './geo';
import type { Position } from './geo';
import type { PrivateLodging } from '../data/privateSchema';

/** How far ahead a change is still worth warning about, in days. */
export const ROUTE_CHANGE_HORIZON_DAYS = 3;

export type DeadlinePrecision = 'exact' | 'date-only' | 'none';

export interface LodgingDeadline {
  /** When the free window closes, as an instant, if we can know that. */
  at: Date | null;
  precision: DeadlinePrecision;
  /** Milliseconds from `now` until `at`; negative once it has passed. */
  msRemaining: number | null;
  passed: boolean;
}

/**
 * Resolve a stay's deadline.
 *
 * A date-only deadline is deliberately treated as the END of that day in the
 * property's own country rather than midnight UTC or local midnight on the
 * device. Japan is UTC+9, and the device will be in Japan: reading
 * "2026-10-16" as UTC would move the cut-off nine hours earlier and could
 * report a live booking as expired. We would rather be late and wrong in the
 * direction that makes Kevin look it up than early and wrong in the direction
 * that makes him stop looking.
 */
export function resolveDeadline(
  lodging: Pick<PrivateLodging, 'cancellationDeadline' | 'cancellationDeadlineIso'>,
  now: Date,
  dateOnlyOffsetMinutes = 9 * 60,
): LodgingDeadline {
  let at: Date | null = null;
  let precision: DeadlinePrecision = 'none';

  if (lodging.cancellationDeadlineIso) {
    const parsed = new Date(lodging.cancellationDeadlineIso);
    if (!Number.isNaN(parsed.getTime())) {
      at = parsed;
      precision = 'exact';
    }
  }
  if (!at && lodging.cancellationDeadline) {
    const sign = dateOnlyOffsetMinutes < 0 ? '-' : '+';
    const abs = Math.abs(dateOnlyOffsetMinutes);
    const hh = String(Math.floor(abs / 60)).padStart(2, '0');
    const mm = String(abs % 60).padStart(2, '0');
    const parsed = new Date(`${lodging.cancellationDeadline}T23:59:59${sign}${hh}:${mm}`);
    if (!Number.isNaN(parsed.getTime())) {
      at = parsed;
      precision = 'date-only';
    }
  }

  if (!at) return { at: null, precision: 'none', msRemaining: null, passed: false };
  const msRemaining = at.getTime() - now.getTime();
  return { at, precision, msRemaining, passed: msRemaining < 0 };
}

/**
 * A countdown a tired person can read at a glance.
 *
 * Deliberately coarse above a day — "4 days" is the decision-relevant fact,
 * and "4 days 7 hours" invites arithmetic. Below a day it gets precise,
 * because that is when precision starts mattering.
 */
export function formatCountdown(msRemaining: number | null): string {
  if (msRemaining === null) return 'no deadline recorded';
  if (msRemaining < 0) {
    const past = -msRemaining;
    const days = Math.floor(past / 86_400_000);
    if (days >= 1) return `closed ${days} day${days === 1 ? '' : 's'} ago`;
    const hours = Math.floor(past / 3_600_000);
    if (hours >= 1) return `closed ${hours} hour${hours === 1 ? '' : 's'} ago`;
    return 'closed';
  }
  const days = Math.floor(msRemaining / 86_400_000);
  if (days >= 2) return `${days} days left`;
  const hours = Math.floor(msRemaining / 3_600_000);
  if (hours >= 1) return `${hours} hour${hours === 1 ? '' : 's'} left`;
  const mins = Math.max(0, Math.floor(msRemaining / 60_000));
  return `${mins} minute${mins === 1 ? '' : 's'} left`;
}

export type DeadlineUrgency = 'passed' | 'today' | 'soon' | 'open';

/** Banding for display. 'soon' is inside the route-change horizon. */
export function urgencyOf(d: LodgingDeadline, horizonDays = ROUTE_CHANGE_HORIZON_DAYS): DeadlineUrgency {
  if (d.msRemaining === null) return 'open';
  if (d.passed) return 'passed';
  if (d.msRemaining < 86_400_000) return 'today';
  if (d.msRemaining < horizonDays * 86_400_000) return 'soon';
  return 'open';
}

/**
 * Straight-line distance from a stay to the nearest point on the walked line.
 *
 * Straight-line, and says so wherever it is shown. The real walk from the road
 * to the door is longer and sometimes much longer; this is for "is it on the
 * route or a mile off it", not for adding to the day's mileage.
 */
export function distanceToRouteKm(
  lodging: Pick<PrivateLodging, 'lat' | 'lon'>,
  routePoints: readonly Position[],
): number | null {
  if (lodging.lat === null || lodging.lon === null || routePoints.length === 0) return null;
  const at: Position = [lodging.lon, lodging.lat];
  if (routePoints.length === 1) return haversineKm(at, routePoints[0]!);

  // To the nearest point on the LINE, not the nearest vertex.
  //
  // WHY: the first version of this measured vertex to vertex and was wrong by
  // hundreds of metres wherever the route is sampled coarsely — which is
  // exactly where hotels sit, since seventeen sections are still at 80–99 m
  // and a bridge can be one 700 m step. A hotel standing beside the road
  // halfway between two points would have been reported as 350 m off it. The
  // at-risk ledger's measured figures (Shizuoka 26 m, Shimada 41 m) are
  // perpendicular distances, and these have to agree with those.
  let best = Infinity;
  for (let i = 1; i < routePoints.length; i++) {
    const d = distanceToSegmentKm(at, routePoints[i - 1]!, routePoints[i]!);
    if (d < best) best = d;
  }
  return Number.isFinite(best) ? best : null;
}

/** Point-to-segment distance in km, flat-earth within a segment. */
function distanceToSegmentKm(p: Position, a: Position, b: Position): number {
  const kx = Math.cos((p[1] * Math.PI) / 180) * 111.32;
  const ky = 110.574;
  const px = (p[0] - a[0]) * kx;
  const py = (p[1] - a[1]) * ky;
  const bx = (b[0] - a[0]) * kx;
  const by = (b[1] - a[1]) * ky;
  const len2 = bx * bx + by * by;
  const t = len2 ? Math.max(0, Math.min(1, (px * bx + py * by) / len2)) : 0;
  return Math.hypot(px - bx * t, py - by * t);
}

export interface LodgingView {
  lodging: PrivateLodging;
  deadline: LodgingDeadline;
  urgency: DeadlineUrgency;
  countdown: string;
  distanceKm: number | null;
}

/** Build the display rows, ordered by how soon the decision is forced. */
export function buildLodgingViews(
  lodging: readonly PrivateLodging[],
  now: Date,
  routePoints: readonly Position[] = [],
): LodgingView[] {
  const rows = lodging.map((l) => {
    const deadline = resolveDeadline(l, now);
    return {
      lodging: l,
      deadline,
      urgency: urgencyOf(deadline),
      countdown: formatCountdown(deadline.msRemaining),
      distanceKm: distanceToRouteKm(l, routePoints),
    };
  });
  // Soonest live deadline first; ones already closed and ones with no deadline
  // sink, because neither is a decision any more.
  const rank = (r: LodgingView): number => {
    if (r.deadline.msRemaining === null) return 2;
    if (r.deadline.passed) return 1;
    return 0;
  };
  return rows.sort(
    (a, b) =>
      rank(a) - rank(b) ||
      (a.deadline.msRemaining ?? Infinity) - (b.deadline.msRemaining ?? Infinity),
  );
}

/**
 * Which stays a route change decided now would reach.
 *
 * The question from the checklist is "which reservations would a proposed
 * route change three or more days ahead affect". Answering it needs both
 * halves: the nights the change lands on, and — the part that is easy to miss
 * — the stays whose cancellation window shuts before you would be making the
 * decision. A booking you cannot change for free any more is not a free
 * option, however far away the night is.
 */
export function stakesOfRouteChange(
  views: readonly LodgingView[],
  horizonDays = ROUTE_CHANGE_HORIZON_DAYS,
): { closingFirst: LodgingView[]; alreadyLocked: LodgingView[] } {
  const horizonMs = horizonDays * 86_400_000;
  return {
    closingFirst: views.filter(
      (v) => v.deadline.msRemaining !== null && !v.deadline.passed && v.deadline.msRemaining <= horizonMs,
    ),
    alreadyLocked: views.filter((v) => v.deadline.passed),
  };
}




/**
 * The arrival cut-off for a day's stay, for the night-before plan.
 *
 * WHY this is a function and not a filter inlined in the screen: the answer
 * has three shapes and only one of them is a time. A property that says "any
 * time" has no constraint; a property that says NOTHING has an unknown
 * constraint, and those two must not render the same way. Kevin's own framing
 * is the test — "as long as I know what my cutoff is I can plan" — and an
 * unknown cut-off reported as no cut-off is the one answer that breaks it.
 *
 * Returns null when no stay is attached to the day, which is the ordinary case
 * for a rest day, a day whose stay is a continuing multi-night booking, or any
 * day at all when no private file has been imported.
 */
export function arrivalCutoffForDay(
  lodging: readonly PrivateLodging[],
  dayId: string,
): { text: string; known: boolean; stay: string } | null {
  const stay = lodging.find((l) => l.dayId === dayId && l.arrivalCutoff.trim() !== '');
  if (!stay) return null;
  const text = stay.arrivalCutoff.trim();
  return {
    text,
    known: !/^(not stated|unknown|unstated)$/i.test(text),
    stay: stay.name,
  };
}
