import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { NAV_WARNING_HEADLINE, NAV_WARNING_FALLBACK } from '../../src/components/DemoBanner';
import { haversineKm } from '../../src/lib/geo';
import type { Position } from '../../src/lib/geo';

const DATA = join(process.cwd(), 'public', 'data');
const read = (f: string): Record<string, unknown> =>
  JSON.parse(readFileSync(join(DATA, f), 'utf8')) as Record<string, unknown>;

const meta = read('route-meta.json');
const routeFeatures = read('route.geojson')['features'] as {
  geometry: { coordinates: [number, number][] };
  properties: Record<string, unknown>;
}[];
const anchors = read('anchors.geojson')['features'] as { properties: Record<string, unknown> }[];
const waypoints = read('waypoints.geojson')['features'] as { properties: Record<string, unknown> }[];
const stations = read('stations.json')['stations'] as Record<string, unknown>[];

/**
 * The headline claim — nothing here is verified for navigation — must survive
 * every future change to the data. Everything else about provenance may become
 * more precise over time; this may not become weaker.
 */
describe('nothing claims to be navigational', () => {
  it('every dataset file declares navigational: false', () => {
    for (const f of ['index.json', 'trip.json', 'days.json', 'stations.json', 'route-meta.json']) {
      expect(read(f)['navigational'], `${f}`).toBe(false);
    }
  });

  it('every route feature, anchor and waypoint declares navigational: false', () => {
    for (const r of [
      ...routeFeatures.map((f) => f.properties),
      ...anchors.map((a) => a.properties),
      ...waypoints.map((w) => w.properties),
    ]) {
      expect(r['navigational'], String(r['id'])).toBe(false);
    }
  });

  it('the UI warning says so too, and does not overstate', () => {
    expect(NAV_WARNING_HEADLINE).toMatch(/not for navigation/i);
    expect(NAV_WARNING_HEADLINE).toMatch(/unverified/i);
    expect(NAV_WARNING_FALLBACK).toMatch(/checked on the ground/i);
    // The route stopped being a schematic sketch on 2026-08-20. Saying it still
    // is would be crying wolf, and a warning that overstates gets ignored.
    expect(NAV_WARNING_HEADLINE.toLowerCase()).not.toContain('schematic');
    expect(NAV_WARNING_FALLBACK.toLowerCase()).not.toContain('schematic');
  });

  it('the route notice states what is actually wrong with it', () => {
    const notice = String(meta['notice']);
    expect(notice).toMatch(/unverified/i);
    expect(notice).toMatch(/not checked on the ground/i);
    expect(notice).toMatch(/do not navigate/i);
  });
});

describe('the route preserves its discontinuities', () => {
  const paths = meta['paths'] as Record<string, unknown>[];
  const variants = meta['variants'] as Record<string, unknown>[];

  it('models the Seven-ri crossing as a gap with no geometry', () => {
    const gap = paths.find((p) => p['id'] === 'gap-shichiri');
    expect(gap, 'gap-shichiri must exist').toBeTruthy();
    expect(gap!['kind']).toBe('ferry-gap');
    expect(gap!['lengthKm']).toBeNull();
    expect(routeFeatures.find((f) => f.properties['id'] === 'gap-shichiri')).toBeUndefined();
  });

  /**
   * Closed 2026-08-23 when the traced route reached Sanjo Ohashi. The route now
   * has exactly one gap — the sea crossing, which is a property of the ground
   * rather than of the data.
   */
  it('has no unresolved gaps left, now the route reaches Kyoto', () => {
    expect(paths.filter((p) => p['kind'] === 'unresolved')).toHaveLength(0);
    expect(paths.find((p) => p['id'] === 'gap-kyoto-approach')).toBeUndefined();
    const terminus = anchors.find((a) => a.properties['titleJa'] === '三条大橋');
    expect(terminus, 'the route needs a named terminus').toBeTruthy();
  });

  it('offers the Saya Kaido as the land variant that resolves the crossing', () => {
    const saya = variants.find((v) => v['id'] === 'variant-saya');
    expect(saya, 'variant-saya must exist').toBeTruthy();
    expect(saya!['replacesPathId']).toBe('gap-shichiri');
    expect(saya!['active']).toBe(true);
    expect(saya!['lengthKm']).toBeGreaterThan(30);
    expect(saya!['lengthKm']).toBeLessThan(45);
  });

  /**
   * The Footpath lesson, encoded. Multiple track segments inside one track are
   * silently bridged into a straight line, which on this route would draw
   * 21 km across Ise Bay. No emitted LineString may contain a jump that looks
   * like a bridged gap.
   *
   * The threshold allows for the source's coarse sampling through central
   * Tokyo, where two consecutive points sit just over a kilometre apart.
   */
  it('contains no jump long enough to be a bridged gap', () => {
    for (const f of routeFeatures) {
      const coords = f.geometry.coordinates;
      let worst = 0;
      let worstAt = -1;
      for (let i = 1; i < coords.length; i++) {
        const d = haversineKm(coords[i - 1] as Position, coords[i] as Position);
        if (d > worst) {
          worst = d;
          worstAt = i;
        }
      }
      expect(
        worst,
        `${String(f.properties['id'])} has a ${worst.toFixed(1)} km jump at index ${worstAt}`,
      ).toBeLessThan(2);
    }
  });
});

describe('provenance is recorded per record, not assumed', () => {
  it('names its source, licence and attribution', () => {
    const src = meta['source'] as Record<string, unknown>;
    expect(src['licence']).toBe('CC BY-SA 4.0');
    expect(String(src['attribution'])).toMatch(/kaidotrail/i);
    expect(String(src['attribution'])).toMatch(/modified/i);
    expect(existsSync(join(process.cwd(), String(src['provenanceFile'])))).toBe(true);
  });

  it('distinguishes imported coordinates from hand-written estimates', () => {
    const sources = new Set(
      [...stations, ...waypoints.map((w) => w.properties)].map((r) => r['positionSource']),
    );
    expect(sources).toContain('source-route-anchor');
    expect(sources).toContain('operator-estimate');
    for (const r of [...stations, ...waypoints.map((w) => w.properties)]) {
      if (r['positionSource'] === 'source-route-anchor') {
        expect(r['verification'], String(r['id'])).toBe('imported');
        expect(r['anchorId'], String(r['id'])).toBeTruthy();
      } else if (r['positionSource'] === 'reference-lookup') {
        // Read off a published record rather than the route or a guess. It must
        // say where it was read from, or it is indistinguishable from the guess.
        expect(r['verification'], String(r['id'])).toBe('desk-checked');
        expect(r['source'], String(r['id'])).not.toBe('demonstration-fixture');
      } else {
        expect(r['verification'], String(r['id'])).toBe('unverified');
      }
    }
  });

  it('leaves every anchor unchecked on the ground', () => {
    for (const a of anchors) {
      expect(['imported', 'manually-traced']).toContain(a.properties['verification']);
      expect(a.properties['lastChecked'], String(a.properties['title'])).toBeNull();
    }
  });

  it('marks every day provisional', () => {
    for (const d of read('days.json')['days'] as Record<string, unknown>[]) {
      expect(d['provisional']).toBe(true);
    }
  });

  it('names every fictional hotel as fictional', () => {
    const hotels = waypoints.filter((w) => w.properties['type'] === 'hotel');
    expect(hotels.length).toBeGreaterThan(0);
    for (const h of hotels) {
      expect(String(h.properties['title'])).toMatch(/EXAMPLE|fictional/i);
      expect(String(h.properties['operationalNotes'])).toMatch(/FICTIONAL PLACEHOLDER/i);
      // A fictional hotel must never be given a real imported position.
      expect(h.properties['positionSource']).toBe('operator-estimate');
    }
  });
});

describe('Hiroshige records claim no rights they do not have', () => {
  const images = read('hiroshige.json')['images'] as Record<string, unknown>[];

  it('leaves rights unverified for every record', () => {
    for (const i of images) expect(i['rightsStatus']).toBe('unverified');
  });

  it('claims no offline image and no institution', () => {
    for (const i of images) {
      expect(i['imageAvailableOffline']).toBe(false);
      expect(i['institution']).toBeNull();
      expect(i['sourceUrl']).toBeNull();
    }
  });

  it('claims no viewpoint it has not established', () => {
    for (const i of images) {
      expect(i['viewpointConfidence']).toBe('unknown');
      expect(i['viewpointLat']).toBeNull();
      expect(i['viewpointLon']).toBeNull();
    }
  });

  it('ships no image files in public/', () => {
    const walk = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)],
      );
    expect(walk(join(process.cwd(), 'public')).filter((f) => /\.(jpe?g|tiff?|webp|gif)$/i.test(f))).toEqual([]);
  });
});

describe('the private example file is not bundled into the app', () => {
  it('lives outside public/', () => {
    expect(existsSync(join(process.cwd(), 'examples', 'private-data.example.json'))).toBe(true);
    expect(existsSync(join(process.cwd(), 'public', 'private-data.example.json'))).toBe(false);
  });

  it('is obviously fictional throughout', () => {
    const text = readFileSync(join(process.cwd(), 'examples', 'private-data.example.json'), 'utf8');
    expect(text).toMatch(/EXAMPLE|fictional/i);
    const withoutDates = text.replace(/\d{4}-\d{2}-\d{2}(T[\d:.]+Z?)?/g, '');
    for (const m of withoutDates.matchAll(/\+?\d[\d-]{8,}\d/g)) {
      expect(m[0].replace(/[^\d]/g, ''), `unexpected number-like string: ${m[0]}`).toMatch(/^0+$/);
    }
  });
});
