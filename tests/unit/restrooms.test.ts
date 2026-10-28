import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildPlanningLine } from '../../src/lib/planningLine';
import { lineLengthKm } from '../../src/lib/geo';
import type { Position } from '../../src/lib/geo';
import type { RouteStretch } from '../../src/data/load';
import { collapse, nextRestrooms, placeOnLine } from '../../src/lib/restrooms';
import type { PlacedRestroom, Restroom, RestroomsFile } from '../../src/lib/restrooms';

const KM_PER_DEG_LAT = 111.195;
function northLine(fromLat: number, toLat: number, steps: number): Position[] {
  const out: Position[] = [];
  for (let i = 0; i <= steps; i++) out.push([139, fromLat + ((toLat - fromLat) * i) / steps]);
  return out;
}
const stretch = (positions: Position[]): RouteStretch => ({
  id: 's',
  title: 's',
  memberIds: ['s'],
  positions,
  lengthKm: lineLengthKm(positions),
  cumulativeKm: [],
});
const line = buildPlanningLine([stretch(northLine(35.0, 35.5, 500))]);
const lonPerKm = 1 / (KM_PER_DEG_LAT * Math.cos((35 * Math.PI) / 180));

function r(id: string, km: number, tier: number, eastKm = 0): Restroom {
  const kinds = ['roadside', 'roadside', 'station', 'park', 'public', 'store'] as const;
  return {
    id,
    lat: 35.0 + km / KM_PER_DEG_LAT,
    lon: 139 + eastKm * lonPerKm,
    tier,
    kind: kinds[tier]!,
    name: id,
    mapped: true,
    notes: [],
  };
}

describe('placeOnLine', () => {
  it('measures each restroom along the line and sorts by it', () => {
    const placed = placeOnLine(line, [r('b', 20, 2), r('a', 5, 3, 0.2)]);
    expect(placed.map((p) => p.id)).toEqual(['a', 'b']);
    expect(placed[0]!.alongKm).toBeCloseTo(5, 1);
    expect(placed[0]!.offRouteKm).toBeCloseTo(0.2, 1);
  });

  it('drops anything too far off the line', () => {
    expect(placeOnLine(line, [r('far', 10, 2, 1.0)])).toHaveLength(0);
  });
});

describe('nextRestrooms', () => {
  const placed = placeOnLine(line, [
    r('behind', 2, 2),
    r('s1', 6, 3),
    r('s2', 9, 1),
    r('store', 7, 5),
    r('s3', 21, 2),
    r('s4', 30, 4),
  ]);

  it('lists the next three public ones ahead with the gap after each', () => {
    const n = nextRestrooms(placed, 5);
    expect(n.ahead.map((a) => a.restroom.id)).toEqual(['s1', 's2', 's3']);
    expect(n.ahead[0]!.aheadKm).toBeCloseTo(1, 1);
    expect(n.ahead[0]!.gapAfterKm).toBeCloseTo(3, 1);
    expect(n.ahead[1]!.gapAfterKm).toBeCloseTo(12, 1);
    expect(n.ahead[2]!.gapAfterKm).toBeCloseTo(9, 1);
    expect(n.bestTier).toBe(1);
  });

  it('keeps stores out of the list but offers the nearest one as a fallback', () => {
    const n = nextRestrooms(placed, 5);
    expect(n.ahead.some((a) => a.restroom.kind === 'store')).toBe(false);
    expect(n.store?.restroom.id).toBe('store');
    expect(n.store?.aheadKm).toBeCloseTo(2, 1);
  });

  it('points to a roadside station beyond the first three', () => {
    const more = placeOnLine(line, [r('a', 6, 3), r('b', 7, 3), r('c', 8, 3), r('rs', 15, 1), r('rs2', 40, 1)]);
    const n = nextRestrooms(more, 5);
    expect(n.roadside?.restroom.id).toBe('rs');
    expect(n.roadside?.aheadKm).toBeCloseTo(10, 1);
    // Too far ahead to be a plan.
    expect(nextRestrooms(more, 16).roadside).toBeNull();
  });

  it('says there is nothing after the last one', () => {
    const n = nextRestrooms(placed, 25);
    expect(n.ahead.map((a) => a.restroom.id)).toEqual(['s4']);
    expect(n.ahead[0]!.gapAfterKm).toBeNull();
    expect(n.store).toBeNull();
  });

  it('counts a restroom just behind as here, to absorb GPS noise', () => {
    const n = nextRestrooms(placed, 6.05);
    expect(n.ahead[0]!.restroom.id).toBe('s1');
    expect(n.ahead[0]!.aheadKm).toBe(0);
  });
});

describe('collapse', () => {
  const p = (id: string, alongKm: number, tier: number, offRouteKm = 0): PlacedRestroom => ({
    ...r(id, alongKm, tier),
    alongKm,
    offRouteKm,
  });

  it('merges fixtures at one stop and keeps the best tier', () => {
    const out = collapse([p('park', 10, 3), p('station', 10.05, 2), p('next', 11, 4)]);
    expect(out.map((x) => x.id)).toEqual(['station', 'next']);
  });
});

describe('shipped restrooms.json', () => {
  const file = JSON.parse(readFileSync('public/data/restrooms.json', 'utf8')) as RestroomsFile;

  it('carries the OpenStreetMap attribution', () => {
    expect(file.source).toMatch(/OpenStreetMap/);
    expect(file.source).toMatch(/ODbL/);
  });

  it('has valid tiers, kinds and coordinates in Japan', () => {
    expect(file.restrooms.length).toBeGreaterThan(100);
    for (const x of file.restrooms) {
      expect(x.tier).toBeGreaterThanOrEqual(1);
      expect(x.tier).toBeLessThanOrEqual(5);
      expect(['roadside', 'station', 'park', 'shrine', 'public', 'store']).toContain(x.kind);
      expect(x.lat).toBeGreaterThan(34);
      expect(x.lat).toBeLessThan(36);
      expect(x.lon).toBeGreaterThan(135);
      expect(x.lon).toBeLessThan(138);
    }
  });
});
