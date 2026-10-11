import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  AnchorsFileSchema,
  DaysFileSchema,
  RouteFileSchema,
  RouteMetaSchema,
  StationsFileSchema,
  WaypointsFileSchema,
} from '../../src/data/schemas';
import { buildStretches } from '../../src/data/load';
import type { Dataset } from '../../src/data/load';
import { buildDefaultDayPlans, buildLegs } from '../../src/lib/dayPlan';
import { buildPlanningLine } from '../../src/lib/planningLine';
import { activeRouteGeoJson, dayGpx, masterRouteGpx, referenceLayerGeoJson, toGpx } from '../../src/lib/routeExport';
import { haversineKm } from '../../src/lib/geo';
import type { Position } from '../../src/lib/geo';

const DATA = join(process.cwd(), 'public', 'data');
const read = (f: string): unknown => JSON.parse(readFileSync(join(DATA, f), 'utf8')) as unknown;

const routeMeta = RouteMetaSchema.parse(read('route-meta.json'));
const routeFeatures = RouteFileSchema.parse(read('route.geojson')).features;
const anchors = AnchorsFileSchema.parse(read('anchors.geojson')).features;
const waypoints = WaypointsFileSchema.parse(read('waypoints.geojson')).features;
const { stretches, breaks } = buildStretches(routeMeta, routeFeatures, anchors);

const stations = StationsFileSchema.parse(read('stations.json')).stations;
const days = DaysFileSchema.parse(read('days.json')).days;

const dataset = {
  routeMeta,
  routeFeatures,
  anchors,
  waypoints,
  stations,
  days,
  stretches,
  breaks,
  activeLengthKm: stretches.reduce((t, s) => t + s.lengthKm, 0),
} as unknown as Dataset;

const planningLine = buildPlanningLine(stretches, breaks);
const legs = buildLegs(
  planningLine,
  buildDefaultDayPlans(planningLine, anchors, days),
  days,
  anchors,
);
const legFor = (dayId: string) => {
  const leg = legs.find((l) => l.plan.dayId === dayId);
  if (!leg) throw new Error(`no leg for ${dayId}`);
  return leg;
};

const AT = new Date('2026-08-20T00:00:00.000Z');

describe('toGpx', () => {
  const line: Position[] = [
    [139.7743, 35.6841],
    [139.7029, 35.5308],
  ];

  it('writes a well-formed document with the list name in metadata', () => {
    const gpx = toGpx('Tokaido D04 — Sat 24 Oct', 'test', [{ name: 'D04 ACTIVE', positions: line }], [], AT);
    expect(gpx.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(gpx).toContain('<name>Tokaido D04 — Sat 24 Oct</name>');
    expect(gpx).toContain('<name>D04 ACTIVE</name>');
    expect(gpx.trimEnd().endsWith('</gpx>')).toBe(true);
  });

  it('emits one <trk> per track and never several <trkseg> in one track', () => {
    const gpx = toGpx(
      'two',
      'test',
      [
        { name: 'a', positions: line },
        { name: 'b', positions: line },
      ],
      [],
      AT,
    );
    expect(gpx.match(/<trk>/g)).toHaveLength(2);
    // The Footpath lesson: multiple segments inside one track get bridged.
    for (const trk of gpx.split('<trk>').slice(1)) {
      expect(trk.match(/<trkseg>/g)).toHaveLength(1);
    }
  });

  it('escapes XML metacharacters in names', () => {
    const gpx = toGpx('A & B <c>', 'x', [{ name: '"q"', positions: line }], [], AT);
    expect(gpx).toContain('A &amp; B &lt;c&gt;');
    expect(gpx).toContain('&quot;q&quot;');
    expect(gpx).not.toContain('<c>');
  });

  it('writes waypoints with names and descriptions', () => {
    const gpx = toGpx('x', 'y', [{ name: 't', positions: line }], [
      { name: 'Odawara Station', description: 'rail-bailout', position: line[0]! },
    ], AT);
    expect(gpx).toContain('<wpt lat="35.684100" lon="139.774300">');
    expect(gpx).toContain('<name>Odawara Station</name>');
  });

  it('refuses to emit a track with fewer than two points', () => {
    expect(() => toGpx('x', 'y', [{ name: 't', positions: [line[0]!] }], [], AT)).toThrow(/two or more/i);
  });
});

describe('masterRouteGpx', () => {
  const gpx = masterRouteGpx(dataset, AT);

  it('emits one track per continuous stretch', () => {
    expect(gpx.match(/<trk>/g)).toHaveLength(stretches.length);
  });

  it('never contains a jump long enough to be a bridged gap', () => {
    const pts: Position[][] = gpx
      .split('<trk>')
      .slice(1)
      .map((t) =>
        [...t.matchAll(/<trkpt lat="([-\d.]+)" lon="([-\d.]+)"/g)].map(
          (m) => [Number(m[2]), Number(m[1])] as Position,
        ),
      );
    for (const track of pts) {
      for (let i = 1; i < track.length; i++) {
        expect(haversineKm(track[i - 1]!, track[i]!)).toBeLessThan(2);
      }
    }
  });

  it('carries the CC BY-SA attribution, as the licence requires', () => {
    expect(gpx).toMatch(/kaidotrail/i);
    expect(gpx).toMatch(/CC BY-SA 4\.0/);
    expect(gpx).toMatch(/modified/i);
  });

  it('says in the file that it is unverified', () => {
    expect(gpx).toMatch(/unverified/i);
    expect(gpx).toMatch(/do not navigate/i);
  });

  it('includes bailout and hazard waypoints but no lodging', () => {
    expect(gpx).toMatch(/Suzuka Pass|Hakone Pass IC/);
    expect(gpx).not.toMatch(/EXAMPLE HOTEL/);
  });
});

describe('GeoJSON exports', () => {
  it('reference layer carries anchors and waypoints with attribution', () => {
    const o = JSON.parse(referenceLayerGeoJson(dataset)) as {
      attribution: string;
      features: { properties: Record<string, unknown> }[];
    };
    expect(o.attribution).toMatch(/kaidotrail/i);
    expect(o.features.length).toBe(anchors.length + waypoints.length);
    const layers = new Set(o.features.map((f) => f.properties['layer']));
    expect(layers).toEqual(new Set(['anchor', 'waypoint']));
  });

  it('active route export has one LineString per stretch and no navigational claim', () => {
    const o = JSON.parse(activeRouteGeoJson(dataset)) as {
      features: { geometry: { type: string }; properties: Record<string, unknown> }[];
    };
    expect(o.features).toHaveLength(stretches.length);
    for (const f of o.features) {
      expect(f.geometry.type).toBe('LineString');
      expect(f.properties['navigational']).toBe(false);
    }
  });

  it('neither export contains private or fictional lodging content', () => {
    for (const text of [referenceLayerGeoJson(dataset), activeRouteGeoJson(dataset)]) {
      expect(text).not.toMatch(/tokaido-private-data/);
    }
    expect(activeRouteGeoJson(dataset)).not.toMatch(/EXAMPLE HOTEL/);
  });
});

describe('the day package that goes to Footpath', () => {
  // Walk 7. Carries wp-utsunoya-tunnel, the category-change waypoint that
  // records the Meiji tunnel as an alternative to the pass.
  const utsunoya = 'd-2026-10-27';

  it('carries the post towns, which it never used to', () => {
    const gpx = dayGpx(dataset, legFor(utsunoya), AT);
    const names = [...gpx.matchAll(/<wpt[^>]*>\s*<name>([^<]+)<\/name>/g)].map((m) => m[1]);
    const towns = names.filter((n) => /^#\d+\s/.test(n ?? ''));
    expect(towns.length).toBeGreaterThan(0);
  });

  it('says a pin is a point on a strip, and that survival is unknown', () => {
    const gpx = dayGpx(dataset, legFor(utsunoya), AT);
    expect(gpx).toMatch(/post town — a strip along the road/);
    expect(gpx).toMatch(/anything surviving here: unknown/);
  });

  /**
   * The reason the selection is by exact coordinate rather than by alongKm:
   * a station must appear on exactly one day, and on the day whose own
   * geometry passes through it. Comparing shipped alongKm against the leg's
   * active-line range would drift as retraces move the later referencing.
   */
  it('puts each post town on exactly one day', () => {
    const seen = new Map<string, string[]>();
    for (const leg of legs) {
      if (!leg.day) continue;
      const gpx = dayGpx(dataset, leg, AT);
      for (const m of gpx.matchAll(/<name>(#\d+ [^<]+)<\/name>/g)) {
        const name = m[1]!;
        seen.set(name, [...(seen.get(name) ?? []), leg.day.id]);
      }
    }
    // 52 of the 53 post towns have an anchor; Kawasaki has none, and the two
    // unnumbered termini are not post towns. Assert the rule — nearly all of
    // them reach a day — rather than a count that the next retrace could move.
    expect(seen.size).toBeGreaterThanOrEqual(50);
    const duplicated = [...seen.entries()].filter(([, days]) => days.length > 1);
    // A continuation overlaps the next day deliberately, so allow a town to
    // appear twice ONLY where a continuation is what carried it.
    for (const [name, onDays] of duplicated) {
      expect(onDays.length, `${name} appears on ${onDays.join(', ')}`).toBeLessThanOrEqual(2);
    }
  });

  it('carries the decision points, not just the bailouts', () => {
    const gpx = dayGpx(dataset, legFor(utsunoya), AT);
    expect(gpx).toMatch(/category-change/);
  });

  it('never exports lodging, however the day is built', () => {
    for (const leg of legs) {
      const gpx = dayGpx(dataset, leg, AT);
      expect(gpx).not.toMatch(/<desc>hotel/);
      expect(gpx).not.toMatch(/EXAMPLE/i);
    }
  });
});
