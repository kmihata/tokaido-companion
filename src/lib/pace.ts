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

/** Kevin's target moving pace, mph. Stated 2026-10-10: "3.0 mph moving would be my target anyway." */
export const TARGET_MOVING_MPH = 3.0;
export const KM_PER_MILE = 1.609344;

export interface WalkingTimeLeft {
  /** Distance still to cover along the designated path. */
  remainingKm: number;
  remainingMi: number;
  /**
   * Minutes of WALKING left, stops excluded. A FLOOR, never an arrival time.
   *
   * WHY this exists next to a module whose header says pace means km/h
   * INCLUDING stops, and warns that a moving pace "will quietly promise
   * daylight that is not there" — that warning is about PREDICTING ARRIVAL,
   * and it still stands. `evaluateDecision` owns that question and must keep
   * using blended pace.
   *
   * This answers a different question, and Kevin stated it exactly: "if you
   * told me this is how many hours, then I'd know if I had time for breaks."
   * The whole value is that stops are EXCLUDED, so what is left over is the
   * stop budget he spends himself. Reported as a floor it cannot mislead;
   * reported as an ETA it would be the exact defect the header warns about.
   * Label it as walking time wherever it is shown. It is not an ETA.
   *
   * Calibration, from the 2026-10-06 walk: 14.29 mi in 4:38:38 elapsed is
   * 3.08 mph INCLUDING stops. So 3.0 mph moving is conservative — the figure
   * here will usually exceed the time the day actually takes. That errs long,
   * which is the safe direction for a bailout call, but it is why this must
   * never be presented as a prediction.
   */
  movingMinutes: number;
  /** The projection puts you at or beyond the day's finish. */
  pastFinish: boolean;
}

/**
 * How far is left along the designated path, and how long that is on foot.
 *
 * Both arguments are linear references on the active route, so this measures
 * along the line rather than straight to the finish — the distinction that
 * makes it usable in Hakone, where the two differ by kilometres.
 *
 * Returns null rather than a wrong number when an input is unusable.
 */
export function walkingTimeLeft(
  alongKm: number,
  finishAlongKm: number,
  mph: number = TARGET_MOVING_MPH,
): WalkingTimeLeft | null {
  if (!Number.isFinite(alongKm) || !Number.isFinite(finishAlongKm)) return null;
  if (!Number.isFinite(mph) || mph <= 0) return null;

  const raw = finishAlongKm - alongKm;
  const pastFinish = raw <= 0;
  const remainingKm = pastFinish ? 0 : raw;
  const kmh = mph * KM_PER_MILE;

  return {
    remainingKm,
    remainingMi: remainingKm / KM_PER_MILE,
    movingMinutes: (remainingKm / kmh) * 60,
    pastFinish,
  };
}
