import { describe, expect, it } from 'vitest';
import { dayPlanExport } from '../../src/state/dayPlanStore';
import { DAY_PLAN_SCHEMA_VERSION } from '../../src/lib/dayPlan';

const legs = [
  {
    plan: { dayId: 'd1' },
    day: { label: 'Walk 1', date: '2026-10-19' },
    startAlongKm: 0,
    endAlongKm: 20.913,
    distanceKm: 20.913,
    endAnchorId: 'a-005',
  },
  {
    plan: { dayId: 'd2' },
    day: { label: 'Walk 2', date: '2026-10-20' },
    startAlongKm: 20.913,
    endAlongKm: 55.2,
    distanceKm: 34.287,
    endAnchorId: null,
  },
];

const title = (id: string | null): string | null => (id === 'a-005' ? 'Hatchonawate Station' : null);

describe('dayPlanExport', () => {
  it('carries the overrides, which are the restorable part', () => {
    const doc = {
      schemaVersion: DAY_PLAN_SCHEMA_VERSION,
      updatedAt: '2026-09-13T00:00:00Z',
      overrides: { d2: { endAlongKm: 55.2, endAnchorId: null } },
    };
    const out = JSON.parse(dayPlanExport(doc, legs, '0.11.0-traced', title));
    expect(out.kind).toBe('samwise-day-plan');
    expect(out.overrides).toEqual(doc.overrides);
  });

  it('says which route version the distances were measured against', () => {
    // Every retrace lengthens the route and moves the later boundaries, so a
    // plan without its route version cannot be told from a stale one.
    const out = JSON.parse(dayPlanExport(null, legs, '0.11.0-traced', title));
    expect(out.routeDataVersion).toBe('0.11.0-traced');
  });

  it('marks which days were moved by hand and which follow the defaults', () => {
    const doc = {
      schemaVersion: DAY_PLAN_SCHEMA_VERSION,
      updatedAt: '2026-09-13T00:00:00Z',
      overrides: { d2: { endAlongKm: 55.2 } },
    };
    const out = JSON.parse(dayPlanExport(doc, legs, '0.11.0-traced', title));
    expect(out.days[0].moved).toBe(false);
    expect(out.days[1].moved).toBe(true);
  });

  it('names where each day finishes, so the file can be read without the app', () => {
    const out = JSON.parse(dayPlanExport(null, legs, '0.11.0-traced', title));
    expect(out.days[0].finishesAt).toBe('Hatchonawate Station');
    expect(out.days[0].date).toBe('2026-10-19');
    expect(out.days[0].distanceKm).toBeCloseTo(20.91, 2);
  });

  it('carries miles as well as kilometres, derived from the same number', () => {
    const out = JSON.parse(dayPlanExport(null, legs, '0.13.0-traced', title));
    expect(out.days[0].distanceMi).toBeCloseTo(12.99, 1);
    expect(out.days[0].endMi).toBeCloseTo(12.99, 1);
    // Derived, not stored twice: the two must never be able to disagree beyond
    // the hundredth both are rounded to.
    for (const d of out.days) {
      expect(d.distanceMi).toBeCloseTo(d.distanceKm * 0.621371, 1);
      expect(d.endMi).toBeCloseTo(d.endKm * 0.621371, 1);
    }
  });

  it('exports a plan that has never been touched rather than refusing', () => {
    // A default plan is still worth having on disk: it records what the
    // boundaries were at a given route version.
    const out = JSON.parse(dayPlanExport(null, legs, '0.11.0-traced', title));
    expect(out.overrides).toEqual({});
    expect(out.days).toHaveLength(2);
  });
});
