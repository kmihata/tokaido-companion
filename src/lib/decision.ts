/**
 * Late-in-the-day decision support.
 *
 * WHAT THIS IS NOT: a recommendation engine. It computes arithmetic on inputs
 * Kevin supplies and shows its working. The `posture` it returns is a summary
 * of that arithmetic, not advice, and the UI must present it as such. Kevin
 * decides.
 *
 * Every number that comes out of here inherits the uncertainty of what went
 * in. Distances in this build come from a schematic corridor sketch, so the
 * outputs are exercise, not guidance. See ARCHITECTURE.md.
 *
 * Pure; unit-tested in tests/unit/decision.test.ts.
 */
import { etaFor, isPlausiblePace, minutesBetween, minutesFor } from './pace';

export interface BailoutOption {
  id: string;
  title: string;
  /** Walking distance from the current position, km. */
  distanceKm: number;
  /** False when this is the last bailout before a thin stretch. */
  moreBeyond?: boolean;
}

export interface DecisionInput {
  now: Date;
  /** Today's planned route distance, km. */
  plannedDistanceKm: number;
  /** Distance already walked today, km. */
  completedKm: number;
  /** Average pace including stops, km/h. Null when unknown. */
  paceKmh: number | null;
  /** Sunset, or a deadline Kevin entered by hand. Null when unknown. */
  daylightDeadline: Date | null;
  /** Nearest rail or bus exit ahead. */
  nextBailout: BailoutOption | null;
  /** Extra distance from the planned finish to the sleep base, km. */
  hotelDistanceKm: number | null;
  /** Tomorrow's planned distance before any change, km. */
  tomorrowBaselineKm: number | null;
  /**
   * Buffer subtracted from the daylight deadline before judging the margin.
   * Defaults to 45 minutes: terrain shadow, a wrong turn, and the last
   * kilometre always taking longer than the arithmetic says.
   */
  safetyBufferMinutes?: number;
}

export type Posture = 'continue' | 'reassess' | 'stop' | 'insufficient-data';

export interface DecisionResult {
  remainingKm: number;
  completedFraction: number;
  /** Predicted arrival at the planned finish. */
  etaFinish: Date | null;
  minutesToFinish: number | null;
  /** Predicted arrival at the sleep base, if the extra distance is known. */
  etaHotel: Date | null;
  /** Minutes of daylight left from now. Negative once past the deadline. */
  daylightRemainingMinutes: number | null;
  /** Daylight left at the planned finish, after the safety buffer. */
  finishMarginMinutes: number | null;
  bailout:
    | {
        id: string;
        title: string;
        distanceKm: number;
        minutes: number | null;
        eta: Date | null;
        marginMinutes: number | null;
      }
    | null;
  /** Distance that moves to tomorrow if Kevin stops right now. */
  deferredKm: number;
  tomorrowIfStopNowKm: number | null;
  posture: Posture;
  /** Plain statements of what drove the posture. Shown to the user verbatim. */
  reasons: string[];
  /** Missing or implausible inputs. Shown to the user verbatim. */
  warnings: string[];
}

export const DEFAULT_SAFETY_BUFFER_MINUTES = 45;

export function evaluateDecision(input: DecisionInput): DecisionResult {
  const {
    now,
    plannedDistanceKm,
    completedKm,
    paceKmh,
    daylightDeadline,
    nextBailout,
    hotelDistanceKm,
    tomorrowBaselineKm,
    safetyBufferMinutes = DEFAULT_SAFETY_BUFFER_MINUTES,
  } = input;

  const reasons: string[] = [];
  const warnings: string[] = [];

  const remainingKm = Math.max(0, plannedDistanceKm - completedKm);
  const completedFraction =
    plannedDistanceKm > 0 ? Math.min(1, Math.max(0, completedKm / plannedDistanceKm)) : 0;

  const usablePace = isPlausiblePace(paceKmh) ? paceKmh : null;
  if (paceKmh === null) {
    warnings.push('No pace entered. Every arrival time below is unavailable until you set one.');
  } else if (!isPlausiblePace(paceKmh)) {
    warnings.push(
      `Pace of ${paceKmh.toFixed(1)} km/h is outside the plausible range for a loaded walker (1.5–8 km/h). Times are suppressed.`,
    );
  }

  const minutesToFinish = minutesFor(remainingKm, usablePace);
  const etaFinish = etaFor(now, remainingKm, usablePace);
  const etaHotel =
    hotelDistanceKm === null ? null : etaFor(now, remainingKm + hotelDistanceKm, usablePace);
  if (hotelDistanceKm === null) {
    warnings.push('Distance from the finish to the sleep base is unknown, so arrival at the hotel is not shown.');
  }

  const daylightRemainingMinutes =
    daylightDeadline === null ? null : minutesBetween(now, daylightDeadline);
  if (daylightDeadline === null) {
    warnings.push('No daylight deadline. Set one before treating any of this as a light calculation.');
  }

  const finishMarginMinutes =
    daylightRemainingMinutes === null || minutesToFinish === null
      ? null
      : daylightRemainingMinutes - minutesToFinish - safetyBufferMinutes;

  let bailout: DecisionResult['bailout'] = null;
  if (nextBailout) {
    const minutes = minutesFor(nextBailout.distanceKm, usablePace);
    const eta = etaFor(now, nextBailout.distanceKm, usablePace);
    bailout = {
      id: nextBailout.id,
      title: nextBailout.title,
      distanceKm: nextBailout.distanceKm,
      minutes,
      eta,
      marginMinutes:
        daylightRemainingMinutes === null || minutes === null
          ? null
          : daylightRemainingMinutes - minutes - safetyBufferMinutes,
    };
    if (nextBailout.moreBeyond === false) {
      reasons.push(`${nextBailout.title} is marked as the last exit before a thin stretch.`);
    }
  } else {
    warnings.push('No bailout point loaded for this position.');
  }

  const deferredKm = remainingKm;
  const tomorrowIfStopNowKm =
    tomorrowBaselineKm === null ? null : tomorrowBaselineKm + deferredKm;
  if (tomorrowBaselineKm === null) {
    warnings.push("Tomorrow's baseline distance is unknown, so the cost of stopping is not shown.");
  }

  // ---- Posture -----------------------------------------------------------
  // Deliberately blunt and conservative. Anything uncertain resolves downward.
  let posture: Posture;

  if (usablePace === null || daylightDeadline === null) {
    posture = 'insufficient-data';
    reasons.push('Not enough input to compare the remaining distance against the remaining light.');
  } else if (remainingKm === 0) {
    posture = 'continue';
    reasons.push('Planned distance is already complete.');
  } else if (finishMarginMinutes !== null && finishMarginMinutes < 0) {
    posture = 'stop';
    reasons.push(
      `Finishing the planned distance runs past the deadline once a ${safetyBufferMinutes}-minute buffer is allowed for.`,
    );
    if (bailout !== null && bailout.marginMinutes !== null && bailout.marginMinutes < 0) {
      reasons.push(`${bailout.title} is also beyond the deadline at this pace.`);
    }
  } else if (bailout && bailout.marginMinutes !== null && bailout.marginMinutes < 0) {
    posture = 'stop';
    reasons.push(`The next exit, ${bailout.title}, is beyond the deadline at this pace.`);
  } else if (finishMarginMinutes !== null && finishMarginMinutes < 60) {
    posture = 'reassess';
    reasons.push('Less than an hour of margin at the planned finish, after the buffer.');
  } else {
    posture = 'continue';
    reasons.push('The planned finish is inside the daylight deadline with margin to spare.');
  }

  if (daylightRemainingMinutes !== null && daylightRemainingMinutes < 0) {
    reasons.push('The daylight deadline has already passed.');
  }

  return {
    remainingKm,
    completedFraction,
    etaFinish,
    minutesToFinish,
    etaHotel,
    daylightRemainingMinutes,
    finishMarginMinutes,
    bailout,
    deferredKm,
    tomorrowIfStopNowKm,
    posture,
    reasons,
    warnings,
  };
}

export const POSTURE_LABEL: Record<Posture, string> = {
  continue: 'On the numbers, continuing fits',
  reassess: 'The margin is thin',
  stop: 'The numbers do not fit',
  'insufficient-data': 'Not enough entered to say',
};
