import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  AnchorsFileSchema,
  DaysFileSchema,
  RouteFileSchema,
  RouteMetaSchema,
  WaypointsFileSchema,
} from '../../src/data/schemas';
import { buildStretches } from '../../src/data/load';
import type { Dataset } from '../../src/data/load';
import { buildPlanningLine } from '../../src/lib/planningLine';
import { buildDefaultDayPlans, buildLegs } from '../../src/lib/dayPlan';
import { dayGpx, dayGpxFilename, daySummaryText } from '../../src/lib/routeExport';
import { haversineKm, lineLengthKm } from '../../src/lib/geo';
import type { Position } from '../../src/lib/geo';

const D = join(process.cwd(), 'public', 'data');
const read = (f: string): unknown => JSON.parse(readFileSync(join(D, f), 'utf8')) as unknown;

const routeMeta = RouteMetaSchema.parse(read('route-meta.json'));
const routeFeatures = RouteFileSchema.parse(read('route.geojson')).features;
const anchors = AnchorsFileSchema.parse(read('anchors.geojson')).features;
const waypoints = WaypointsFileSchema.parse(read('waypoints.geojson')).features;
const days = DaysFileSchema.parse(read('days.json')).days;

const { stretches, breaks } = buildStretches(routeMeta, routeFeatures, anchors);
const line = buildPlanningLine(stretches, breaks);
const defaults = buildDefaultDayPlans(line, anchors, days);

const dataset = {
  routeMeta,
  routeFeatures,
  anchors,
  waypoints,
  days,
  stretches,
  breaks,
  activeLengthKm: line.lengthKm,
} as unknown as Dataset;

const AT = new Date('2026-08-20T00:00:00.000Z');
const legs = buildLegs(line, defaults, days, anchors);
const hakone = legs.find((l) => l.plan.walkingDayNumber === 4)!;

function tracksOf(gpx: string): { name: string; points: Position[] }[] {
  return gpx
    .split('<trk>')
    .slice(1)
    .map((t) => ({
      name: /<name>(.*?)<\/name>/.exec(t)?.[1] ?? '',
      points: [...t.matchAll(/<trkpt lat="([-\d.]+)" lon="([-\d.]+)"/g)].map(
        (m) => [Number(m[2]), Number(m[1])] as Position,
      ),
    }));
}

describe('dayGpx', () => {
  const gpx = dayGpx(dataset, hakone, AT);

  it('names the list so Footpath groups the day together', () => {
    expect(gpx).toMatch(/<name>Tokaido D04 — Sat 24 Oct<\/name>/);
  });

  it('emits one track for the active route when there is no continuation', () => {
    const t = tracksOf(gpx);
    expect(t).toHaveLength(1);
    expect(t[0]!.name.startsWith('D04 ACTIVE')).toBe(true);
  });

  it('front-loads the discriminator, because list rows truncate', () => {
    for (const t of tracksOf(gpx)) {
      expect(t.name.slice(0, 12)).toMatch(/^D04 (ACTIVE|CONTINUE)/);
    }
  });

  it('exports geometry matching the planned distance', () => {
    expect(lineLengthKm(tracksOf(gpx)[0]!.points)).toBeCloseTo(hakone.distanceKm, 1);
  });

  it('contains no jump long enough to be a bridged gap', () => {
    for (const t of tracksOf(gpx)) {
      for (let i = 1; i < t.points.length; i++) {
        expect(haversineKm(t.points[i - 1]!, t.points[i]!)).toBeLessThan(2);
      }
    }
  });

  it('adds a second track when a continuation is set, overlapping the finish', () => {
    const withCont = buildLegs(
      line,
      defaults.map((p) => (p.walkingDayNumber === 4 ? { ...p, continueToAlongKm: p.endAlongKm + 9 } : p)),
      days,
      anchors,
    ).find((l) => l.plan.walkingDayNumber === 4)!;
    const t = tracksOf(dayGpx(dataset, withCont, AT));
    expect(t).toHaveLength(2);
    expect(t[1]!.name.startsWith('D04 CONTINUE')).toBe(true);
    // Starts before the planned finish so switching in the field is one tap.
    expect(lineLengthKm(t[1]!.points)).toBeCloseTo(12, 0);
  });

  it('carries the day s bailouts and hazards as waypoints', () => {
    expect(gpx).toMatch(/Hakone Pass IC/);
    expect(gpx).toMatch(/Odawara Station/);
  });

  it('omits elevation, because Footpath substitutes its own', () => {
    expect(gpx).not.toContain('<ele>');
    expect(gpx).toMatch(/Elevation intentionally omitted/i);
  });

  it('states that it is unverified, and attributes the source', () => {
    expect(gpx).toMatch(/Unverified/i);
    expect(gpx).toMatch(/kaidotrail/i);
  });

  it('names the file so it sorts by day and carries the date', () => {
    expect(dayGpxFilename(hakone)).toBe('Tokaido-D04-2026-10-24.gpx');
  });
});

describe('daySummaryText', () => {
  const text = daySummaryText(dataset, hakone);

  it('leads with the day and its measured distance', () => {
    expect(text).toMatch(/WALKING DAY 4 — 2026-10-24/);
    expect(text).toMatch(new RegExp(`Planned distance\\s+${hakone.distanceKm.toFixed(1)} km`));
  });

  it('shows the draft comparison', () => {
    // The draft figure is whatever `nominalDistanceKm` currently says, and that
    // moves whenever a stage endpoint moves — Walk 4's went 31.4 -> 15.5 km on
    // 2026-09-25 when the finish came back to the Lake Ashi shore. Naming the
    // number here pinned a planning decision inside an export test. What must
    // hold is that the draft is shown beside the measured distance and the two
    // are compared.
    const draft = dataset.days.find((d) => d.id === 'd-2026-10-24')!.nominalDistanceKm!;
    expect(text).toMatch(new RegExp(`Draft schedule\\s+${draft.toFixed(1)} km`));
    expect(text).toMatch(/Planned distance/);
  });

  it('carries the safety notes and the tired-day view', () => {
    expect(text).toMatch(/SAFETY/);
    expect(text).toMatch(/green paint/i);
    expect(text).toMatch(/TIRED-DAY VIEW/);
  });

  it('ends with the warning and the attribution', () => {
    expect(text).toMatch(/Unverified route/i);
    expect(text).toMatch(/kaidotrail/i);
  });

  it('contains no private or fictional lodging content', () => {
    expect(text).not.toMatch(/EXAMPLE HOTEL/);
  });
});
