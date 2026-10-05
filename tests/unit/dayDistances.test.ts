import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AnchorsFileSchema, DaysFileSchema, RouteFileSchema, RouteMetaSchema } from '../../src/data/schemas';
import { buildStretches } from '../../src/data/load';
import { buildPlanningLine } from '../../src/lib/planningLine';
import { buildDefaultDayPlans } from '../../src/lib/dayPlan';

/**
 * The walking days must account for the whole route, and nothing twice.
 *
 * On 2026-10-01 they summed to 511.30 km against a 537.21 km route — 25.91 km
 * that existed in the plan but not in the numbers on screen. The endpoints had
 * moved repeatedly through September and only the days touched at the time were
 * recomputed; the rest kept figures from the original balancing draft.
 *
 * The worst was Walk 10, displayed as 27.5 km when it is 42.7 — the longest day
 * on the route showing as the fourth shortest, a nine-mile understatement on a
 * day with no recovery after it. Kevin caught it by noticing the totals looked
 * low, which is not a method that scales.
 *
 * The sum was the original check, and it was too weak: errors in opposite
 * directions cancel, and on 2026-10-05 Walks 5 and 6 were found transposed
 * (42.0/41.9 against a measured 41.89/42.02) while the total stayed correct.
 * The per-day assertion below measures each day's span between its day-end
 * anchors on the assembled route, so it moves when an endpoint legitimately
 * moves and fails when a figure is merely stale.
 */
const read = (f: string): unknown =>
  JSON.parse(readFileSync(join(process.cwd(), 'public', 'data', f), 'utf8')) as unknown;

describe('the walking days account for the whole route', () => {
  const days = DaysFileSchema.parse(read('days.json')).days;
  const meta = RouteMetaSchema.parse(read('route-meta.json'));
  const walks = days.filter((d) => d.kind === 'walk');

  it('sums the day distances to the active route, within a kilometre', () => {
    const sum = walks.reduce((t, d) => t + (d.nominalDistanceKm ?? 0), 0);
    expect(Math.abs(sum - meta.totals.activeWalkingKm)).toBeLessThan(1);
  });

  /**
   * Each day against the road, not just the total.
   *
   * The day-end anchors define where a day stops, so this measures the span
   * between them on the assembled route and compares it to the figure the app
   * displays. Tolerance is 150 m: the shipped values are rounded to 0.1 km, so
   * 50 m of that is rounding and the rest is slack for a retrace nudging an
   * anchor's position along the line.
   */
  it('matches every day against the span its anchors actually cover', () => {
    const anchors = AnchorsFileSchema.parse(read('anchors.geojson')).features;
    const { stretches, breaks } = buildStretches(
      meta,
      RouteFileSchema.parse(read('route.geojson')).features,
      anchors,
    );
    const plans = buildDefaultDayPlans(buildPlanningLine(stretches, breaks), anchors, days);
    let previous = 0;
    for (const p of plans) {
      const measured = p.endAlongKm - previous;
      previous = p.endAlongKm;
      const day = walks.find((d) => d.id === p.dayId);
      if (!day) continue;
      expect(
        Math.abs((day.nominalDistanceKm ?? 0) - measured),
        `${p.dayId} shows ${day.nominalDistanceKm} km; its anchors span ${measured.toFixed(2)} km`,
      ).toBeLessThan(0.15);
    }
  });

  it('gives every walking day a distance and a door-to-door figure', () => {
    for (const d of walks) {
      expect(d.nominalDistanceKm, d.id).toBeGreaterThan(0);
      // Access walking is on top of the route, never less than it.
      expect(d.likelyDoorToDoorKm ?? 0, d.id).toBeGreaterThanOrEqual(d.nominalDistanceKm ?? 0);
    }
  });
});

/**
 * A superlative in a day's text is a claim about the other days, and it rots.
 *
 * On 2026-10-05 Kevin read Walk 5's card, which said "Longest day of the trip
 * after Walk 7", and asked why — because Walk 7 is 30.3 km and one of the
 * shortest. The sentence was true when written: Walk 7 then finished at Nissaka
 * and was longer. The Shimada split of 2026-09-24 cut it, and the claim quietly
 * inverted. The same rot had put "Walk 12 … 44.4 km, the longest day on the
 * route, with 0.6 km of headroom" in the at-risk ledger for a day that measures
 * 34.8 km with ten kilometres of headroom.
 *
 * The sum test above could not catch either, because both figures were right —
 * it was the prose about them that was wrong. So this checks the sentences.
 */
describe('what the day notes claim about each other', () => {
  const days = DaysFileSchema.parse(read('days.json')).days;
  const walks = days
    .filter((d) => d.kind === 'walk')
    .map((d) => ({
      id: d.id,
      n: d.walkingDayNumber,
      km: d.nominalDistanceKm ?? 0,
      text: [d.sleepBaseNote, d.tiredDaySummary, d.startLightGuidance, d.plan, d.label]
        .filter(Boolean)
        .join(' '),
    }));
  const ranked = [...walks].sort((a, b) => b.km - a.km);
  const rankOf = (id: string): number => ranked.findIndex((r) => r.id === id) + 1;

  it('never says a day is behind or after a day that is shorter than it', () => {
    for (const d of walks) {
      // "behind Walk 10", "after Walk 7" — the named day must really be longer.
      for (const m of d.text.matchAll(/(?:behind|after)\s+Walk\s+(\d+)/gi)) {
        const named = walks.find((w) => String(w.n) === m[1]);
        if (!named) continue;
        expect(
          named.km,
          `${d.id} (${d.km} km) says it is behind/after Walk ${m[1]} (${named.km} km), which is shorter`,
        ).toBeGreaterThan(d.km);
      }
    }
  });

  it('only lets the actual longest day call itself the longest', () => {
    for (const d of walks) {
      // An unqualified "longest day" — not "third-longest", not "next-longest".
      if (/(?<!-)\blongest day\b/i.test(d.text) && !/-longest day/i.test(d.text)) {
        expect(rankOf(d.id), `${d.id} calls itself the longest day but ranks ${rankOf(d.id)}`).toBe(1);
      }
    }
  });

  it('checks an ordinal superlative against the ranking', () => {
    const words: Record<string, number> = { second: 2, third: 3, fourth: 4, fifth: 5 };
    for (const d of walks) {
      const m = /\b(second|third|fourth|fifth)-longest\b/i.exec(d.text);
      if (!m) continue;
      expect(rankOf(d.id), `${d.id} says it is ${m[1]}-longest`).toBe(words[m[1]!.toLowerCase()]);
    }
  });
});
