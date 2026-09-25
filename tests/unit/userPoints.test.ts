import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AnchorsFileSchema, RouteFileSchema, RouteMetaSchema, WaypointsFileSchema, DaysFileSchema } from '../../src/data/schemas';
import { buildStretches } from '../../src/data/load';
import type { Dataset } from '../../src/data/load';
import {
  USER_POINT_TYPES,
  makeUserPoint,
  parseCoordinates,
  publicOnly,
  typeSpec,
  usableAsDayEnd,
  validateUserPoint,
} from '../../src/lib/userPoints';
import { buildPlanningLine } from '../../src/lib/planningLine';
import { anchorAlongKm, buildDefaultDayPlans, buildLegs } from '../../src/lib/dayPlan';
import { dayGpx, referenceLayerGeoJson } from '../../src/lib/routeExport';
import { haversineKm } from '../../src/lib/geo';
import { projectOntoRoute } from '../../src/lib/dayContext';
import type { Position } from '../../src/lib/geo';

const D = join(process.cwd(), 'public', 'data');
const read = (f: string): unknown => JSON.parse(readFileSync(join(D, f), 'utf8')) as unknown;

const routeMeta = RouteMetaSchema.parse(read('route-meta.json'));
const routeFeatures = RouteFileSchema.parse(read('route.geojson')).features;
const anchors = AnchorsFileSchema.parse(read('anchors.geojson')).features;
const waypoints = WaypointsFileSchema.parse(read('waypoints.geojson')).features;
const days = DaysFileSchema.parse(read('days.json')).days;
const { stretches, breaks } = buildStretches(routeMeta, routeFeatures, anchors);
const line = buildPlanningLine(stretches, breaks);

const odawara = anchors.find((a) => a.properties.stationNumber === 9)!;
const onRouteCoord = { lat: odawara.geometry.coordinates[1], lon: odawara.geometry.coordinates[0] };

describe('makeUserPoint', () => {
  it('snaps an anchor onto the route so it cannot add distance to two days', () => {
    const placed: Position = [onRouteCoord.lon, onRouteCoord.lat + 0.0027]; // ~300 m off the line
    const p = makeUserPoint(
      { role: 'anchor', type: 'day-end', title: 'Stop here', lat: placed[1], lon: placed[0] },
      stretches,
    );
    expect(p.onRoute).not.toBeNull();
    expect(p.onRoute!.offRouteKm).toBe(0);
    // It moved ONTO the line — re-projecting the saved position finds it there.
    expect(projectOntoRoute(stretches, [p.lon, p.lat] as Position)!.offRouteKm).toBeLessThan(0.001);
    // And it stayed near where it was put, rather than jumping to a station.
    expect(haversineKm([p.lon, p.lat] as Position, placed)).toBeLessThan(0.4);
    expect(usableAsDayEnd(p)).toBe(true);
  });

  it('leaves a waypoint where it was put, and records how far off the line it is', () => {
    const p = makeUserPoint(
      { role: 'waypoint', type: 'hotel', title: 'Hotel', lat: onRouteCoord.lat + 0.0045, lon: onRouteCoord.lon },
      stretches,
    );
    expect(p.lat).toBeCloseTo(onRouteCoord.lat + 0.0045, 6);
    expect(p.onRoute!.offRouteKm).toBeGreaterThan(0.3);
    expect(usableAsDayEnd(p)).toBe(false);
  });

  it('defaults lodging to private and everything else to public', () => {
    const hotel = makeUserPoint({ role: 'waypoint', type: 'hotel', title: 'H', ...onRouteCoord }, stretches);
    const water = makeUserPoint({ role: 'waypoint', type: 'water', title: 'W', ...onRouteCoord }, stretches);
    expect(hotel.classification).toBe('private');
    expect(water.classification).toBe('public');
  });

  it('lets an explicit classification override the default', () => {
    const p = makeUserPoint(
      { role: 'waypoint', type: 'hotel', title: 'H', ...onRouteCoord, classification: 'public' },
      stretches,
    );
    expect(p.classification).toBe('public');
  });

  it('records provenance that never claims verification', () => {
    const p = makeUserPoint({ role: 'waypoint', type: 'water', title: 'W', ...onRouteCoord }, stretches);
    expect(p.source).toBe('user');
    expect(p.confidence).toBe('user-placed');
    expect(p.verification).toBe('unverified');
    expect(p.lastChecked).toBeNull();
  });

  it('keeps the id and creation time when editing', () => {
    const first = makeUserPoint({ role: 'waypoint', type: 'water', title: 'W', ...onRouteCoord }, stretches);
    const edited = makeUserPoint(
      { role: 'waypoint', type: 'water', title: 'W2', ...onRouteCoord, id: first.id, createdAt: first.createdAt },
      stretches,
    );
    expect(edited.id).toBe(first.id);
    expect(edited.createdAt).toBe(first.createdAt);
    expect(edited.title).toBe('W2');
  });

  it('reports no projection when there is no route at all', () => {
    const p = makeUserPoint({ role: 'anchor', type: 'day-end', title: 'X', ...onRouteCoord }, []);
    expect(p.onRoute).toBeNull();
    expect(usableAsDayEnd(p)).toBe(false);
  });

  it('gives every type a role and a label', () => {
    for (const t of USER_POINT_TYPES) {
      expect(typeSpec(t.id).label.length).toBeGreaterThan(0);
      expect(['anchor', 'waypoint']).toContain(t.role);
    }
  });
});

describe('validateUserPoint', () => {
  const base = { role: 'waypoint' as const, type: 'water' as const, title: 'A place', lat: 35, lon: 139 };

  it('accepts a complete point', () => {
    expect(validateUserPoint(base).ok).toBe(true);
  });

  const rejects = (label: string, patch: Record<string, unknown>, match: RegExp): void => {
    it(label, () => {
      const r = validateUserPoint({ ...base, ...patch });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.errors.join(' ')).toMatch(match);
    });
  };

  rejects('an empty name', { title: '   ' }, /name/i);
  rejects('an absurdly long name', { title: 'x'.repeat(90) }, /too long/i);
  rejects('a latitude out of range', { lat: 91 }, /latitude/i);
  rejects('a longitude out of range', { lon: -181 }, /longitude/i);
  rejects('a missing latitude', { lat: undefined }, /latitude/i);
  rejects('an unknown type', { type: 'teleporter' }, /type/i);
});

describe('parseCoordinates', () => {
  it('reads comma and space separated pairs', () => {
    expect(parseCoordinates('35.2560, 139.1550')).toEqual({ lat: 35.256, lon: 139.155 });
    expect(parseCoordinates(' 35.256 139.155 ')).toEqual({ lat: 35.256, lon: 139.155 });
    expect(parseCoordinates('-35.256,-139.155')).toEqual({ lat: -35.256, lon: -139.155 });
  });

  it('refuses nonsense and out-of-range values', () => {
    expect(parseCoordinates('somewhere near Odawara')).toBeNull();
    expect(parseCoordinates('91, 139')).toBeNull();
    expect(parseCoordinates('35, 181')).toBeNull();
    expect(parseCoordinates('35.256')).toBeNull();
  });
});

describe('user anchors as day endpoints', () => {
  it('can be located on the planning line even though they are not vertices', () => {
    const p = makeUserPoint(
      { role: 'anchor', type: 'day-end', title: 'Between stations', lat: onRouteCoord.lat + 0.002, lon: onRouteCoord.lon + 0.002 },
      stretches,
    );
    const feature = {
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: [p.lon, p.lat] as [number, number] },
      properties: { id: p.id },
    } as never;
    const km = anchorAlongKm(line, [feature], p.id);
    expect(km).not.toBeNull();
    expect(km!).toBeCloseTo(p.onRoute!.alongKm, 1);
  });

  it('can end a day, changing exactly two days', () => {
    const legs = buildLegs(line, buildDefaultDayPlans(line, anchors, days), days, anchors);
    const d5 = legs.find((l) => l.plan.walkingDayNumber === 5)!;
    const target = d5.endAlongKm - 6;

    const plans = buildDefaultDayPlans(line, anchors, days).map((p) =>
      p.walkingDayNumber === 5 ? { ...p, endAlongKm: target, endAnchorId: null } : p,
    );
    const after = buildLegs(line, plans, days, anchors);
    expect(after[4]!.distanceKm).toBeCloseTo(d5.distanceKm - 6, 1);
    expect(after[5]!.distanceKm).toBeCloseTo(legs[5]!.distanceKm + 6, 1);
  });
});

describe('privacy in exports', () => {
  const hotel = makeUserPoint(
    { role: 'waypoint', type: 'hotel', title: 'REAL HOTEL BOOKING', notes: 'confirmation in email', ...onRouteCoord },
    stretches,
  );
  const water = makeUserPoint(
    { role: 'waypoint', type: 'water', title: 'Vending machine by the bridge', ...onRouteCoord },
    stretches,
  );
  const points = [hotel, water];

  const dataset = {
    routeMeta,
    routeFeatures,
    anchors,
    waypoints,
    days,
    stretches,
    breaks,
    activeLengthKm: line.lengthKm,
  } as unknown as Dataset;

  it('publicOnly drops private points', () => {
    expect(publicOnly(points).map((p) => p.title)).toEqual(['Vending machine by the bridge']);
  });

  it('the reference layer carries public user points and not private ones', () => {
    const text = referenceLayerGeoJson(dataset, points);
    expect(text).toContain('Vending machine by the bridge');
    expect(text).not.toContain('REAL HOTEL BOOKING');
    expect(text).not.toContain('confirmation in email');
  });

  it('a day GPX carries public user points on that day and not private ones', () => {
    const legs = buildLegs(line, buildDefaultDayPlans(line, anchors, days), days, anchors);
    const d3 = legs.find((l) => l.plan.walkingDayNumber === 3)!;
    const gpx = dayGpx(dataset, d3, new Date('2026-08-20T00:00:00Z'), points);
    expect(gpx).toContain('Vending machine by the bridge');
    expect(gpx).not.toContain('REAL HOTEL BOOKING');
  });

  it('a day GPX omits user points that fall outside that day', () => {
    const legs = buildLegs(line, buildDefaultDayPlans(line, anchors, days), days, anchors);
    const d12 = legs.find((l) => l.plan.walkingDayNumber === 12)!;
    const gpx = dayGpx(dataset, d12, new Date('2026-08-20T00:00:00Z'), points);
    // The vending machine is near Odawara, hundreds of km before day 12.
    expect(gpx).not.toContain('Vending machine by the bridge');
  });
});
