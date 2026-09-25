/**
 * Pace, ETA and elapsed-time arithmetic. Pure; unit-tested.
 *
 * "Pace" throughout this app means average ground speed in km/h INCLUDING
 * stops, because that is the number that predicts arrival. A moving pace that
 * ignores twenty minutes of photographs and a convenience-store stop will
 * quietly promise daylight that is not there.
 */

export const MIN_PLAUSIBLE_PACE_KMH = 1.5;
export const MAX_PLAUSIBLE_PACE_KMH = 8;

/** Average pace in km/h over a distance and an elapsed duration. */
export function paceKmh(distanceKm: number, elapsedMinutes: number): number | null {
  if (!Number.isFinite(distanceKm) || !Number.isFinite(elapsedMinutes)) return null;
  if (elapsedMinutes <= 0 || distanceKm < 0) return null;
  return distanceKm / (elapsedMinutes / 60);
}

/** Minutes needed to cover `distanceKm` at `kmh`. Null if the pace is unusable. */
export function minutesFor(distanceKm: number, kmh: number | null): number | null {
  if (kmh === null || !Number.isFinite(kmh) || kmh <= 0) return null;
  if (!Number.isFinite(distanceKm) || distanceKm < 0) return null;
  return (distanceKm / kmh) * 60;
}

/** Arrival instant for a distance at a pace, starting from `from`. */
export function etaFor(from: Date, distanceKm: number, kmh: number | null): Date | null {
  const mins = minutesFor(distanceKm, kmh);
  if (mins === null) return null;
  return new Date(from.getTime() + mins * 60_000);
}

/** True when a pace is inside the range a loaded walker plausibly sustains. */
export function isPlausiblePace(kmh: number | null): boolean {
  return kmh !== null && kmh >= MIN_PLAUSIBLE_PACE_KMH && kmh <= MAX_PLAUSIBLE_PACE_KMH;
}

export function minutesBetween(a: Date, b: Date): number {
  return (b.getTime() - a.getTime()) / 60_000;
}

/** "4h 20m", "45m", "-15m". Deliberately terse for a phone in the rain. */
export function formatDuration(minutes: number | null): string {
  if (minutes === null || !Number.isFinite(minutes)) return '—';
  const neg = minutes < 0;
  const total = Math.round(Math.abs(minutes));
  const h = Math.floor(total / 60);
  const m = total % 60;
  const body = h > 0 ? `${h}h ${m}m` : `${m}m`;
  return neg ? `-${body}` : body;
}
