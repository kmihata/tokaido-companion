/**
 * Checks a traced file has to pass before it is trusted.
 *
 * Every one of these exists because a file failed it on 2026-09-13, and in two
 * of the three cases the file looked entirely reasonable on screen.
 *
 * - Tenryugawa to Hamamatsu came back 11.74 km for an 8.81 km section, carrying
 *   a 2.7 km loop at the start that retraced its own points exactly.
 * - Ejiri to Kusanagi reached within 23 m of its anchor and then walked 250 m
 *   back the way it came.
 * - Mitsuke to Tenryugawa came back **17.64 km for a 8.95 km section**, having
 *   gone out 8.8 km and returned 8.4 km, ending 500 m from where it started.
 *
 * The cause was the same each time: the end marker sitting somewhere the router
 * had to return to. None of it is visible in point count or mean spacing, which
 * are the numbers a person naturally looks at, and all of it is obvious in one
 * division or one pass over the points.
 */
import { haversineKm } from './geo';
import type { Position } from './geo';

/**
 * Two points closer than this, with real line between them, are the same place
 * visited twice.
 */
export const REVISIT_M = 40;

/** How much line has to separate them before it counts as a detour rather than a bend. */
export const REVISIT_MIN_LINE_M = 400;

/**
 * Path length over straight-line distance between the endpoints.
 *
 * A winding section of old road through a post town runs about 2. The
 * out-and-back Mitsuke file ran 35, because it finished where it began.
 */
export const SINUOSITY_SUSPECT = 4;

export interface TraceCheck {
  lengthKm: number;
  pointCount: number;
  meanSpacingM: number;
  maxStepM: number;
  /** Path length over the straight line between first and last point. */
  sinuosity: number;
  /** The longest stretch of line that returns to within REVISIT_M of itself. */
  revisitM: number | null;
  /** Index range of that stretch, for pointing at it. */
  revisitAt: [number, number] | null;
  problems: string[];
}

export function checkTrace(positions: readonly Position[]): TraceCheck {
  const n = positions.length;
  if (n < 2) {
    return {
      lengthKm: 0,
      pointCount: n,
      meanSpacingM: 0,
      maxStepM: 0,
      sinuosity: 0,
      revisitM: null,
      revisitAt: null,
      problems: ['There are not enough points here to be a route.'],
    };
  }

  let lengthKm = 0;
  let maxStepM = 0;
  const cum: number[] = [0];
  for (let i = 1; i < n; i++) {
    const d = haversineKm(positions[i - 1]!, positions[i]!);
    lengthKm += d;
    cum.push(lengthKm);
    maxStepM = Math.max(maxStepM, d * 1000);
  }

  const straightKm = haversineKm(positions[0]!, positions[n - 1]!);
  const sinuosity = straightKm > 0 ? lengthKm / straightKm : Infinity;

  // Longest stretch that comes back to where it was. Sampling the outer loop
  // keeps this cheap on a few thousand points while still catching anything
  // long enough to matter — a detour worth reporting spans many points.
  let revisitM: number | null = null;
  let revisitAt: [number, number] | null = null;
  const step = Math.max(1, Math.floor(n / 400));
  for (let i = 0; i < n; i += step) {
    for (let j = n - 1; j > i + 4; j -= step) {
      const betweenM = (cum[j]! - cum[i]!) * 1000;
      if (betweenM <= (revisitM ?? REVISIT_MIN_LINE_M)) break;
      if (haversineKm(positions[i]!, positions[j]!) * 1000 <= REVISIT_M) {
        revisitM = betweenM;
        revisitAt = [i, j];
        break;
      }
    }
  }

  const problems: string[] = [];
  if (revisitM !== null && revisitAt) {
    problems.push(
      `The line returns to a point it already visited: ${(revisitM / 1000).toFixed(2)} km of route between points ${revisitAt[0]} and ${revisitAt[1]}, which are less than ${REVISIT_M} m apart. That is a detour around nothing — usually the end marker left somewhere the router had to come back to.`,
    );
  }
  if (sinuosity > SINUOSITY_SUSPECT) {
    problems.push(
      `This finishes close to where it starts: ${lengthKm.toFixed(2)} km of line across ${straightKm.toFixed(2)} km of ground. Check it is not an out-and-back.`,
    );
  }

  return {
    lengthKm,
    pointCount: n,
    meanSpacingM: (lengthKm * 1000) / (n - 1),
    maxStepM,
    sinuosity,
    revisitM,
    revisitAt,
    problems,
  };
}
