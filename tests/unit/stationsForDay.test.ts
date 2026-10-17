import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  AnchorsFileSchema,
  DaysFileSchema,
  RouteFileSchema,
  RouteMetaSchema,
} from '../../src/data/schemas';
import { buildStretches } from '../../src/data/load';
import { buildPlanningLine } from '../../src/lib/planningLine';
import { buildDefaultDayPlans, buildLegs } from '../../src/lib/dayPlan';
import { hiroshigeForStations, stationsForDay } from '../../src/lib/stationsForDay';
import type { Dataset } from '../../src/data/load';

const DATA = join(process.cwd(), 'public', 'data');
const read = (f: string): Record<string, unknown> =>
  JSON.parse(readFileSync(join(DATA, f), 'utf8')) as Record<string, unknown>;

const anchors = AnchorsFileSchema.parse(read('anchors.geojson')).features;
const { stretches, breaks } = buildStretches(
  RouteMetaSchema.parse(read('route-meta.json')),
  RouteFileSchema.parse(read('route.geojson')).features,
  anchors,
);
const line = buildPlanningLine(stretches, breaks);
const days = DaysFileSchema.parse(read('days.json')).days;
const legs = buildLegs(line, buildDefaultDayPlans(line, anchors, days), days, anchors);

const stations = read('stations.json')['stations'] as Dataset['stations'];
const hiroshige = read('hiroshige.json')['images'] as Dataset['hiroshige'];
const dataset = { stations, hiroshige } as unknown as Dataset;

const walks = days.filter((d) => d.kind === 'walk');
const legFor = (id: string) => legs.find((l) => l.plan.dayId === id) ?? null;
const forDay = (id: string) => {
  const d = walks.find((x) => x.id === id)!;
  return stationsForDay(dataset, d, legFor(id), line);
};
const names = (id: string) => forDay(id).map((s) => s.name);
const printsOf = (id: string) => {
  const d = walks.find((x) => x.id === id)!;
  return hiroshigeForStations(dataset, forDay(id), d);
};

/**
 * The defect Kevin found on 2026-10-16: Walk 4's card listed stations 9, 10
 * and 11 and showed no prints, while Walk 5 showed Hakone's. The station list
 * and the prints came from different places. They now come from one.
 */
describe('a day shows the stations that are on it', () => {
  it('builds the prints from the same list it shows', () => {
    for (const d of walks) {
      const shown = forDay(d.id);
      const prints = new Set(printsOf(d.id));
      expect(prints.size, `${d.id}`).toBe(shown.length);
      for (const s of shown) {
        const p = hiroshige.find((h) => h.stationId === s.id);
        expect(p && prints.has(p.id), `${d.id} shows ${s.name} with no print`).toBe(true);
      }
    }
  });

  it('keeps Hakone on the day that crosses Hakone', () => {
    // 1.2 km past the Moto-Hakone lake shore where the day stops.
    expect(names('d-2026-10-24')).toContain('Hakone-juku');
    expect(printsOf('d-2026-10-24')).toContain('hr-hakone');
  });

  it('drops the station a day only points at', () => {
    // Walk 4 named Mishima, which is 16 km and a mountain down the far side.
    expect(names('d-2026-10-24')).not.toContain('Mishima-juku');
    expect(printsOf('d-2026-10-24')).not.toContain('hr-mishima');
    expect(names('d-2026-10-25')).toContain('Mishima-juku');
  });

  it('keeps the station a day stops just short of', () => {
    // Walk 13 ends at Ono-cho, 2.1 km before Seki-juku.
    expect(names('d-2026-11-04')).toContain('Seki-juku');
  });

  it('gives every walking day at least one station, in walked order', () => {
    for (const d of walks) {
      const nums = forDay(d.id)
        .map((s) => s.number)
        .filter((n): n is number => n !== null);
      expect(nums.length, `${d.id} has no stations`).toBeGreaterThan(0);
      expect([...nums].sort((a, b) => a - b), d.id).toEqual(nums);
    }
  });

  it('shows all fifty-five prints somewhere across the route', () => {
    const seen = new Set(walks.flatMap((d) => printsOf(d.id)));
    const missing = hiroshige.filter((h) => !seen.has(h.id)).map((h) => `${h.number}`);
    expect(missing, `prints on no day: ${missing.join(', ')}`).toHaveLength(0);
  });

  it('falls back to what the day names when there is no line to measure', () => {
    const d = walks[3]!;
    const fallback = stationsForDay(dataset, d, null, null);
    expect(fallback.map((s) => s.id)).toEqual(d.stationIds);
  });
});
