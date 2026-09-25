/**
 * The planning line: the active route flattened into one measurable space.
 *
 * Day boundaries, continuation endpoints and annotations are all *positions
 * along* the route rather than separate geometry, so they need a single
 * distance axis to sit on. This module builds that axis from the stretches and
 * records where the breaks fall, so nothing can silently plan a day across a
 * gap the route does not have.
 *
 * Pure. Unit-tested in tests/unit/planningLine.test.ts.
 */
import type { RouteStretch } from '../data/load';
import { haversineKm } from './geo';
import type { Position } from './geo';

export interface LineBreak {
  /** Distance along the planning line where the break falls, km. */
  alongKm: number;
  title: string;
  pathId: string;
}

export interface PlanningLine {
  positions: Position[];
  /** Cumulative distance at each position, km. Same length as `positions`. */
  cumulativeKm: number[];
  lengthKm: number;
  breaks: LineBreak[];
}

/**
 * Concatenate the stretches into one distance axis.
 *
 * Stretches are joined end to end WITHOUT any connecting geometry — the jump
 * between them is a break, recorded rather than drawn. Distance does not
 * accumulate across a break: the axis simply continues, and `breaks` says
 * where the discontinuity is so callers can refuse to plan across it.
 */
export function buildPlanningLine(
  stretches: readonly RouteStretch[],
  breakInfo: readonly { pathId: string; title: string }[] = [],
): PlanningLine {
  const positions: Position[] = [];
  const cumulativeKm: number[] = [];
  const breaks: LineBreak[] = [];
  let total = 0;

  stretches.forEach((s, i) => {
    if (i > 0) {
      const info = breakInfo[i - 1];
      breaks.push({
        alongKm: total,
        title: info?.title ?? 'Break in the route',
        pathId: info?.pathId ?? `break-${i}`,
      });
    }
    s.positions.forEach((p, j) => {
      if (j > 0) total += haversineKm(s.positions[j - 1]!, p);
      positions.push(p);
      cumulativeKm.push(total);
    });
  });

  return { positions, cumulativeKm, lengthKm: total, breaks };
}

/** Interpolate the coordinate at `alongKm`. Clamped to the ends. */
export function positionAt(line: PlanningLine, alongKm: number): Position | null {
  const { positions, cumulativeKm } = line;
  if (positions.length === 0) return null;
  if (alongKm <= 0) return positions[0]!;
  if (alongKm >= line.lengthKm) return positions[positions.length - 1]!;

  const i = indexAt(line, alongKm);
  const a = positions[i]!;
  const b = positions[i + 1];
  if (!b) return a;
  const span = cumulativeKm[i + 1]! - cumulativeKm[i]!;
  if (span <= 0) return a;
  const t = (alongKm - cumulativeKm[i]!) / span;
  return [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];
}

/** Index of the vertex at or before `alongKm`. Binary search. */
export function indexAt(line: PlanningLine, alongKm: number): number {
  const c = line.cumulativeKm;
  let lo = 0;
  let hi = c.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (c[mid]! <= alongKm) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/**
 * Extract the geometry between two distances, interpolating at both ends so a
 * day starts and finishes exactly where it was told to, not at the nearest
 * source vertex.
 */
export function sliceLine(line: PlanningLine, fromKm: number, toKm: number): Position[] {
  const lo = Math.max(0, Math.min(fromKm, toKm));
  const hi = Math.min(line.lengthKm, Math.max(fromKm, toKm));
  if (line.positions.length === 0 || hi - lo <= 0) return [];

  const startPos = positionAt(line, lo);
  const endPos = positionAt(line, hi);
  if (!startPos || !endPos) return [];

  const out: Position[] = [startPos];
  const startIdx = indexAt(line, lo);
  const endIdx = indexAt(line, hi);
  for (let i = startIdx + 1; i <= endIdx; i++) {
    const p = line.positions[i]!;
    const prev = out[out.length - 1]!;
    if (p[0] !== prev[0] || p[1] !== prev[1]) out.push(p);
  }
  const last = out[out.length - 1]!;
  if (endPos[0] !== last[0] || endPos[1] !== last[1]) out.push(endPos);
  return out;
}

/** True when a break falls strictly between two distances. */
export function crossesBreak(line: PlanningLine, fromKm: number, toKm: number): LineBreak | null {
  const lo = Math.min(fromKm, toKm);
  const hi = Math.max(fromKm, toKm);
  return line.breaks.find((b) => b.alongKm > lo && b.alongKm < hi) ?? null;
}
