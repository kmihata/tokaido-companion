import { describe, expect, it } from 'vitest';
import {
  buildPlanningLine,
  crossesBreak,
  indexAt,
  positionAt,
  sliceLine,
} from '../../src/lib/planningLine';
import { haversineKm, lineLengthKm } from '../../src/lib/geo';
import type { Position } from '../../src/lib/geo';
import type { RouteStretch } from '../../src/data/load';

/** A due-north line from 35.0N, ~11.1 km per 0.1 degree. */
function northLine(fromLat: number, toLat: number, steps: number): Position[] {
  const out: Position[] = [];
  for (let i = 0; i <= steps; i++) {
    out.push([139, fromLat + ((toLat - fromLat) * i) / steps]);
  }
  return out;
}

const stretch = (id: string, positions: Position[]): RouteStretch => ({
  id,
  title: id,
  memberIds: [id],
  positions,
  lengthKm: lineLengthKm(positions),
  cumulativeKm: [],
});

describe('buildPlanningLine', () => {
  const a = stretch('a', northLine(35.0, 35.1, 10));
  const b = stretch('b', northLine(36.0, 36.1, 10));

  it('measures a single stretch', () => {
    const line = buildPlanningLine([a]);
    expect(line.positions).toHaveLength(11);
    expect(line.lengthKm).toBeCloseTo(11.1, 0);
    expect(line.cumulativeKm[0]).toBe(0);
    expect(line.cumulativeKm.at(-1)).toBeCloseTo(line.lengthKm, 9);
    expect(line.breaks).toEqual([]);
  });

  it('does not accumulate distance across a break', () => {
    const line = buildPlanningLine([a, b], [{ pathId: 'gap', title: 'A gap' }]);
    // The 100 km jump between the two stretches must NOT be counted.
    expect(line.lengthKm).toBeCloseTo(a.lengthKm + b.lengthKm, 6);
    expect(haversineKm(a.positions.at(-1)!, b.positions[0]!)).toBeGreaterThan(90);
  });

  it('records where the break falls on the distance axis', () => {
    const line = buildPlanningLine([a, b], [{ pathId: 'gap', title: 'A gap' }]);
    expect(line.breaks).toHaveLength(1);
    expect(line.breaks[0]!.alongKm).toBeCloseTo(a.lengthKm, 6);
    expect(line.breaks[0]!.title).toBe('A gap');
  });

  it('handles an empty input', () => {
    const line = buildPlanningLine([]);
    expect(line.lengthKm).toBe(0);
    expect(positionAt(line, 5)).toBeNull();
  });
});

describe('positionAt and indexAt', () => {
  const line = buildPlanningLine([stretch('a', northLine(35.0, 35.1, 10))]);

  it('clamps to the ends', () => {
    expect(positionAt(line, -5)).toEqual(line.positions[0]);
    expect(positionAt(line, 9999)).toEqual(line.positions.at(-1));
  });

  it('interpolates between vertices', () => {
    const half = positionAt(line, line.lengthKm / 2)!;
    expect(half[1]).toBeCloseTo(35.05, 4);
  });

  it('finds the vertex at or before a distance', () => {
    expect(indexAt(line, 0)).toBe(0);
    expect(indexAt(line, line.lengthKm)).toBe(line.positions.length - 1);
    expect(line.cumulativeKm[indexAt(line, 5)]!).toBeLessThanOrEqual(5);
    expect(line.cumulativeKm[indexAt(line, 5) + 1]!).toBeGreaterThan(5);
  });
});

describe('sliceLine', () => {
  const line = buildPlanningLine([stretch('a', northLine(35.0, 35.1, 10))]);

  it('measures the slice as the distance requested, not the nearest vertex', () => {
    const s = sliceLine(line, 2.5, 7.5);
    expect(lineLengthKm(s)).toBeCloseTo(5, 2);
  });

  it('starts and ends exactly where told', () => {
    const s = sliceLine(line, 3, 8);
    expect(haversineKm(s[0]!, positionAt(line, 3)!)).toBeLessThan(0.001);
    expect(haversineKm(s.at(-1)!, positionAt(line, 8)!)).toBeLessThan(0.001);
  });

  it('returns the whole line for the full range', () => {
    expect(lineLengthKm(sliceLine(line, 0, line.lengthKm))).toBeCloseTo(line.lengthKm, 6);
  });

  it('tolerates reversed arguments and empty ranges', () => {
    expect(lineLengthKm(sliceLine(line, 8, 3))).toBeCloseTo(5, 2);
    expect(sliceLine(line, 5, 5)).toEqual([]);
  });

  it('never emits duplicate consecutive points', () => {
    const s = sliceLine(line, 0, line.lengthKm);
    for (let i = 1; i < s.length; i++) {
      expect(s[i]).not.toEqual(s[i - 1]);
    }
  });
});

describe('crossesBreak', () => {
  const a = stretch('a', northLine(35.0, 35.1, 10));
  const b = stretch('b', northLine(36.0, 36.1, 10));
  const line = buildPlanningLine([a, b], [{ pathId: 'gap', title: 'A gap' }]);

  it('detects a break inside the range', () => {
    expect(crossesBreak(line, 0, line.lengthKm)?.pathId).toBe('gap');
  });

  it('ignores a break outside the range', () => {
    expect(crossesBreak(line, 0, a.lengthKm - 1)).toBeNull();
    expect(crossesBreak(line, a.lengthKm + 1, line.lengthKm)).toBeNull();
  });

  it('does not count a break exactly at a boundary', () => {
    expect(crossesBreak(line, 0, a.lengthKm)).toBeNull();
  });
});
