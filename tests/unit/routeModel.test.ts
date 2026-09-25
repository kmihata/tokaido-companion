import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AnchorsFileSchema, RouteFileSchema, RouteMetaSchema } from '../../src/data/schemas';
import { buildStretches } from '../../src/data/load';
import { measureBailouts, projectOntoRoute } from '../../src/lib/dayContext';
import { haversineKm, lineLengthKm } from '../../src/lib/geo';
import type { Position } from '../../src/lib/geo';

const DATA = join(process.cwd(), 'public', 'data');
const read = (f: string): unknown => JSON.parse(readFileSync(join(DATA, f), 'utf8')) as unknown;

const meta = RouteMetaSchema.parse(read('route-meta.json'));
const features = RouteFileSchema.parse(read('route.geojson')).features;
const anchors = AnchorsFileSchema.parse(read('anchors.geojson')).features;

describe('the shipped route validates', () => {
  it('parses meta, geometry and anchors', () => {
    expect(meta.schemaVersion).toBe(2);
    expect(features.length).toBeGreaterThanOrEqual(3);
    expect(anchors.length).toBe(meta.anchorCount);
  });

  it('has two walking paths and one gap — the sea crossing', () => {
    expect(meta.paths.filter((p) => p.kind === 'walking')).toHaveLength(2);
    const gaps = meta.paths.filter((p) => p.lengthKm === null);
    expect(gaps).toHaveLength(1);
    expect(gaps[0]!.id).toBe('gap-shichiri');
  });

  it('resolves every anchor reference on a path or variant', () => {
    const ids = new Set(anchors.map((a) => a.properties.id));
    for (const p of meta.paths) {
      if (p.startAnchorId) expect(ids.has(p.startAnchorId), p.id).toBe(true);
      if (p.endAnchorId) expect(ids.has(p.endAnchorId), p.id).toBe(true);
    }
    for (const v of meta.variants) {
      expect(ids.has(v.divergeAnchorId), v.id).toBe(true);
      // A variant may run on to the end instead of rejoining.
      if (v.rejoinAnchorId !== null) expect(ids.has(v.rejoinAnchorId), v.id).toBe(true);
    }
  });

  it('gives every anchor an alongKm consistent with its position on its path', () => {
    for (const a of anchors) {
      const f = features.find((x) => x.properties.id === a.properties.pathId);
      if (!f) continue;
      const coords = f.geometry.coordinates as Position[];
      const upto = coords.slice(0, a.properties.indexOnPath + 1);
      expect(a.properties.alongKm, a.properties.id).toBeCloseTo(lineLengthKm(upto), 1);
    }
  });

  it('carries no zero-length steps, which would flatter the spacing figures', () => {
    // Mean spacing is `length / (points - 1)` in traceChecks.ts and
    // sectionExport.ts, and that number is what decides whether a section is
    // finished. A repeated coordinate adds nothing to the numerator but still
    // counts in the denominator, so duplicates make a coarse section read as
    // fine. gpx.studio produces them by routing each leg separately and
    // concatenating; the original kaidotrail import carried 264 of its own.
    // 832 were stripped on 2026-09-21 and the converter now drops them at the
    // door. This is the check that they stay gone.
    for (const f of features) {
      const c = f.geometry.coordinates as Position[];
      for (let i = 1; i < c.length; i++) {
        expect(
          c[i]![0] === c[i - 1]![0] && c[i]![1] === c[i - 1]![1],
          `${f.properties.id} repeats the point at index ${i}`,
        ).toBe(false);
      }
    }
  });

  it('places every anchor on the geometry it claims to sit on', () => {
    for (const a of anchors) {
      const f = features.find((x) => x.properties.id === a.properties.pathId);
      if (!f) continue;
      const at = f.geometry.coordinates[a.properties.indexOnPath] as Position;
      expect(haversineKm(at, a.geometry.coordinates as Position), a.properties.id).toBeLessThan(0.001);
    }
  });

  it('numbers the post stations without duplicates', () => {
    const nums = anchors.map((a) => a.properties.stationNumber).filter((n): n is number => n !== null);
    expect(new Set(nums).size).toBe(nums.length);
    expect(Math.min(...nums)).toBeGreaterThanOrEqual(1);
    expect(Math.max(...nums)).toBeLessThanOrEqual(53);
  });

  it('records both numbering schemes where the source switches to Nakasendo', () => {
    const kusatsu = anchors.find((a) => a.properties.titleJa === '草津宿')!;
    expect(kusatsu.properties.stationNumber).toBe(52);
    expect(kusatsu.properties.nakasendoNumber).toBe(68);
  });
});

describe('buildStretches', () => {
  const { stretches, breaks } = buildStretches(meta, features, anchors);

  it('produces one continuous stretch, Nihonbashi to Sanjo Ohashi', () => {
    // East + Saya + West join into one line. Since the Kyoto approach was
    // traced there is nothing left to interrupt it.
    expect(stretches).toHaveLength(1);
    expect(breaks).toHaveLength(0);
  });

  it('truncates the east path at the Saya divergence rather than double-counting the ferry spur', () => {
    const eastFeature = features.find((f) => f.properties.id === 'path-east')!;
    const divergeIdx = anchors.find((a) => a.properties.id === meta.variants[0]!.divergeAnchorId)!
      .properties.indexOnPath;
    // The full east path runs past the divergence to the ferry landing.
    expect(divergeIdx).toBeLessThan(eastFeature.geometry.coordinates.length - 1);
    // The assembled line must not contain the ferry landing itself.
    const landing = anchors.find((a) => a.properties.titleJa === '七里の渡')!;
    const nearest = Math.min(
      ...stretches[0]!.positions.map((p) => haversineKm(p, landing.geometry.coordinates as Position)),
    );
    expect(nearest).toBeGreaterThan(0.2);
  });

  it('measures the assembled line as the sum of its parts', () => {
    const total = stretches.reduce((t, s) => t + s.lengthKm, 0);
    expect(total).toBeCloseTo(meta.totals.activeWalkingKm, 0);
    expect(total).toBeGreaterThan(525);
    expect(total).toBeLessThan(545);
  });

  it('keeps cumulative distances monotonic and ending at the total', () => {
    for (const s of stretches) {
      expect(s.cumulativeKm[0]).toBe(0);
      expect(s.cumulativeKm.at(-1)).toBeCloseTo(s.lengthKm, 6);
      for (let i = 1; i < s.cumulativeKm.length; i++) {
        expect(s.cumulativeKm[i]!).toBeGreaterThanOrEqual(s.cumulativeKm[i - 1]!);
      }
    }
  });

  it('breaks the line when the Saya variant is deactivated, rather than bridging the bay', () => {
    const inactive = { ...meta, variants: meta.variants.map((v) => ({ ...v, active: false })) };
    const r = buildStretches(inactive, features, anchors);
    expect(r.stretches).toHaveLength(2);
    expect(r.breaks.map((b) => b.pathId)).toContain('gap-shichiri');
    // Neither stretch may span the crossing.
    for (const s of r.stretches) {
      for (let i = 1; i < s.positions.length; i++) {
        expect(haversineKm(s.positions[i - 1]!, s.positions[i]!)).toBeLessThan(2);
      }
    }
  });

  it('walks the full east path to the ferry landing when the Saya is inactive', () => {
    const inactive = { ...meta, variants: meta.variants.map((v) => ({ ...v, active: false })) };
    const r = buildStretches(inactive, features, anchors);
    const landing = anchors.find((a) => a.properties.titleJa === '七里の渡')!;
    const nearest = Math.min(
      ...r.stretches.flatMap((s) => s.positions).map((p) => haversineKm(p, landing.geometry.coordinates as Position)),
    );
    expect(nearest).toBeLessThan(0.01);
  });
});

describe('projectOntoRoute and measureBailouts', () => {
  const { stretches } = buildStretches(meta, features, anchors);
  const nihonbashi = anchors.find((a) => a.properties.titleJa === '日本橋')!;
  const odawara = anchors.find((a) => a.properties.stationNumber === 9)!;
  const hamamatsu = anchors.find((a) => a.properties.stationNumber === 29)!;

  it('projects a point on the route to ~zero off-route distance', () => {
    const p = projectOntoRoute(stretches, odawara.geometry.coordinates as Position)!;
    expect(p.offRouteKm).toBeLessThan(0.01);

    // Not compared against the anchor's stored `alongKm`: that is measured along
    // its base path, while this is measured along the assembled stretches, and a
    // retrace upstream separates them. What must hold is ORDER — projections
    // along the route keep the post stations in the sequence you walk them.
    const nb = projectOntoRoute(stretches, nihonbashi.geometry.coordinates as Position)!;
    const hm = projectOntoRoute(stretches, hamamatsu.geometry.coordinates as Position)!;
    expect(p.alongKm).toBeGreaterThan(nb.alongKm);
    expect(p.alongKm).toBeLessThan(hm.alongKm);
  });

  it('measures a point beside the route as off-route', () => {
    const [lon, lat] = odawara.geometry.coordinates;
    const p = projectOntoRoute(stretches, [lon + 0.02, lat] as Position)!;
    expect(p.offRouteKm).toBeGreaterThan(1);
    expect(p.offRouteKm).toBeLessThan(3);
  });

  it('knows which exits are ahead and which are behind', () => {
    const from = projectOntoRoute(stretches, odawara.geometry.coordinates as Position)!;
    const fake = (id: string, coords: [number, number]) =>
      ({
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: coords },
        properties: { id, title: id, type: 'rail-bailout', dayIds: [] },
      }) as never;
    const measured = measureBailouts(
      stretches,
      [
        fake('behind', nihonbashi.geometry.coordinates as [number, number]),
        fake('ahead', hamamatsu.geometry.coordinates as [number, number]),
      ],
      from,
      odawara.geometry.coordinates as Position,
    );
    // Exits ahead sort first, which straight-line distance could not do.
    expect(measured[0]!.feature.properties.id).toBe('ahead');
    expect(measured[0]!.ahead).toBe(true);
    expect(measured[1]!.ahead).toBe(false);
  });

  it('gives an along-route distance larger than the straight line', () => {
    const from = projectOntoRoute(stretches, odawara.geometry.coordinates as Position)!;
    const fake = {
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: hamamatsu.geometry.coordinates },
      properties: { id: 'hamamatsu', title: 'Hamamatsu', type: 'rail-bailout', dayIds: [] },
    } as never;
    const [m] = measureBailouts(stretches, [fake], from, odawara.geometry.coordinates as Position);
    // Odawara to Hamamatsu is ~184 km of road against ~150 km as the crow flies.
    expect(m!.alongRouteKm!).toBeGreaterThan(m!.straightLineKm!);

    // The anchors' own bookkeeping, for comparison — but only as a magnitude
    // check, not an equality. `alongKm` is measured along the base path as
    // imported; `alongRouteKm` is measured along the assembled route, which
    // carries every retrace baked since. Retracing adds detail and therefore
    // length, so the assembled figure runs steadily longer as the tracing
    // programme proceeds. This assertion used to demand agreement to 0.5 km
    // and passed only by luck: it stood at 0.497 km and the Yunoki bake on
    // 2026-09-21 added the five metres that tipped it. What must hold is that
    // the two are measuring the same journey — within a percent of each other,
    // in either direction. A real fault in measureBailouts (wrong stretch,
    // double-counted leg, a break silently bridged) misses by kilometres.
    const bookkeeping = hamamatsu.properties.alongKm - odawara.properties.alongKm;
    expect(Math.abs(m!.alongRouteKm! - bookkeeping) / bookkeeping).toBeLessThan(0.01);
  });

  it('refuses to measure across a break rather than guessing', () => {
    const inactive = { ...meta, variants: meta.variants.map((v) => ({ ...v, active: false })) };
    const r = buildStretches(inactive, features, anchors);
    const from = projectOntoRoute(r.stretches, odawara.geometry.coordinates as Position)!;
    const kuwana = anchors.find((a) => a.properties.stationNumber === 42)!;
    const fake = {
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: kuwana.geometry.coordinates },
      properties: { id: 'kuwana', title: 'Kuwana', type: 'rail-bailout', dayIds: [] },
    } as never;
    const [m] = measureBailouts(r.stretches, [fake], from, odawara.geometry.coordinates as Position);
    expect(m!.acrossBreak).toBe(true);
    expect(m!.alongRouteKm).toBeNull();
    expect(m!.totalKm).toBeNull();
  });
});
