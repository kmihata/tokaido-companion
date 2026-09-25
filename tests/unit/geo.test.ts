import { describe, expect, it } from 'vitest';
import {
  bbox,
  cumulativeKm,
  haversineKm,
  kmToMiles,
  lineLengthKm,
  milesToKm,
  nearestPointOnLine,
} from '../../src/lib/geo';
import type { Position } from '../../src/lib/geo';

const NIHONBASHI: Position = [139.7743, 35.6841];
const KAWASAKI: Position = [139.7029, 35.5308];
const KYOTO: Position = [135.7727, 35.0093];

describe('haversineKm', () => {
  it('is zero for a point against itself', () => {
    expect(haversineKm(NIHONBASHI, NIHONBASHI)).toBe(0);
  });

  it('is symmetric', () => {
    expect(haversineKm(NIHONBASHI, KAWASAKI)).toBeCloseTo(haversineKm(KAWASAKI, NIHONBASHI), 9);
  });

  it('matches a known short distance', () => {
    // Nihonbashi to Kawasaki is about 18 km as the crow flies; the historical
    // post-station distance along the road is 17.7 km, so a straight line must
    // come out slightly under that.
    const d = haversineKm(NIHONBASHI, KAWASAKI);
    expect(d).toBeGreaterThan(16);
    expect(d).toBeLessThan(19);
  });

  it('matches a known long distance', () => {
    // Tokyo to Kyoto straight line is about 365 km, well under the 495 km road.
    const d = haversineKm(NIHONBASHI, KYOTO);
    expect(d).toBeGreaterThan(355);
    expect(d).toBeLessThan(375);
  });

  it('gives one degree of latitude as about 111 km', () => {
    expect(haversineKm([0, 0], [0, 1])).toBeCloseTo(111.19, 1);
  });
});

describe('lineLengthKm and cumulativeKm', () => {
  const line: Position[] = [NIHONBASHI, KAWASAKI, KYOTO];

  it('sums the segments', () => {
    const expected = haversineKm(NIHONBASHI, KAWASAKI) + haversineKm(KAWASAKI, KYOTO);
    expect(lineLengthKm(line)).toBeCloseTo(expected, 9);
  });

  it('returns zero for a degenerate line', () => {
    expect(lineLengthKm([])).toBe(0);
    expect(lineLengthKm([NIHONBASHI])).toBe(0);
  });

  it('produces a cumulative array starting at zero and ending at the total', () => {
    const cum = cumulativeKm(line);
    expect(cum).toHaveLength(3);
    expect(cum[0]).toBe(0);
    expect(cum[2]).toBeCloseTo(lineLengthKm(line), 9);
    expect(cum[1]!).toBeLessThan(cum[2]!);
  });
});

describe('nearestPointOnLine', () => {
  const line: Position[] = [
    [139.0, 35.0],
    [139.0, 36.0],
  ];

  it('returns null for an empty line', () => {
    expect(nearestPointOnLine([], NIHONBASHI)).toBeNull();
  });

  it('snaps a point beside the line onto it', () => {
    const r = nearestPointOnLine(line, [139.05, 35.5]);
    expect(r).not.toBeNull();
    expect(r!.point[1]).toBeCloseTo(35.5, 4);
    expect(r!.offRouteKm).toBeGreaterThan(0);
    expect(r!.offRouteKm).toBeLessThan(6);
  });

  it('clamps to an endpoint for a point beyond the line', () => {
    const r = nearestPointOnLine(line, [139.0, 37.0]);
    expect(r!.point[1]).toBeCloseTo(36.0, 6);
    expect(r!.alongKm).toBeCloseTo(lineLengthKm(line), 3);
  });

  it('reports zero off-route distance for a point on the line', () => {
    const r = nearestPointOnLine(line, [139.0, 35.5]);
    expect(r!.offRouteKm).toBeLessThan(0.001);
  });
});

describe('bbox', () => {
  it('returns null for no positions', () => {
    expect(bbox([])).toBeNull();
  });

  it('bounds the inputs', () => {
    expect(bbox([NIHONBASHI, KYOTO])).toEqual([135.7727, 35.0093, 139.7743, 35.6841]);
  });
});

describe('unit conversion', () => {
  it('round-trips', () => {
    expect(milesToKm(kmToMiles(42.195))).toBeCloseTo(42.195, 9);
  });

  it('matches the schedule draft: 495.5 km is about 307.9 miles', () => {
    expect(kmToMiles(495.5)).toBeCloseTo(307.9, 1);
  });
});
