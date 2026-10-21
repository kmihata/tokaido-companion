/**
 * "Leave by": the night-before question, worked backward from the end of the
 * day.
 *
 * Kevin, 2026-10-21, planning the first full walking day: the planning view
 * "is really missing the key which is time. It's based on moving, but the night
 * before I have to know what time to leave given distance and conditions."
 *
 * The working is: arrive-by time (sunset minus the buffer, or a same-day
 * check-in cut-off if that is earlier) minus walking time at an ALL-IN pace
 * (stops included, the way Walk 1 was measured) minus the time to get to the
 * start. Every input is shown next to the answer.
 *
 * Pure. Unit-tested in tests/unit/leaveBy.test.ts.
 */
import { KM_PER_MILE } from './pace';
import type { PrivateLodging } from '../data/privateSchema';

/**
 * Default all-in pace, stops included.
 *
 * From Walk 1's Footpath record, 2026-10-20: 23.06 km in 5h 13m, 7:25 to
 * 12:38, which is 2.75 mph. Moving pace alone was 3.45 mph; most of the
 * difference was stoplights in central Tokyo.
 */
export const DEFAULT_ALL_IN_MPH = 2.75;
export const MPH_STEP = 0.25;
export const MIN_MPH = 1.5;
export const MAX_MPH = 4.0;

export interface LeaveByInput {
  distanceKm: number;
  allInMph: number;
  arriveBy: Date;
  /** Minutes from leaving the hotel to starting on the route. */
  travelMinutes: number;
}

export interface LeaveByResult {
  walkMinutes: number;
  startWalkingAt: Date;
  leaveAt: Date;
}

export function computeLeaveBy(i: LeaveByInput): LeaveByResult | null {
  if (!Number.isFinite(i.distanceKm) || i.distanceKm <= 0) return null;
  if (!Number.isFinite(i.allInMph) || i.allInMph <= 0) return null;
  if (Number.isNaN(i.arriveBy.getTime())) return null;
  const walkMinutes = (i.distanceKm / (i.allInMph * KM_PER_MILE)) * 60;
  const startWalkingAt = new Date(i.arriveBy.getTime() - walkMinutes * 60_000);
  const leaveAt = new Date(startWalkingAt.getTime() - Math.max(0, i.travelMinutes) * 60_000);
  return { walkMinutes, startWalkingAt, leaveAt };
}

/** Arrival if you start walking at a given time. The "what if" direction. */
export function arrivalIfStarting(startAt: Date, distanceKm: number, allInMph: number): Date | null {
  if (!Number.isFinite(distanceKm) || distanceKm <= 0 || !(allInMph > 0)) return null;
  const walkMinutes = (distanceKm / (allInMph * KM_PER_MILE)) * 60;
  return new Date(startAt.getTime() + walkMinutes * 60_000);
}

export function clampMph(mph: number): number {
  return Math.min(MAX_MPH, Math.max(MIN_MPH, Math.round(mph / MPH_STEP) * MPH_STEP));
}

export interface CutoffReading {
  /** How to say it, e.g. "4:00 a.m. (overnight)", "9:00 p.m.", "any time". */
  label: string;
  /**
   * Minutes after midnight on the arrival day, when the cut-off falls on the
   * arrival day itself and can therefore limit when you get there. Null when
   * it is overnight, unlimited, or unknown.
   */
  sameDayMinutes: number | null;
  known: boolean;
}

/**
 * Read a check-in cut-off as written in the private file.
 *
 * Booking sites write "Check-in time ends at 4:00 AM". Stored as "04:00", that
 * read on screen as a 4 p.m. deadline, which it is not: an early-morning hour
 * is the desk closing overnight, after the arrival evening. Anything before
 * 06:00 is read that way.
 */
export function readCutoff(raw: string): CutoffReading {
  const text = raw.trim();
  if (!text) return { label: 'not stated', sameDayMinutes: null, known: false };
  if (/^(not stated|unknown|unstated)$/i.test(text)) return { label: 'not stated', sameDayMinutes: null, known: false };
  if (/^any ?time$/i.test(text)) return { label: 'any time', sameDayMinutes: null, known: true };
  if (/^midnight$/i.test(text)) return { label: 'midnight', sameDayMinutes: 24 * 60, known: true };
  const m = /^(\d{1,2}):(\d{2})$/.exec(text);
  if (!m) return { label: text, sameDayMinutes: null, known: true };
  const h = Number(m[1]);
  const min = Number(m[2]);
  const clock = `${((h + 11) % 12) + 1}:${String(min).padStart(2, '0')} ${h < 12 ? 'a.m.' : 'p.m.'}`;
  if (h < 6) return { label: `${clock} (overnight)`, sameDayMinutes: null, known: true };
  return { label: clock, sameDayMinutes: h * 60 + min, known: true };
}

/**
 * The time to aim to arrive: sunset minus the buffer, or a same-day check-in
 * cut-off minus the buffer if that comes first.
 */
export function arriveByFor(
  sunset: Date | null,
  bufferMinutes: number,
  cutoff: CutoffReading | null,
  dayIso: string,
): { at: Date; reason: 'sunset' | 'check-in' } | null {
  const fromSunset = sunset ? new Date(sunset.getTime() - bufferMinutes * 60_000) : null;
  let fromCutoff: Date | null = null;
  if (cutoff?.sameDayMinutes != null) {
    const midnightJst = new Date(`${dayIso}T00:00:00+09:00`).getTime();
    fromCutoff = new Date(midnightJst + (cutoff.sameDayMinutes - bufferMinutes) * 60_000);
  }
  if (fromSunset && fromCutoff) {
    return fromCutoff < fromSunset ? { at: fromCutoff, reason: 'check-in' } : { at: fromSunset, reason: 'sunset' };
  }
  if (fromSunset) return { at: fromSunset, reason: 'sunset' };
  if (fromCutoff) return { at: fromCutoff, reason: 'check-in' };
  return null;
}

export interface AccessPart {
  stay: string;
  km: number;
  when: 'morning' | 'evening';
}

/**
 * Default off-route walking for a day, from the private file: walking out from
 * last night's stay in the morning, plus walking in to tonight's stay in the
 * evening. Only stays with a `routeAccessKm` count; null means rail or
 * unknown. A stay that covers several nights only counts on the day you check
 * in and the day you check out.
 */
export function defaultAccessKm(
  lodging: readonly PrivateLodging[],
  dayIso: string,
): { km: number; parts: AccessPart[] } {
  const parts: AccessPart[] = [];
  const morning = lodging.find((l) => l.checkOut === dayIso && l.routeAccessKm != null);
  if (morning) parts.push({ stay: morning.name, km: morning.routeAccessKm!, when: 'morning' });
  const evening = lodging.find((l) => l.checkIn === dayIso && l.routeAccessKm != null);
  if (evening) parts.push({ stay: evening.name, km: evening.routeAccessKm!, when: 'evening' });
  return { km: parts.reduce((t, p) => t + p.km, 0), parts };
}
