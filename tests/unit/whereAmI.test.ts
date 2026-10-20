import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildPlanningLine } from '../../src/lib/planningLine';
import { lineLengthKm } from '../../src/lib/geo';
import type { Position } from '../../src/lib/geo';
import type { RouteStretch } from '../../src/data/load';
import { buildStretches } from '../../src/data/load';
import { AnchorsFileSchema, RouteFileSchema, RouteMetaSchema } from '../../src/data/schemas';
import {
  FAR_FROM_SECTION_KM,
  locateOnLeg,
  measureWhereAmI,
  paceSoFar,
  shouldReplaceFirstTap,
} from '../../src/lib/whereAmI';
import { KM_PER_MILE } from '../../src/lib/pace';

/** Due north from 35.0N along 139E; 0.01 degree of latitude is about 1.11 km. */
function northLine(fromLat: number, toLat: number, steps: number): Position[] {
  const out: Position[] = [];
  for (let i = 0; i <= steps; i++) out.push([139, fromLat + ((toLat - fromLat) * i) / steps]);
  return out;
}
const KM_PER_DEG_LAT = 111.195;

const stretch = (positions: Position[]): RouteStretch => ({
  id: 's',
  title: 's',
  memberIds: ['s'],
  positions,
  lengthKm: lineLengthKm(positions),
  cumulativeKm: [],
});

// A 55.6 km line; "today" runs from 10 km to 30 km along it.
const line = buildPlanningLine([stretch(northLine(35.0, 35.5, 500))]);
const leg = { startAlongKm: 10, endAlongKm: 30 };
const at = (km: number, eastKm = 0): Position => [
  139 + eastKm / (KM_PER_DEG_LAT * Math.cos((35 * Math.PI) / 180)),
  35.0 + km / KM_PER_DEG_LAT,
];

describe('locateOnLeg', () => {
  it('measures a point on the section along the line', () => {
    const r = locateOnLeg(line, leg, at(18))!;
    expect(r.status).toBe('on-section');
    expect(r.alongKm).toBeCloseTo(18, 1);
    expect(r.offRouteKm).toBeLessThan(0.01);
  });

  it('clamps before the start and says so', () => {
    const r = locateOnLeg(line, leg, at(9.2))!;
    expect(r.status).toBe('before-start');
    expect(r.alongKm).toBe(10);
  });

  it('clamps past the finish and says so', () => {
    const r = locateOnLeg(line, leg, at(31))!;
    expect(r.status).toBe('past-finish');
    expect(r.alongKm).toBe(30);
  });

  it('flags a fix that is not credibly on today’s section', () => {
    const r = locateOnLeg(line, leg, at(18, FAR_FROM_SECTION_KM + 0.5))!;
    expect(r.status).toBe('far-from-section');
  });

  it('never matches another day’s part of the line', () => {
    // Standing on the line at 45 km, well beyond today's end plus margin.
    const r = locateOnLeg(line, leg, at(45))!;
    expect(r.alongKm).toBe(30);
    expect(r.status).toBe('far-from-section');
  });
});

describe('measureWhereAmI', () => {
  it('gives distance left and walking time at 3 mph', () => {
    const r = measureWhereAmI(line, leg, at(18))!;
    expect(r.left.remainingKm).toBeCloseTo(12, 1);
    const expectedMin = (12 / (3 * KM_PER_MILE)) * 60;
    expect(r.left.movingMinutes).toBeCloseTo(expectedMin, 0);
    expect(r.walkedKm).toBeCloseTo(8, 1);
    expect(r.showOffRoute).toBe(false);
  });

  it('shows the off-route distance only when it is more than noise', () => {
    expect(measureWhereAmI(line, leg, at(18, 0.05))!.showOffRoute).toBe(false);
    expect(measureWhereAmI(line, leg, at(18, 0.4))!.showOffRoute).toBe(true);
  });

  it('reads the whole day before the start', () => {
    const r = measureWhereAmI(line, leg, at(9.5))!;
    expect(r.left.remainingKm).toBeCloseTo(20, 6);
  });
});

describe('paceSoFar', () => {
  const t0 = Date.UTC(2026, 9, 20, 22, 0); // 07:00 JST
  it('includes stops: distance over clock time', () => {
    const p = paceSoFar(
      { dayId: 'd', at: t0, alongKm: 10 },
      { dayId: 'd', at: t0 + 3 * 3_600_000, alongKm: 22 },
    )!;
    expect(p.kmh).toBeCloseTo(4, 6);
    expect(p.mph).toBeCloseTo(4 / KM_PER_MILE, 6);
  });

  it('waits for enough distance and time', () => {
    expect(paceSoFar({ dayId: 'd', at: t0, alongKm: 10 }, { dayId: 'd', at: t0 + 5 * 60_000, alongKm: 10.5 })).toBeNull();
    expect(paceSoFar({ dayId: 'd', at: t0, alongKm: 10 }, { dayId: 'd', at: t0 + 60 * 60_000, alongKm: 10.1 })).toBeNull();
  });

  it('never mixes days', () => {
    expect(paceSoFar({ dayId: 'a', at: t0, alongKm: 10 }, { dayId: 'b', at: t0 + 3_600_000, alongKm: 14 })).toBeNull();
    expect(paceSoFar(null, { dayId: 'b', at: t0, alongKm: 14 })).toBeNull();
  });
});

describe('shouldReplaceFirstTap', () => {
  it('keeps the first credible tap of the day', () => {
    expect(shouldReplaceFirstTap(null, 'd', 'on-section')).toBe(true);
    expect(shouldReplaceFirstTap({ dayId: 'd', at: 0, alongKm: 1 }, 'd', 'on-section')).toBe(false);
    expect(shouldReplaceFirstTap({ dayId: 'old', at: 0, alongKm: 1 }, 'd', 'before-start')).toBe(true);
  });
  it('ignores a tap far from today’s section', () => {
    expect(shouldReplaceFirstTap(null, 'd', 'far-from-section')).toBe(false);
  });
});

describe('on the real route', () => {
  const j = (f: string) => JSON.parse(readFileSync(`public/data/${f}`, 'utf8'));
  const { stretches } = buildStretches(
    RouteMetaSchema.parse(j('route-meta.json')),
    RouteFileSchema.parse(j('route.geojson')).features,
    AnchorsFileSchema.parse(j('anchors.geojson')).features,
  );
  const real = buildPlanningLine(stretches);

  it('is one continuous line, so along-distances compare directly', () => {
    // If a break is ever introduced, Decide's per-stretch alongKm and the
    // planning-line day ends stop sharing an axis. This card uses the planning
    // line throughout and is unaffected, but the assumption is worth pinning.
    expect(stretches).toHaveLength(1);
  });

  it('a point taken from the line measures back to itself', () => {
    const km = 12.345;
    const i = real.cumulativeKm.findIndex((c) => c >= km);
    const p = real.positions[i]!;
    const r = locateOnLeg(real, { startAlongKm: 0, endAlongKm: 25 }, p)!;
    expect(r.status).toBe('on-section');
    expect(Math.abs(r.alongKm - real.cumulativeKm[i]!)).toBeLessThan(0.05);
  });
});
