import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DaysFileSchema, RouteMetaSchema } from '../../src/data/schemas';

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
 * This is deliberately a sum rather than a per-day assertion. Per-day figures
 * are planning decisions and move for good reasons; what cannot move is that
 * they add up to the road.
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

  it('gives every walking day a distance and a door-to-door figure', () => {
    for (const d of walks) {
      expect(d.nominalDistanceKm, d.id).toBeGreaterThan(0);
      // Access walking is on top of the route, never less than it.
      expect(d.likelyDoorToDoorKm ?? 0, d.id).toBeGreaterThanOrEqual(d.nominalDistanceKm ?? 0);
    }
  });
});
