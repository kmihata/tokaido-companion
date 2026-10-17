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
import { hiroshigeForDay } from '../../src/lib/hiroshigeForDay';
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
const printsFor = (id: string): string[] => {
  const d = walks.find((x) => x.id === id)!;
  return hiroshigeForDay(dataset, d, legFor(id));
};

/**
 * The defect Kevin found on the phone on 2026-10-16: Walk 4's card listed
 * traditional stations 9, 10 and 11 and showed no prints at all, while Walk 5
 * showed Hakone's. The generator measured stations on the concatenated base
 * paths (518.53 km) and cut them at a running sum of nominal distances on the
 * active route (537.84 km) — two rulers, nineteen kilometres apart.
 */
describe('the prints on a day match the stations on that day', () => {
  it('never lists a station on the card without showing its print', () => {
    for (const d of walks) {
      const shown = new Set(printsFor(d.id));
      for (const sid of d.stationIds) {
        const print = hiroshige.find((h) => h.stationId === sid);
        if (!print) continue;
        expect(shown.has(print.id), `${d.id} lists ${sid} but does not show ${print.id}`).toBe(true);
      }
    }
  });

  it('puts Hakone on the day that crosses Hakone', () => {
    // Hakone-juku sits 1.2 km past the Moto-Hakone lake shore where Walk 4
    // stops, so no interval test on geometry alone will ever reach it. The day
    // names the station; that is what makes the print appear.
    expect(printsFor('d-2026-10-24')).toContain('hr-hakone');
  });

  it('gives every walking day at least one print', () => {
    for (const d of walks) {
      expect(printsFor(d.id).length, `${d.id} has no prints`).toBeGreaterThan(0);
    }
  });

  it('shows all fifty-five prints somewhere across the route', () => {
    const seen = new Set(walks.flatMap((d) => printsFor(d.id)));
    const missing = hiroshige.filter((h) => !seen.has(h.id)).map((h) => `${h.number} ${h.id}`);
    expect(missing, `prints on no day: ${missing.join(', ')}`).toHaveLength(0);
  });

  it('orders them by station number, west to east as walked', () => {
    for (const d of walks) {
      const nums = printsFor(d.id)
        .map((id) => hiroshige.find((h) => h.id === id)?.number ?? -1)
        .filter((n) => n >= 0);
      expect([...nums].sort((a, b) => a - b), d.id).toEqual(nums);
    }
  });

  it('falls back to the generated field when there is no leg to measure', () => {
    const d = walks[3]!;
    expect(hiroshigeForDay(dataset, d, null).length).toBeGreaterThan(0);
  });
});
