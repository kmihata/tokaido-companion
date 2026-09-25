import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AnchorsFileSchema, DaysFileSchema, RouteFileSchema, RouteMetaSchema } from '../../src/data/schemas';
import { buildStretches } from '../../src/data/load';
import { applyRouteEdits, makeRouteEdit, validateRouteEdit } from '../../src/lib/routeEdits';
import type { MakeRouteEditInput, RouteEdit } from '../../src/lib/routeEdits';
import { buildPlanningLine } from '../../src/lib/planningLine';
import { buildDefaultDayPlans, buildLegs } from '../../src/lib/dayPlan';
import { haversineKm, lineLengthKm } from '../../src/lib/geo';
import type { Position } from '../../src/lib/geo';

const D = join(process.cwd(), 'public', 'data');
const read = (f: string): unknown => JSON.parse(readFileSync(join(D, f), 'utf8')) as unknown;

const meta = RouteMetaSchema.parse(read('route-meta.json'));
const features = RouteFileSchema.parse(read('route.geojson')).features;
const anchors = AnchorsFileSchema.parse(read('anchors.geojson')).features;
const days = DaysFileSchema.parse(read('days.json')).days;

const base = buildStretches(meta, features, anchors);
const baseLine = buildPlanningLine(base.stretches, base.breaks);

const anchorAt = (ja: string) => anchors.find((a) => a.properties.titleJa === ja)!;
const coord = (ja: string): Position => {
  const a = anchorAt(ja);
  return [a.geometry.coordinates[0], a.geometry.coordinates[1]];
};

const origin = { filename: 'traced.gpx', trackName: 'x', format: 'gpx', importedAt: '2026-08-20T00:00:00Z' };

/**
 * A bowed line at realistic point density, standing in for a traced section
 * that genuinely departs from the original — the Hiryu Falls hybrid leaves the
 * switchbacks and climbs north.
 */
function interpolate(a: Position, b: Position, steps: number): Position[] {
  return Array.from({ length: steps + 1 }, (_, i) => {
    const t = i / steps;
    const bow = Math.sin(t * Math.PI) * 0.006; // ~650 m north at the midpoint
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t + bow] as Position;
  });
}

describe('validateRouteEdit', () => {
  const hatajuku = anchorAt('畑宿本陣');
  const sekisho = anchorAt('箱根関所');

  const input = (patch: Partial<MakeRouteEditInput> = {}): MakeRouteEditInput => ({
    kind: 'replace-section',
    label: 'Hiryu Falls hybrid',
    origin,
    divergeAnchorId: hatajuku.properties.id,
    rejoinAnchorId: sekisho.properties.id,
    geometry: [coord('畑宿本陣'), [139.04, 35.215], coord('箱根関所')],
    ...patch,
  });

  it('accepts geometry that meets both anchors', () => {
    expect(validateRouteEdit(input(), anchors).ok).toBe(true);
  });

  /**
   * The self-inflicted version of the Footpath bridging problem: geometry that
   * does not meet its anchors gives the assembled route an invisible jump.
   */
  it('refuses geometry that starts a long way from its anchor', () => {
    const r = validateRouteEdit(input({ geometry: [[139.5, 35.5], coord('箱根関所')] }), anchors);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join(' ')).toMatch(/starts .* km from/i);
  });

  it('refuses geometry that ends a long way from its rejoin anchor', () => {
    const r = validateRouteEdit(input({ geometry: [coord('畑宿本陣'), [139.5, 35.5]] }), anchors);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join(' ')).toMatch(/ends .* km from/i);
  });

  it('warns about a small mismatch rather than refusing it', () => {
    // 0.0008 deg of longitude here is about 73 m, which warned until the error
    // threshold dropped from 250 m to 50 m on 2026-09-20 to match the baker.
    // 0.0004 is about 36 m: past the 20 m at which the gap is worth mentioning,
    // inside the 50 m at which an edit stops being bakeable.
    const near: Position = [coord('畑宿本陣')[0] + 0.0004, coord('畑宿本陣')[1]];
    const r = validateRouteEdit(input({ geometry: [near, coord('箱根関所')] }), anchors);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.warnings.join(' ')).toMatch(/m from/);
  });

  it('refuses a rejoin that comes before the start', () => {
    const r = validateRouteEdit(
      input({
        divergeAnchorId: sekisho.properties.id,
        rejoinAnchorId: hatajuku.properties.id,
        geometry: [coord('箱根関所'), coord('畑宿本陣')],
      }),
      anchors,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join(' ')).toMatch(/before the start/i);
  });

  it('refuses an unnamed edit and one with too little geometry', () => {
    expect(validateRouteEdit(input({ label: '  ' }), anchors).ok).toBe(false);
    expect(validateRouteEdit(input({ geometry: [coord('畑宿本陣')] }), anchors).ok).toBe(false);
  });

  it('accepts an edit with no rejoin, which runs on to the end', () => {
    expect(
      validateRouteEdit(
        input({ rejoinAnchorId: null, geometry: [coord('髭茶屋追分'), [135.85, 35.0]], divergeAnchorId: anchorAt('髭茶屋追分').properties.id }),
        anchors,
      ).ok,
    ).toBe(true);
  });
});

describe('applyRouteEdits — replacing a section', () => {
  const hatajuku = anchorAt('畑宿本陣');
  const sekisho = anchorAt('箱根関所');

  // A deliberately short line between the two anchors, standing in for a
  // traced hybrid that avoids the switchbacks.
  const edit = makeRouteEdit({
    kind: 'replace-section',
    label: 'Hiryu Falls hybrid',
    origin,
    divergeAnchorId: hatajuku.properties.id,
    rejoinAnchorId: sekisho.properties.id,
    geometry: interpolate(coord('畑宿本陣'), coord('箱根関所'), 30),
  });

  const applied = applyRouteEdits(meta, features, [edit]);
  const built = buildStretches(applied.meta, applied.features, anchors);

  it('leaves the source geometry untouched', () => {
    const east = applied.features.find((f) => f.properties.id === 'path-east')!;
    const originalEast = features.find((f) => f.properties.id === 'path-east')!;
    expect(east.geometry.coordinates).toEqual(originalEast.geometry.coordinates);
  });

  it('adds the edit as a variant rather than splicing a path', () => {
    expect(applied.meta.paths).toEqual(meta.paths);
    expect(applied.meta.variants).toHaveLength(meta.variants.length + 1);
    expect(applied.meta.variants.at(-1)!.id).toBe(edit.id);
  });

  it('produces a route that uses the edit and skips what it replaced', () => {
    const line = buildPlanningLine(built.stretches, built.breaks);
    // The switchbacks between the two anchors are no longer walked.
    const nanamagari = coord('七曲り');
    const nearest = Math.min(...line.positions.map((p) => haversineKm(p, nanamagari)));
    expect(nearest).toBeGreaterThan(0.2);
    // Both ends are still on the line.
    expect(Math.min(...line.positions.map((p) => haversineKm(p, coord('畑宿本陣'))))).toBeLessThan(0.01);
    expect(Math.min(...line.positions.map((p) => haversineKm(p, coord('箱根関所'))))).toBeLessThan(0.01);
  });

  it('shortens the route by the difference, and only that', () => {
    const line = buildPlanningLine(built.stretches, built.breaks);
    expect(line.lengthKm).toBeLessThan(baseLine.lengthKm);
    expect(baseLine.lengthKm - line.lengthKm).toBeGreaterThan(1);
  });

  it('introduces no jump that would read as a bridged gap', () => {
    for (const s of built.stretches) {
      for (let i = 1; i < s.positions.length; i++) {
        expect(haversineKm(s.positions[i - 1]!, s.positions[i]!)).toBeLessThan(2);
      }
    }
  });

  it('changes the days that contain it and leaves the rest alone', () => {
    const line = buildPlanningLine(built.stretches, built.breaks);
    const after = buildLegs(line, buildDefaultDayPlans(line, anchors, days), days, anchors);
    const before = buildLegs(baseLine, buildDefaultDayPlans(baseLine, anchors, days), days, anchors);
    // Day 4 crosses Hakone.
    expect(after[3]!.distanceKm).toBeLessThan(before[3]!.distanceKm);
    expect(after[0]!.distanceKm).toBeCloseTo(before[0]!.distanceKm, 3);
  });

  it('is undone by deactivating it, with nothing to restore', () => {
    const off = applyRouteEdits(meta, features, [{ ...edit, active: false }]);
    const line = buildPlanningLine(...(() => {
      const b = buildStretches(off.meta, off.features, anchors);
      return [b.stretches, b.breaks] as const;
    })());
    expect(line.lengthKm).toBeCloseTo(baseLine.lengthKm, 6);
  });
});

describe('applyRouteEdits — closing a gap', () => {
  /**
   * The Kyoto approach was the gap this used to test; it was traced and closed
   * on 2026-08-23. The remaining gap is the Seven-ri sea crossing, which the
   * built-in Saya Kaido variant resolves — so switch that off and close the gap
   * with an imported line instead.
   *
   * The imported line is the ferry spur walked back up to the junction, then
   * the Saya: a real land route from one landing to the other.
   */
  const inactiveSaya = { ...meta, variants: meta.variants.map((v) => ({ ...v, active: false })) };
  const baseWithGap = buildStretches(inactiveSaya, features, anchors);
  const lineWithGap = buildPlanningLine(baseWithGap.stretches, baseWithGap.breaks);

  const eastGeom = features.find((f) => f.properties.id === 'path-east')!.geometry.coordinates as Position[];
  const sayaGeom = features.find((f) => f.properties.id === 'variant-saya')!.geometry.coordinates as Position[];
  const divergeIdx = anchorAt('東海道・佐屋街道分岐 (一旦七里の渡方向へ)').properties.indexOnPath;
  // Landing → junction (the spur, reversed) → Kuwana (the Saya).
  const landRoute: Position[] = [...eastGeom.slice(divergeIdx).reverse(), ...sayaGeom.slice(1)];

  const edit = makeRouteEdit({
    kind: 'resolve-gap',
    label: 'Miya to Kuwana on land',
    reason: 'Walked back to the junction and out along the Saya Kaido.',
    origin,
    divergeAnchorId: anchorAt('七里の渡').properties.id,
    rejoinAnchorId: anchorAt('七里の渡跡').properties.id,
    replacesPathId: 'gap-shichiri',
    geometry: landRoute,
  });

  const applied = applyRouteEdits(inactiveSaya, features, [edit]);
  const built = buildStretches(applied.meta, applied.features, anchors);

  it('meets both landings, so it can be adopted at all', () => {
    expect(validateRouteEdit(
      {
        kind: 'resolve-gap', label: 'x', origin,
        divergeAnchorId: anchorAt('七里の渡').properties.id,
        rejoinAnchorId: anchorAt('七里の渡跡').properties.id,
        replacesPathId: 'gap-shichiri',
        geometry: landRoute,
      },
      anchors,
    ).ok).toBe(true);
  });

  it('removes the break instead of leaving the route in two pieces', () => {
    expect(baseWithGap.breaks.map((b) => b.pathId)).toContain('gap-shichiri');
    expect(baseWithGap.stretches).toHaveLength(2);
    expect(built.breaks.map((b) => b.pathId)).not.toContain('gap-shichiri');
    expect(built.stretches).toHaveLength(1);
  });

  it('extends the route by the length of the new piece', () => {
    const line = buildPlanningLine(built.stretches, built.breaks);
    expect(line.lengthKm - lineWithGap.lengthKm).toBeCloseTo(lineLengthKm(landRoute), 1);
  });

  it('introduces no jump that would read as a bridged crossing', () => {
    for (const st of built.stretches) {
      for (let i = 1; i < st.positions.length; i++) {
        expect(haversineKm(st.positions[i - 1]!, st.positions[i]!)).toBeLessThan(2);
      }
    }
  });

  it('never draws a line across the bay', () => {
    const line = buildPlanningLine(built.stretches, built.breaks);
    // Mid-bay, roughly halfway between the two landings.
    const midBay: Position = [136.80, 35.095];
    expect(Math.min(...line.positions.map((p) => haversineKm(p, midBay)))).toBeGreaterThan(3);
  });
});

describe('applyRouteEdits — a prepared alternative', () => {
  it('is drawn but not walked until it is switched on', () => {
    const edit = makeRouteEdit({
      kind: 'add-variant',
      label: 'Wet-weather line',
      origin,
      divergeAnchorId: anchorAt('畑宿本陣').properties.id,
      rejoinAnchorId: anchorAt('箱根関所').properties.id,
      geometry: [coord('畑宿本陣'), [139.05, 35.21], coord('箱根関所')],
      active: false,
    });
    const applied = applyRouteEdits(meta, features, [edit]);
    // Present in the data for comparison…
    expect(applied.features.some((f) => f.properties.id === edit.id)).toBe(true);
    // …but the assembled route is unchanged.
    const built = buildStretches(applied.meta, applied.features, anchors);
    const line = buildPlanningLine(built.stretches, built.breaks);
    expect(line.lengthKm).toBeCloseTo(baseLine.lengthKm, 6);
  });

  it('does nothing at all when there are no edits', () => {
    const r = applyRouteEdits(meta, features, []);
    expect(r.meta).toBe(meta);
    expect(r.features).toHaveLength(features.length);
  });
});

/**
 * Regression tests for the Saya Kaido incident, 2026-08-23.
 *
 * A section cut from the Saya came back and the importer matched its start to
 * the coincident junction anchor on the Tokaido instead. The edit then looked
 * like a second alignment leaving the Tokaido at the same junction, and
 * `buildStretches` walked both — the Saya in full AND the new section — adding
 * 45 km of route that does not exist.
 *
 * Three things now prevent it, and each is tested here: the anchors are on the
 * right geometry, an edit spanning two alignments is refused, and an edit whose
 * ends are both on a variant is spliced into it rather than added alongside.
 */
describe('editing a section of a variant', () => {
  const sayaStart = anchorAt('東海道・佐屋街道分岐');
  const manba = anchorAt('万場大橋');
  const tokaidoJunction = anchorAt('東海道・佐屋街道分岐 (一旦七里の渡方向へ)');

  it('keeps coincident junction anchors on their own alignment', () => {
    expect(sayaStart.properties.pathId).toBe('variant-saya');
    expect(sayaStart.properties.indexOnPath).toBe(0);
    expect(tokaidoJunction.properties.pathId).toBe('path-east');
    expect(anchorAt('桑名宿').properties.pathId).toBe('path-west');
  });

  it('gives them distinguishable names, since they share a coordinate', () => {
    expect(sayaStart.properties.title).not.toBe(tokaidoJunction.properties.title);
    expect(haversineKm(
      sayaStart.geometry.coordinates as Position,
      tokaidoJunction.geometry.coordinates as Position,
    )).toBeLessThan(0.001);
  });

  const sayaGeom = features.find((f) => f.properties.id === 'variant-saya')!.geometry.coordinates as Position[];
  const replacement: Position[] = (() => {
    const a = sayaGeom[0]!;
    const b = sayaGeom[manba.properties.indexOnPath]!;
    return Array.from({ length: 40 }, (_, i) => {
      const t = i / 39;
      return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t + Math.sin(t * Math.PI) * 0.004] as Position;
    });
  })();

  it('refuses an edit whose ends are on different alignments', () => {
    const r = validateRouteEdit(
      {
        kind: 'replace-section',
        label: 'wrong end',
        origin,
        divergeAnchorId: tokaidoJunction.properties.id, // path-east
        rejoinAnchorId: manba.properties.id, // variant-saya
        geometry: replacement,
      },
      anchors,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join(' ')).toMatch(/same part of the route/i);
  });

  it('splices the variant rather than adding a second one beside it', () => {
    const edit = makeRouteEdit({
      kind: 'replace-section',
      label: 'Saya start to Manba, snapped',
      origin,
      divergeAnchorId: sayaStart.properties.id,
      rejoinAnchorId: manba.properties.id,
      geometry: replacement,
    });
    const applied = applyRouteEdits(meta, features, [edit], anchors);

    // No new variant: the existing one was modified. Count against the
    // baseline rather than a literal — retraced sections get baked into the
    // shipped data as variants of their own, so the absolute number moves
    // whenever route work lands, while the contract being tested does not.
    const variantsBefore = features.filter((f) => f.properties.featureRole === 'variant').length;
    expect(applied.meta.variants).toHaveLength(meta.variants.length);
    expect(applied.features.filter((f) => f.properties.featureRole === 'variant')).toHaveLength(
      variantsBefore,
    );

    const built = buildStretches(applied.meta, applied.features, anchors);
    const line = buildPlanningLine(built.stretches, built.breaks);
    // The change is the difference between the two sections, nothing more.
    const delta = line.lengthKm - baseLine.lengthKm;
    expect(Math.abs(delta)).toBeLessThan(3);
    expect(built.stretches).toHaveLength(1);
    expect(built.breaks).toHaveLength(0);
  });

  it('never walks the Saya twice, whatever the edit claims', () => {
    // Force the failing shape directly: an edit leaving the Tokaido at the same
    // junction the Saya leaves from.
    const bad = makeRouteEdit({
      kind: 'replace-section',
      label: 'second alignment from the same junction',
      origin,
      divergeAnchorId: tokaidoJunction.properties.id,
      rejoinAnchorId: null,
      geometry: replacement,
    });
    const applied = applyRouteEdits(meta, features, [bad], anchors);
    const built = buildStretches(applied.meta, applied.features, anchors);
    const line = buildPlanningLine(built.stretches, built.breaks);
    // Whichever alignment wins, the route must not gain the length of both.
    expect(line.lengthKm).toBeLessThan(baseLine.lengthKm + 15);
  });

  it('introduces no jump when a variant is spliced', () => {
    const edit = makeRouteEdit({
      kind: 'replace-section',
      label: 'spliced',
      origin,
      divergeAnchorId: sayaStart.properties.id,
      rejoinAnchorId: manba.properties.id,
      geometry: replacement,
    });
    const built = buildStretches(...(() => {
      const a = applyRouteEdits(meta, features, [edit], anchors);
      return [a.meta, a.features, anchors] as const;
    })());
    for (const st of built.stretches) {
      for (let i = 1; i < st.positions.length; i++) {
        expect(haversineKm(st.positions[i - 1]!, st.positions[i]!)).toBeLessThan(2);
      }
    }
  });
});

/**
 * Retracing a section and adopting the improved version is the normal way to
 * make one better. Until 2026-08-23 the first version adopted kept winning and
 * the newer one sat in the list doing nothing — present in the app, absent from
 * the route, with no way to tell.
 */
describe('two edits covering the same stretch', () => {
  const odawara = anchorAt('小田原宿');
  const sanmaibashi = anchorAt('三枚橋');

  const between = (bow: number, steps: number): Position[] => {
    const a = coord('小田原宿');
    const b = coord('三枚橋');
    return Array.from({ length: steps + 1 }, (_, i) => {
      const t = i / steps;
      return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t + Math.sin(t * Math.PI) * bow] as Position;
    });
  };

  const mk = (label: string, geometry: Position[], createdAt: string) => ({
    ...makeRouteEdit({
      kind: 'replace-section' as const,
      label,
      origin,
      divergeAnchorId: odawara.properties.id,
      rejoinAnchorId: sanmaibashi.properties.id,
      geometry,
    }),
    createdAt,
  });

  const older = mk('first attempt', between(0.004, 20), '2026-08-23T10:00:00.000Z');
  const newer = mk('retraced', between(0.004, 60), '2026-08-23T11:00:00.000Z');

  const countPoints = (edits: RouteEdit[]): number => {
    const a = applyRouteEdits(meta, features, edits, anchors);
    const f = a.features.find((x) => x.properties.title === 'retraced' || x.properties.title === 'first attempt');
    return f ? f.geometry.coordinates.length : 0;
  };

  it('walks the newer one, whichever order they were adopted in', () => {
    for (const pair of [[older, newer], [newer, older]]) {
      const a = applyRouteEdits(meta, features, pair, anchors);
      const built = buildStretches(a.meta, a.features, anchors);
      const line = buildPlanningLine(built.stretches, built.breaks);
      const withNewer = buildPlanningLine(
        ...(() => {
          const one = applyRouteEdits(meta, features, [newer], anchors);
          const b = buildStretches(one.meta, one.features, anchors);
          return [b.stretches, b.breaks] as const;
        })(),
      );
      expect(line.lengthKm).toBeCloseTo(withNewer.lengthKm, 3);
      expect(line.positions.length).toBe(withNewer.positions.length);
    }
  });

  it('names the one it replaced, so it is not a silent no-op', () => {
    const a = applyRouteEdits(meta, features, [older, newer], anchors);
    expect(a.superseded).toEqual([older.id]);
  });

  it('supersedes nothing when the ranges do not overlap', () => {
    const elsewhere = {
      ...makeRouteEdit({
        kind: 'replace-section' as const,
        label: 'somewhere else',
        origin,
        divergeAnchorId: anchorAt('掛川宿').properties.id,
        rejoinAnchorId: anchorAt('袋井宿').properties.id,
        geometry: [coord('掛川宿'), [138.0, 34.76], coord('袋井宿')],
      }),
      createdAt: '2026-08-23T12:00:00.000Z',
    };
    expect(applyRouteEdits(meta, features, [newer, elsewhere], anchors).superseded).toEqual([]);
  });

  it('ignores an inactive edit rather than letting it supersede anything', () => {
    const a = applyRouteEdits(meta, features, [{ ...newer, active: false }, older], anchors);
    expect(a.superseded).toEqual([]);
    expect(countPoints([{ ...newer, active: false }, older])).toBeGreaterThan(0);
  });
});
