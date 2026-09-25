import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AnchorsFileSchema, DaysFileSchema, RouteFileSchema, RouteMetaSchema } from '../../src/data/schemas';
import { buildStretches } from '../../src/data/load';
import { buildPlanningLine, positionAt } from '../../src/lib/planningLine';
import {
  anchorAlongKm,
  anchorsBetween,
  applyOverrides,
  buildDefaultDayPlans,
  buildLegs,
  emptyDayPlanDocument,
  moveDayEnd,
  planTotals,
} from '../../src/lib/dayPlan';
import { haversineKm, lineLengthKm } from '../../src/lib/geo';
import type { Position } from '../../src/lib/geo';

const D = join(process.cwd(), 'public', 'data');
const read = (f: string): unknown => JSON.parse(readFileSync(join(D, f), 'utf8')) as unknown;

const meta = RouteMetaSchema.parse(read('route-meta.json'));
const features = RouteFileSchema.parse(read('route.geojson')).features;
const anchors = AnchorsFileSchema.parse(read('anchors.geojson')).features;
const days = DaysFileSchema.parse(read('days.json')).days;

const { stretches, breaks } = buildStretches(meta, features, anchors);
const line = buildPlanningLine(stretches, breaks);
const defaults = buildDefaultDayPlans(line, anchors, days);
const legs = buildLegs(line, defaults, days, anchors);

describe('anchorAlongKm', () => {
  it('locates an anchor on the planning line', () => {
    const odawara = anchors.find((a) => a.properties.stationNumber === 9)!;
    const km = anchorAlongKm(line, anchors, odawara.properties.id);
    expect(km).not.toBeNull();

    // The contract is that the distance LANDS ON the anchor, not that it equals
    // the anchor's own `alongKm`. Those are two different measurements: stored
    // `alongKm` is distance along the anchor's base path, while this is distance
    // along the ASSEMBLED line, and every active variant upstream pushes them
    // apart. They agreed until 2026-09-20, when retracing Shinagawa to
    // Rokugobashi added 721 m upstream and moved Odawara down the planning line
    // without moving Odawara. Assert the round trip, which cannot drift.
    const at = positionAt(line, km!);
    expect(at).not.toBeNull();
    expect(haversineKm(at as Position, odawara.geometry.coordinates as Position)).toBeLessThan(0.01);
  });

  it('returns null for an anchor that is not on the active line', () => {
    // The Miya ferry landing sits on the spur the active Saya variant skips.
    const landing = anchors.find((a) => a.properties.titleJa === '七里の渡')!;
    expect(anchorAlongKm(line, anchors, landing.properties.id)).toBeNull();
  });

  it('returns null for an unknown id', () => {
    expect(anchorAlongKm(line, anchors, 'nope')).toBeNull();
  });
});

describe('buildDefaultDayPlans', () => {
  it('produces one plan per walking day, in order', () => {
    expect(defaults).toHaveLength(15);
    expect(defaults.map((p) => p.walkingDayNumber)).toEqual(
      Array.from({ length: 15 }, (_, i) => i + 1),
    );
  });

  it('ends every day further along than the one before', () => {
    for (let i = 1; i < defaults.length; i++) {
      expect(defaults[i]!.endAlongKm).toBeGreaterThan(defaults[i - 1]!.endAlongKm);
    }
  });

  it('finishes the last day at the end of the route', () => {
    expect(defaults.at(-1)!.endAlongKm).toBeCloseTo(line.lengthKm, 6);
  });

  it('snaps every default endpoint to a named anchor', () => {
    for (const p of defaults) {
      expect(p.endAnchorId, `day ${p.walkingDayNumber}`).toBeTruthy();
    }
  });
});

describe('buildLegs', () => {
  it('accounts for the whole route with no gaps or overlaps', () => {
    expect(legs[0]!.startAlongKm).toBe(0);
    for (let i = 1; i < legs.length; i++) {
      expect(legs[i]!.startAlongKm).toBeCloseTo(legs[i - 1]!.endAlongKm, 9);
    }
    expect(legs.at(-1)!.endAlongKm).toBeCloseTo(line.lengthKm, 6);
    expect(legs.reduce((t, l) => t + l.distanceKm, 0)).toBeCloseTo(line.lengthKm, 6);
  });

  it('measures each leg geometry as the distance it reports', () => {
    for (const l of legs) {
      expect(lineLengthKm(l.positions), `day ${l.plan.walkingDayNumber}`).toBeCloseTo(l.distanceKm, 1);
    }
  });

  it('compares each day against the draft schedule', () => {
    // The draft is whatever the day currently declares, and it moves when an
    // endpoint moves — Walk 5's went 38.7 -> 42.0 km on 2026-09-25 when the
    // finish came back to the Fuji hotel. What must hold is that the leg
    // carries the day's own figure and the delta is measured against it.
    const d5 = legs.find((l) => l.plan.walkingDayNumber === 5)!;
    const declared = days.find((d) => d.walkingDayNumber === 5)!.nominalDistanceKm!;
    expect(d5.draftKm).toBe(declared);
    expect(d5.deltaKm).toBeCloseTo(d5.distanceKm - declared, 6);
  });

  /**
   * The finding that made Phase 2 worth building. Walking the Saya Kaido on
   * land makes Miya to Yokkaichi roughly 51 km, against the 40.2 km the draft
   * carried — and the draft figure was the historical SEA crossing plus
   * Kuwana to Yokkaichi, never a walkable distance.
   *
   * Resolved 2026-09-13 by ending Walk 11 at Manba Ohashi instead of the Saya
   * junction, so the load splits across two days and the Nagoya recovery day
   * stays a recovery day. The delta against the draft is the part that still
   * matters: the draft figure was never a walkable distance and still is not.
   */
  it('no longer leaves Day 12 unwalkable, and the distance it shed is still on the route', () => {
    const d12 = legs.find((l) => l.plan.walkingDayNumber === 12)!;
    expect(d12.distanceKm).toBeLessThan(45);

    // The delta has to be VISIBLE, not positive. For every other day a positive
    // delta means finer tracing found distance the draft missed. Day 12's draft
    // of 40.2 km is the HISTORICAL figure, and 27.5 km of it is the Seven-ri sea
    // crossing that no modern walking line reproduces — so the sign here says
    // nothing about the route and everything about which century is being
    // measured. It went negative on 2026-09-16 when the day was shortened to
    // Machiya Bridge, and that is not a regression.
    expect(d12.deltaKm).not.toBeNull();

    // This used to assert that Walks 11 and 12 together came to more than
    // 85 km, on the reasoning that Walk 11 had absorbed what Walk 12 shed. That
    // held for about a day. Walk 12 was 51 km when it started at Miya; it
    // shortened when Walk 11 was extended to Manba Ohashi, and shortened again
    // when Walk 10 was extended to the Toeicho crossing and took load off Walk
    // 11 in turn. The sum of any two of them is not a stable quantity.
    //
    // The ground is. However the boundaries inside it move, Walks 10 to 12
    // cover exactly the stretch between where Walk 9 stops and where Walk 12
    // ends, and none of them may be unwalkable.
    const block = [10, 11, 12].map((n) => legs.find((l) => l.plan.walkingDayNumber === n)!);
    const d9 = legs.find((l) => l.plan.walkingDayNumber === 9)!;
    const walked = block.reduce((t, l) => t + l.distanceKm, 0);
    expect(walked).toBeCloseTo(block[2]!.endAlongKm - d9.endAlongKm, 1);
    for (const l of block) expect(l.distanceKm).toBeLessThan(45);
  });

  it('holds the longest day under 45 km, and names any that are not', () => {
    // Rewritten twice in one day, both times because the schedule genuinely
    // changed: first when Walk 4 moved to Lake Ashi and pushed 14.7 km onto
    // Walk 5, then when Walks 5-8 and 11 were rebalanced against rail.
    //
    // The 40 km line was calibrated when days ran 21 to 55 km and a handful
    // were monstrous. The spread is now 21 to 44, so "over 40" catches five
    // ordinary days and says nothing. What matters is that nothing is
    // unwalkable and that the worst day is named when it moves.
    const longest = legs.reduce((m, l) => (l.distanceKm > m.distanceKm ? l : m), legs[0]!);
    expect(longest.distanceKm).toBeLessThan(45);
    const over45 = legs.filter((l) => l.distanceKm > 45).map((l) => l.plan.walkingDayNumber);
    expect(over45).toEqual([]);
  });

  it('totals close to the route length with a mean around 35 km', () => {
    const t = planTotals(legs);
    expect(t.totalKm).toBeCloseTo(line.lengthKm, 6);
    expect(t.meanKm).toBeGreaterThan(33);
    expect(t.meanKm).toBeLessThan(37);
  });

  it('reports no break inside any day, because the only break is at the end', () => {
    for (const l of legs) expect(l.breakInside).toBeNull();
  });

  it('has no continuation until one is chosen', () => {
    for (const l of legs) expect(l.continuation).toBeNull();
  });
});

describe('continuation routes', () => {
  it('extends beyond the planned end and overlaps before it', () => {
    const plans = defaults.map((p) =>
      p.walkingDayNumber === 4 ? { ...p, continueToAlongKm: p.endAlongKm + 8 } : p,
    );
    const l = buildLegs(line, plans, days, anchors).find((x) => x.plan.walkingDayNumber === 4)!;
    expect(l.continuation).not.toBeNull();
    expect(l.continuation!.extraKm).toBeCloseTo(8, 1);
    expect(l.continuation!.overlapKm).toBeCloseTo(3, 1);
    // Starting before the planned end is what makes switching routes easy.
    expect(lineLengthKm(l.continuation!.positions)).toBeCloseTo(11, 0);
  });

  it('ignores a continuation that does not go past the end', () => {
    const plans = defaults.map((p) =>
      p.walkingDayNumber === 4 ? { ...p, continueToAlongKm: p.endAlongKm - 5 } : p,
    );
    const l = buildLegs(line, plans, days, anchors).find((x) => x.plan.walkingDayNumber === 4)!;
    expect(l.continuation).toBeNull();
  });

  it('prefers an anchor over a stored distance', () => {
    const seki = anchors.find((a) => a.properties.stationNumber === 47)!;
    const plans = defaults.map((p) =>
      p.walkingDayNumber === 12
        ? { ...p, continueToAlongKm: 0, continueToAnchorId: seki.properties.id }
        : p,
    );
    const l = buildLegs(line, plans, days, anchors).find((x) => x.plan.walkingDayNumber === 12)!;
    expect(l.continuation!.toAlongKm).toBeCloseTo(anchorAlongKm(line, anchors, seki.properties.id)!, 1);
  });
});

describe('moveDayEnd', () => {
  it('moves a boundary and changes exactly two days', () => {
    const before = buildLegs(line, defaults, days, anchors);
    const target = defaults.find((p) => p.walkingDayNumber === 5)!;
    const r = moveDayEnd(defaults, line, target.dayId, target.endAlongKm - 5);
    expect(r.ok).toBe(true);
    const after = buildLegs(line, r.plans, days, anchors);
    expect(after[4]!.distanceKm).toBeCloseTo(before[4]!.distanceKm - 5, 1);
    expect(after[5]!.distanceKm).toBeCloseTo(before[5]!.distanceKm + 5, 1);
    for (const i of [0, 1, 2, 3, 6, 7, 14]) {
      expect(after[i]!.distanceKm, `day ${i + 1}`).toBeCloseTo(before[i]!.distanceKm, 6);
    }
  });

  it('refuses to move a boundary past the previous day', () => {
    const p = defaults.find((x) => x.walkingDayNumber === 5)!;
    const r = moveDayEnd(defaults, line, p.dayId, 10);
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/before the one that precedes/i);
  });

  it('refuses to move a boundary past the next day', () => {
    const p = defaults.find((x) => x.walkingDayNumber === 5)!;
    const r = moveDayEnd(defaults, line, p.dayId, line.lengthKm - 1);
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/past the end of the next day/i);
  });

  it('refuses to move the last day, which ends where the route ends', () => {
    const last = defaults.at(-1)!;
    const r = moveDayEnd(defaults, line, last.dayId, 400);
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/last day/i);
  });

  it('clears the anchor when moved to a raw distance, and sets it when given one', () => {
    const p = defaults.find((x) => x.walkingDayNumber === 5)!;
    const moved = moveDayEnd(defaults, line, p.dayId, p.endAlongKm - 5).plans;
    expect(moved.find((x) => x.dayId === p.dayId)!.endAnchorId).toBeNull();

    const kanbara = anchors.find((a) => a.properties.stationNumber === 15)!;
    const km = anchorAlongKm(line, anchors, kanbara.properties.id)!;
    const snapped = moveDayEnd(defaults, line, p.dayId, km, kanbara.properties.id).plans;
    expect(snapped.find((x) => x.dayId === p.dayId)!.endAnchorId).toBe(kanbara.properties.id);
  });

  it('leaves the plan untouched for an unknown day', () => {
    const r = moveDayEnd(defaults, line, 'not-a-day', 100);
    expect(r.ok).toBe(false);
    expect(r.plans).toHaveLength(defaults.length);
  });
});

describe('anchorsBetween', () => {
  it('lists candidate endpoints in order, exclusive of the bounds', () => {
    const d5 = legs.find((l) => l.plan.walkingDayNumber === 5)!;
    const candidates = anchorsBetween(line, anchors, d5.startAlongKm, d5.endAlongKm);
    expect(candidates.length).toBeGreaterThan(2);
    for (let i = 1; i < candidates.length; i++) {
      expect(candidates[i]!.alongKm).toBeGreaterThan(candidates[i - 1]!.alongKm);
    }
    expect(candidates[0]!.alongKm).toBeGreaterThan(d5.startAlongKm);
    expect(candidates.at(-1)!.alongKm).toBeLessThan(d5.endAlongKm);
  });
});

describe('applyOverrides', () => {
  it('returns the defaults untouched when there are none', () => {
    expect(applyOverrides(defaults, null)).toEqual(defaults);
    expect(applyOverrides(defaults, emptyDayPlanDocument())).toEqual(defaults);
  });

  it('applies a stored override to one day only', () => {
    const target = defaults[4]!;
    const doc = { ...emptyDayPlanDocument(), overrides: { [target.dayId]: { endAlongKm: 150 } } };
    const applied = applyOverrides(defaults, doc);
    expect(applied[4]!.endAlongKm).toBe(150);
    expect(applied[3]).toEqual(defaults[3]);
    expect(applied[5]).toEqual(defaults[5]);
  });
});
