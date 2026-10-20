/**
 * "Where am I?" on the Today screen: distance left today, walking time at
 * 3 mph, and pace so far, from one tapped GPS fix. Nothing typed.
 *
 * Kevin, 2026-10-20, first walking day: the distance remaining is "the most
 * important piece of data from Samwise, because the actual track is on
 * footpath." He wanted it on Today, fixed on a button push, with "current pace
 * to that point" including stops, and no input fields. The Decide screen asked
 * him to type distance, pace and elapsed time, which defeats a tool meant to
 * reduce load at the end of a long day.
 *
 * Pure. Unit-tested in tests/unit/whereAmI.test.ts.
 */
import type { Position } from './geo';
import { nearestPointOnLine } from './geo';
import type { PlanningLine } from './planningLine';
import { sliceLine } from './planningLine';
import { paceKmh, walkingTimeLeft } from './pace';
import type { WalkingTimeLeft } from './pace';

/**
 * How far either side of today's section a fix may match.
 *
 * Projecting onto the whole 537 km line lets one bad fix land on another day.
 * Limiting the search to today, plus this margin, keeps the answer on today's
 * section while still recognising "not started yet" and "walked past the end".
 */
export const LEG_SEARCH_MARGIN_KM = 2;

/** Beyond this, the fix is not credibly on today's section at all. */
export const FAR_FROM_SECTION_KM = 1.0;

/** Below this, off-route distance is GPS noise and not worth showing. */
export const OFF_ROUTE_SHOW_KM = 0.15;

/** Pace needs at least this much distance and time before it means anything. */
export const PACE_MIN_KM = 0.3;
export const PACE_MIN_MINUTES = 10;

export interface LegBounds {
  startAlongKm: number;
  endAlongKm: number;
}

export type LegStatus = 'before-start' | 'on-section' | 'past-finish' | 'far-from-section';

export interface LegPosition {
  /** Position along the whole planning line, km. Clamped to today's section. */
  alongKm: number;
  /** Unclamped value, for diagnostics and tests. */
  rawAlongKm: number;
  offRouteKm: number;
  status: LegStatus;
}

/**
 * Locate a fix on today's section of the planning line.
 *
 * Returns null only when there is no geometry to measure against.
 */
export function locateOnLeg(line: PlanningLine, leg: LegBounds, p: Position): LegPosition | null {
  const from = Math.max(0, leg.startAlongKm - LEG_SEARCH_MARGIN_KM);
  const to = Math.min(line.lengthKm, leg.endAlongKm + LEG_SEARCH_MARGIN_KM);
  const slice = sliceLine(line, from, to);
  if (slice.length === 0) return null;
  const near = nearestPointOnLine(slice, p);
  if (!near) return null;

  const rawAlongKm = from + near.alongKm;
  const alongKm = Math.min(leg.endAlongKm, Math.max(leg.startAlongKm, rawAlongKm));

  let status: LegStatus;
  if (near.offRouteKm > FAR_FROM_SECTION_KM) status = 'far-from-section';
  else if (rawAlongKm < leg.startAlongKm) status = 'before-start';
  else if (rawAlongKm >= leg.endAlongKm) status = 'past-finish';
  else status = 'on-section';

  return { alongKm, rawAlongKm, offRouteKm: near.offRouteKm, status };
}

/** A tapped fix, reduced to what later taps need. Stored per day. */
export interface TapRecord {
  dayId: string;
  /** Epoch ms. */
  at: number;
  alongKm: number;
}

export interface PaceSoFar {
  kmh: number;
  mph: number;
  km: number;
  minutes: number;
  sinceAt: number;
}

/**
 * Pace from the day's first tap to now, stops included. One number on
 * purpose: Kevin, "no need to separate those."
 *
 * Null when there is too little distance or time for the figure to mean
 * anything, or when the two taps are not on the same day.
 */
export function paceSoFar(first: TapRecord | null, now: TapRecord): PaceSoFar | null {
  if (!first || first.dayId !== now.dayId) return null;
  const km = now.alongKm - first.alongKm;
  const minutes = (now.at - first.at) / 60_000;
  if (km < PACE_MIN_KM || minutes < PACE_MIN_MINUTES) return null;
  const kmh = paceKmh(km, minutes);
  if (kmh === null) return null;
  return { kmh, mph: kmh / 1.609344, km, minutes, sinceAt: first.at };
}

export interface WhereAmIResult {
  position: LegPosition;
  /** Left to today's finish along the path, with walking time at 3 mph. */
  left: WalkingTimeLeft;
  /** Walked from today's start, along the path. */
  walkedKm: number;
  /** Show the off-route figure only when it is more than GPS noise. */
  showOffRoute: boolean;
}

export function measureWhereAmI(
  line: PlanningLine,
  leg: LegBounds,
  p: Position,
): WhereAmIResult | null {
  const position = locateOnLeg(line, leg, p);
  if (!position) return null;
  const left = walkingTimeLeft(position.alongKm, leg.endAlongKm);
  if (!left) return null;
  return {
    position,
    left,
    walkedKm: position.alongKm - leg.startAlongKm,
    showOffRoute: position.offRouteKm >= OFF_ROUTE_SHOW_KM,
  };
}

/**
 * Whether a new tap should replace the stored first tap of the day.
 *
 * A first tap far from today's section is not a useful starting point for
 * pace — it was probably taken on a train or at home with a pretend position
 * off — so the next credible tap takes its place.
 */
export function shouldReplaceFirstTap(stored: TapRecord | null, dayId: string, status: LegStatus): boolean {
  if (status === 'far-from-section') return false;
  return !stored || stored.dayId !== dayId;
}
