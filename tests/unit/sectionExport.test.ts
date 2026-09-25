import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AnchorsFileSchema, RouteFileSchema, RouteMetaSchema, WaypointsFileSchema } from '../../src/data/schemas';
import { buildStretches } from '../../src/data/load';
import { buildPlanningLine } from '../../src/lib/planningLine';
import {
  anchorsAlongRoute,
  sectionFilename,
  sectionGeometry,
  sectionGpx,
  sectionStats,
  sectionsByCoarseness,
} from '../../src/lib/sectionExport';
import { makeUserPoint } from '../../src/lib/userPoints';
import { haversineKm, lineLengthKm } from '../../src/lib/geo';
import type { Position } from '../../src/lib/geo';

const D = join(process.cwd(), 'public', 'data');
const read = (f: string): unknown => JSON.parse(readFileSync(join(D, f), 'utf8')) as unknown;

const meta = RouteMetaSchema.parse(read('route-meta.json'));
const features = RouteFileSchema.parse(read('route.geojson')).features;
const anchors = AnchorsFileSchema.parse(read('anchors.geojson')).features;
const waypoints = WaypointsFileSchema.parse(read('waypoints.geojson')).features;
const { stretches, breaks } = buildStretches(meta, features, anchors);
const line = buildPlanningLine(stretches, breaks);

const byJa = (ja: string) => anchors.find((a) => a.properties.titleJa === ja)!;
const odawara = byJa('小田原宿');
const mishima = byJa('三島宿');
const AT = new Date('2026-08-22T00:00:00Z');

describe('anchorsAlongRoute', () => {
  const ordered = anchorsAlongRoute(line, anchors);

  it('returns anchors in route order', () => {
    for (let i = 1; i < ordered.length; i++) {
      expect(ordered[i]!.alongKm).toBeGreaterThanOrEqual(ordered[i - 1]!.alongKm);
    }
  });

  it('starts at Nihonbashi', () => {
    expect(ordered[0]!.anchor.properties.titleJa).toBe('日本橋');
    expect(ordered[0]!.alongKm).toBeCloseTo(0, 2);
  });

  it('leaves out anchors that are not on the active line', () => {
    // The Miya ferry landing sits on the spur the Saya variant skips.
    expect(ordered.some((o) => o.anchor.properties.titleJa === '七里の渡')).toBe(false);
  });
});

describe('sectionStats', () => {
  const s = sectionStats(line, anchors, odawara.properties.id, mishima.properties.id)!;

  it('measures the section between two anchors', () => {
    expect(s.fromTitle).toBe('Odawara-juku');
    expect(s.toTitle).toBe('Mishima-juku');
    expect(s.lengthKm).toBeGreaterThan(28);
    expect(s.lengthKm).toBeLessThan(35);
  });

  it('agrees with the geometry it would export', () => {
    const geom = sectionGeometry(line, anchors, odawara.properties.id, mishima.properties.id);
    expect(lineLengthKm(geom)).toBeCloseTo(s.lengthKm, 3);
    expect(geom).toHaveLength(s.pointCount);
  });

  it('reports spacing and worst gap consistently', () => {
    expect(s.meanSpacingM).toBeCloseTo((s.lengthKm * 1000) / (s.pointCount - 1), 6);
    expect(s.maxGapM).toBeGreaterThanOrEqual(s.meanSpacingM);
  });

  it('tolerates the ends being given in either order', () => {
    const reversed = sectionStats(line, anchors, mishima.properties.id, odawara.properties.id)!;
    expect(reversed.lengthKm).toBeCloseTo(s.lengthKm, 6);
    expect(reversed.fromKm).toBeCloseTo(s.fromKm, 6);
  });

  it('returns null for an unknown anchor', () => {
    expect(sectionStats(line, anchors, 'nope', mishima.properties.id)).toBeNull();
  });

  it('returns null for an anchor that is not on the active line', () => {
    expect(sectionStats(line, anchors, byJa('七里の渡').properties.id, mishima.properties.id)).toBeNull();
  });
});

describe('sectionsByCoarseness', () => {
  const list = sectionsByCoarseness(line, anchors);

  it('covers the adjacent pairs, sorted coarsest first', () => {
    expect(list.length).toBeGreaterThan(50);
    for (let i = 1; i < list.length; i++) {
      expect(list[i]!.meanSpacingM).toBeLessThanOrEqual(list[i - 1]!.meanSpacingM);
    }
  });

  it('skips pairs too close together to say anything about sampling', () => {
    for (const s of list) expect(s.lengthKm).toBeGreaterThanOrEqual(0.4);
  });

  it('ranks by mean spacing, worst first', () => {
    // Asserting which section is worst couples the test to whatever has been
    // retraced most recently: central Tokyo was the worst stretch on the route
    // until it was retraced and baked in, at which point this test failed for
    // the good reason that the data had improved. Assert the ordering, which is
    // the actual contract, and that a retraced section has left the top.
    const spacings = list.map((s) => s.meanSpacingM);
    expect(spacings).toEqual([...spacings].sort((a, b) => b - a));
    const top = list.slice(0, 5).map((s) => `${s.fromTitle} → ${s.toTitle}`).join(' | ');
    expect(top).not.toMatch(/Nihonbashi/);
  });
});

describe('sectionGpx', () => {
  const stats = sectionStats(line, anchors, odawara.properties.id, mishima.properties.id)!;
  const gpx = sectionGpx(line, anchors, waypoints, stats, [], 2, AT);

  it('emits exactly one track — this is a section, not a route collection', () => {
    expect(gpx.match(/<trk>/g)).toHaveLength(1);
    expect(gpx.match(/<trkseg>/g)).toHaveLength(1);
  });

  it('exports the section geometry and nothing beyond it', () => {
    const pts = [...gpx.matchAll(/<trkpt lat="([-\d.]+)" lon="([-\d.]+)"/g)].map(
      (m) => [Number(m[2]), Number(m[1])] as Position,
    );
    expect(pts).toHaveLength(stats.pointCount);
    expect(haversineKm(pts[0]!, [odawara.geometry.coordinates[0], odawara.geometry.coordinates[1]] as Position)).toBeLessThan(0.02);
    expect(haversineKm(pts.at(-1)!, [mishima.geometry.coordinates[0], mishima.geometry.coordinates[1]] as Position)).toBeLessThan(0.02);
  });

  it('carries the surrounding anchors as context waypoints', () => {
    expect(gpx).toContain('Odawara-juku');
    expect(gpx).toContain('Hatajuku Honjin');
    expect(gpx).toContain('Hakone Sekisho (checkpoint)');
    // And says they are context, not geometry to send back.
    expect(gpx).toMatch(/do not export them back/i);
  });

  it('carries the hazards worth seeing while tracing', () => {
    expect(gpx).toMatch(/Hakone Pass IC/);
  });

  it('never carries lodging, which may be private', () => {
    expect(gpx).not.toMatch(/EXAMPLE HOTEL/);
  });

  it('excludes a private user point and includes a public one', () => {
    const nearby = { lat: odawara.geometry.coordinates[1], lon: odawara.geometry.coordinates[0] };
    const secret = makeUserPoint(
      { role: 'waypoint', type: 'hotel', title: 'REAL BOOKING', ...nearby },
      stretches,
    );
    const water = makeUserPoint(
      { role: 'waypoint', type: 'water', title: 'Tap by the castle', ...nearby },
      stretches,
    );
    const withPoints = sectionGpx(line, anchors, waypoints, stats, [secret, water], 2, AT);
    expect(withPoints).toContain('Tap by the castle');
    expect(withPoints).not.toContain('REAL BOOKING');
  });

  it('omits anchors well outside the section', () => {
    expect(gpx).not.toContain('Nihonbashi');
    expect(gpx).not.toContain('Suzuka Pass');
  });

  it('states the section in the description so the file explains itself', () => {
    expect(gpx).toMatch(/Section — Odawara-juku to Mishima-juku/);
    expect(gpx).toMatch(/mean spacing \d+ m/);
    expect(gpx).toMatch(/road snapping/i);
  });
});

describe('sectionFilename', () => {
  it('names the file so it sorts by position and says what it is', () => {
    const stats = sectionStats(line, anchors, odawara.properties.id, mishima.properties.id)!;
    // The leading kilometre is where the section starts, so a folder of exports
    // sorts into walking order. It moves when an earlier section is retraced
    // and measures longer, so derive it rather than restating it.
    const km = Math.round(stats.fromKm);
    expect(sectionFilename(stats)).toBe(`section-${km}km-Odawara-juku-to-Mishima-juku.gpx`);
    expect(sectionFilename(stats)).toMatch(/^section-\d+km-.*\.gpx$/);
  });

  it('strips characters a filesystem would object to', () => {
    const sekisho = byJa('箱根関所');
    const stats = sectionStats(line, anchors, odawara.properties.id, sekisho.properties.id)!;
    const name = sectionFilename(stats);
    expect(name).not.toMatch(/[()/\\:*?"<>|]/);
    expect(name.endsWith('.gpx')).toBe(true);
  });
});
