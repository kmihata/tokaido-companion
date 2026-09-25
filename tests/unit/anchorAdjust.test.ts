import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AnchorsFileSchema, RouteFileSchema, RouteMetaSchema } from '../../src/data/schemas';
import { buildStretches } from '../../src/data/load';
import { buildPlanningLine } from '../../src/lib/planningLine';
import { positionAt } from '../../src/lib/planningLine';
import { anchorAlongKm } from '../../src/lib/dayPlan';
import { haversineKm } from '../../src/lib/geo';
import type { Position } from '../../src/lib/geo';
import {
  MAX_ADJUST_KM,
  anchorsOffRoute,
  applyAnchorAdjustments,
  makeAnchorAdjustment,
  structuralAnchorIds,
  validateAnchorAdjustment,
} from '../../src/lib/anchorAdjust';

const D = join(process.cwd(), 'public', 'data');
const read = (f: string): unknown => JSON.parse(readFileSync(join(D, f), 'utf8')) as unknown;

const meta = RouteMetaSchema.parse(read('route-meta.json'));
const features = RouteFileSchema.parse(read('route.geojson')).features;
const anchors = AnchorsFileSchema.parse(read('anchors.geojson')).features;

const base = buildStretches(meta, features, anchors);
const line = buildPlanningLine(base.stretches, base.breaks);

const byJa = (ja: string) => anchors.find((a) => a.properties.titleJa === ja)!;
const kusanagi = byJa('草薙駅前');

describe('anchorsOffRoute', () => {
  it('ranks by the detour the route walks, not by distance from the line', () => {
    const ranked = anchorsOffRoute(line, anchors, []);
    // An anchor that is itself a vertex is zero metres from the route and can
    // still drag it sideways. Ranking on offRouteM alone would hide every one.
    expect(ranked[0]!.detourM).toBeGreaterThan(0);
    expect(ranked[0]!.offRouteM).toBe(0);
  });

  it('finds detours that go out and come back', () => {
    // This named the Kusanagi station-front spur until that section was
    // retraced and the spur stopped existing — the test failed because the
    // route got better. What is being tested is the detector, so assert what a
    // spike is rather than where one happens to be today.
    const ranked = anchorsOffRoute(line, anchors, []);
    const spikes = ranked.filter((r) => r.isSpike && r.detourM >= 10);
    expect(spikes.length).toBeGreaterThan(0);
    for (const sp of spikes) {
      expect(sp.turnDeg).toBeGreaterThanOrEqual(60);
      expect(sp.netTurnDeg).toBeLessThan(30);
    }
  });

  it('calls a dog-leg a corner, not a spike, wherever one occurs', () => {
    // Post towns were laid out with dog-leg junctions, so sharp turns that stay
    // turned are common and are not defects. Naming the anchor was wrong: this
    // test pointed at Tenryugawa Bridge until that section was retraced and the
    // geometry there legitimately changed. Assert the rule instead.
    const ranked = anchorsOffRoute(line, anchors, []);
    const corners = ranked.filter((r) => r.turnDeg >= 60 && r.netTurnDeg >= 30);
    expect(corners.length).toBeGreaterThan(0);
    for (const c of corners) expect(c.isSpike).toBe(false);

    const spikes = ranked.filter((r) => r.turnDeg >= 60 && r.netTurnDeg < 30);
    expect(spikes.length).toBeGreaterThan(0);
    for (const sp of spikes) expect(sp.isSpike).toBe(true);
  });

  it('puts every spike above every corner, however big the corner', () => {
    const ranked = anchorsOffRoute(line, anchors, []);
    const lastSpike = ranked.findLastIndex((r) => r.isSpike);
    const firstCorner = ranked.findIndex((r) => !r.isSpike);
    expect(firstCorner).toBeGreaterThan(lastSpike);
  });

  it('marks which anchors already carry an adjustment', () => {
    const km = anchorAlongKm(line, anchors, kusanagi.properties.id)!;
    const adj = makeAnchorAdjustment(kusanagi, positionAt(line, km + 0.02)!, 'x');
    const ranked = anchorsOffRoute(line, anchors, [adj]);
    expect(ranked.find((r) => r.anchor.properties.id === kusanagi.properties.id)!.adjusted).toBe(true);
  });
});

describe('structuralAnchorIds', () => {
  it('protects the anchors the route model is pinned to', () => {
    const ids = structuralAnchorIds(meta, anchors);
    // The Saya divergence: the anchor whose duplicate put 45 km on the route.
    expect(ids.has(meta.variants[0]!.divergeAnchorId)).toBe(true);
    expect(ids.has(meta.paths[0]!.startAnchorId!)).toBe(true);

    // ...and leaves ordinary anchors alone. Not named: an anchor becomes
    // structural the moment a retrace variant rejoins at it, so any particular
    // anchor can legitimately change sides. Kusanagi did exactly that.
    const ordinary = anchors.find((a) => !ids.has(a.properties.id));
    expect(ordinary).toBeDefined();
    expect(ids.has(ordinary!.properties.id)).toBe(false);
  });

  it('pins the other anchors sitting on the same join', () => {
    const ids = structuralAnchorIds(meta, anchors);
    // 'Saya Kaido start' is not named in the route model, but it sits on the
    // divergence and reports the same phantom spike.
    const start = anchors.find((a) => a.properties.title === 'Saya Kaido start')!;
    expect(ids.has(start.properties.id)).toBe(true);
  });

  it('reads a fork as a spike, which is exactly why it has to be refused', () => {
    const ranked = anchorsOffRoute(line, anchors, [], structuralAnchorIds(meta, anchors));
    const fork = ranked.find((r) => r.anchor.properties.id === meta.variants[0]!.divergeAnchorId)!;
    expect(fork.isSpike).toBe(true);
    expect(fork.structural).toBe(true);
  });
});

describe('validateAnchorAdjustment', () => {
  const km = anchorAlongKm(line, anchors, kusanagi.properties.id)!;

  it('refuses to move an anchor the route model depends on', () => {
    const forkId = meta.variants[0]!.divergeAnchorId;
    const forkKm = anchorAlongKm(line, anchors, forkId)!;
    const p = positionAt(line, forkKm + 0.02)!;
    const r = validateAnchorAdjustment(line, anchors, forkId, p, structuralAnchorIds(meta, anchors));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/detach that join/);
  });

  it('accepts a small move along the route', () => {
    const p = positionAt(line, km + 0.03)!;
    expect(validateAnchorAdjustment(line, anchors, kusanagi.properties.id, p)).toEqual({ ok: true });
  });

  it('refuses a point that is not on the route', () => {
    const p: Position = [kusanagi.geometry.coordinates[0] + 0.01, kusanagi.geometry.coordinates[1]];
    const r = validateAnchorAdjustment(line, anchors, kusanagi.properties.id, p);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/off the route/);
  });

  it('refuses a move further than the cap, even along the route', () => {
    const p = positionAt(line, km + MAX_ADJUST_KM + 0.2)!;
    const r = validateAnchorAdjustment(line, anchors, kusanagi.properties.id, p);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/limit is/);
  });

  it('refuses a move past the next anchor, which would reorder the sections', () => {
    const ordered = anchors
      .map((a) => ({ id: a.properties.id, km: anchorAlongKm(line, anchors, a.properties.id) }))
      .filter((x): x is { id: string; km: number } => x.km !== null)
      .sort((a, b) => a.km - b.km);
    const i = ordered.findIndex((x) => x.id === kusanagi.properties.id);
    const next = ordered[i + 1]!;
    // Pick a neighbour close enough that passing it is still inside the cap.
    if (next.km - km < MAX_ADJUST_KM) {
      const p = positionAt(line, next.km + 0.01)!;
      const r = validateAnchorAdjustment(line, anchors, kusanagi.properties.id, p);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toMatch(/past the one after/);
    }
  });

  it('refuses an anchor id that is not in the data', () => {
    const p = positionAt(line, km)!;
    const r = validateAnchorAdjustment(line, anchors, 'a-nope', p);
    expect(r.ok).toBe(false);
  });
});

describe('applyAnchorAdjustments', () => {
  const km = anchorAlongKm(line, anchors, kusanagi.properties.id)!;

  it('returns the anchors untouched when there is nothing to apply', () => {
    expect(applyAnchorAdjustments(anchors, [])).toBe(anchors);
  });

  it('moves only the adjusted anchor', () => {
    const p = positionAt(line, km + 0.03)!;
    const out = applyAnchorAdjustments(anchors, [makeAnchorAdjustment(kusanagi, p, 'trace leaned')]);
    expect(out).toHaveLength(anchors.length);
    const moved = out.filter(
      (a, i) =>
        a.geometry.coordinates[0] !== anchors[i]!.geometry.coordinates[0] ||
        a.geometry.coordinates[1] !== anchors[i]!.geometry.coordinates[1],
    );
    expect(moved).toHaveLength(1);
    expect(moved[0]!.properties.id).toBe(kusanagi.properties.id);
  });

  it('lands the adjusted anchor on the route, so it still resolves as a day finish', () => {
    const p = positionAt(line, km + 0.03)!;
    const out = applyAnchorAdjustments(anchors, [makeAnchorAdjustment(kusanagi, p, 'trace leaned')]);
    const resolved = anchorAlongKm(line, out, kusanagi.properties.id);
    expect(resolved).not.toBeNull();
    expect(Math.abs(resolved! - (km + 0.03))).toBeLessThan(0.01);
  });

  it('says on the anchor that it was adjusted, so an export cannot claim source provenance', () => {
    const p = positionAt(line, km + 0.03)!;
    const out = applyAnchorAdjustments(anchors, [makeAnchorAdjustment(kusanagi, p, 'trace leaned')]);
    const a = out.find((x) => x.properties.id === kusanagi.properties.id)!;
    expect(a.properties.source).toMatch(/adjusted on device/);
    expect(a.properties.verification).toBe('manually-traced');
  });

  it('removing the adjustment restores exactly what the source published', () => {
    const p = positionAt(line, km + 0.03)!;
    const out = applyAnchorAdjustments(anchors, [makeAnchorAdjustment(kusanagi, p, 'trace leaned')]);
    expect(out).not.toEqual(anchors);
    expect(applyAnchorAdjustments(anchors, [])).toEqual(anchors);
  });
});

describe('makeAnchorAdjustment', () => {
  it('records how far it moved and why', () => {
    const km = anchorAlongKm(line, anchors, kusanagi.properties.id)!;
    const p = positionAt(line, km + 0.04)!;
    const adj = makeAnchorAdjustment(kusanagi, p, '  source trace leaned to the forecourt  ');
    expect(adj.note).toBe('source trace leaned to the forecourt');
    expect(adj.movedKm).toBeGreaterThan(0);
    const from: Position = [kusanagi.geometry.coordinates[0], kusanagi.geometry.coordinates[1]];
    expect(Math.abs(adj.movedKm - haversineKm(from, p))).toBeLessThan(0.001);
  });
});
