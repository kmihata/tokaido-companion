import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  DataIndexSchema,
  DaysFileSchema,
  HiroshigeFileSchema,
  RouteFileSchema,
  StationsFileSchema,
  TripSchema,
  WaypointsFileSchema,
} from '../../src/data/schemas';

const DATA = join(process.cwd(), 'public', 'data');
const read = (f: string): unknown => JSON.parse(readFileSync(join(DATA, f), 'utf8')) as unknown;

describe('shipped fixtures validate against the schemas', () => {
  it('index.json', () => {
    expect(() => DataIndexSchema.parse(read('index.json'))).not.toThrow();
  });
  it('trip.json', () => {
    expect(() => TripSchema.parse(read('trip.json'))).not.toThrow();
  });
  it('days.json', () => {
    expect(() => DaysFileSchema.parse(read('days.json'))).not.toThrow();
  });
  it('stations.json', () => {
    expect(() => StationsFileSchema.parse(read('stations.json'))).not.toThrow();
  });
  it('waypoints.geojson', () => {
    expect(() => WaypointsFileSchema.parse(read('waypoints.geojson'))).not.toThrow();
  });
  it('route.geojson', () => {
    expect(() => RouteFileSchema.parse(read('route.geojson'))).not.toThrow();
  });
  it('hiroshige.json', () => {
    expect(() => HiroshigeFileSchema.parse(read('hiroshige.json'))).not.toThrow();
  });
});

describe('schemas reject malformed data', () => {
  it('rejects a day with a non-ISO date', () => {
    const days = DaysFileSchema.parse(read('days.json'));
    const bad = { ...days, days: [{ ...days.days[0]!, date: '21 Oct 2026' }] };
    expect(DaysFileSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects an unknown day kind', () => {
    const days = DaysFileSchema.parse(read('days.json'));
    const bad = { ...days, days: [{ ...days.days[0]!, kind: 'sightseeing' }] };
    expect(DaysFileSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects an unknown waypoint type', () => {
    const wps = WaypointsFileSchema.parse(read('waypoints.geojson'));
    const first = wps.features[0]!;
    const bad = {
      ...wps,
      features: [{ ...first, properties: { ...first.properties, type: 'teleporter' } }],
    };
    expect(WaypointsFileSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects a route line with fewer than two positions', () => {
    const route = RouteFileSchema.parse(read('route.geojson'));
    const bad = {
      ...route,
      features: [
        {
          ...route.features[0]!,
          geometry: { type: 'LineString' as const, coordinates: [[139, 35] as [number, number]] },
        },
      ],
    };
    expect(RouteFileSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects an invented confidence level', () => {
    const st = StationsFileSchema.parse(read('stations.json'));
    const bad = { ...st, stations: [{ ...st.stations[0]!, confidence: 'pretty sure' }] };
    expect(StationsFileSchema.safeParse(bad).success).toBe(false);
  });
});

describe('referential integrity of the fixtures', () => {
  const days = DaysFileSchema.parse(read('days.json')).days;
  const stations = StationsFileSchema.parse(read('stations.json')).stations;
  const waypoints = WaypointsFileSchema.parse(read('waypoints.geojson')).features;
  const images = HiroshigeFileSchema.parse(read('hiroshige.json')).images;

  const stationIds = new Set(stations.map((s) => s.id));
  const waypointIds = new Set(waypoints.map((w) => w.properties.id));
  const dayIds = new Set(days.map((d) => d.id));
  const imageIds = new Set(images.map((i) => i.id));

  it('has unique ids in every collection', () => {
    expect(stationIds.size).toBe(stations.length);
    expect(waypointIds.size).toBe(waypoints.length);
    expect(dayIds.size).toBe(days.length);
    expect(imageIds.size).toBe(images.length);
  });

  it('resolves every station reference on a day', () => {
    for (const d of days) for (const id of d.stationIds) expect(stationIds.has(id)).toBe(true);
  });

  it('resolves every bailout, hazard, start and end waypoint reference', () => {
    for (const d of days) {
      for (const id of [...d.bailoutWaypointIds, ...d.hazardWaypointIds]) {
        expect(waypointIds.has(id)).toBe(true);
      }
      if (d.fromWaypointId) expect(waypointIds.has(d.fromWaypointId)).toBe(true);
      if (d.toWaypointId) expect(waypointIds.has(d.toWaypointId)).toBe(true);
    }
  });

  it('resolves every Hiroshige reference', () => {
    for (const d of days) for (const id of d.hiroshigeRefIds) expect(imageIds.has(id)).toBe(true);
  });

  it('points every waypoint at days that exist', () => {
    for (const w of waypoints) {
      for (const id of w.properties.dayIds) expect(dayIds.has(id)).toBe(true);
    }
  });

  it('points every Hiroshige record at a station that exists', () => {
    for (const i of images) expect(stationIds.has(i.stationId)).toBe(true);
  });

  it('keeps the day list in date order with unique dates', () => {
    const dates = days.map((d) => d.date);
    expect([...dates].sort()).toEqual(dates);
    expect(new Set(dates).size).toBe(dates.length);
  });

  it('numbers the fifteen walking stages consecutively', () => {
    // Fifteen NUMBERED stages, but sixteen days on which Kevin walks. Walk 8b
    // on 2026-10-29 is the extra: the Shimada split leaves 15.8 km that cannot
    // fit into Walk 8, so the recovery day carries it. It is a walking day for
    // every purpose the app has — a route, a target, daylight, bailouts, a
    // river crossing — and calling it `rest` so the count stayed at fifteen
    // would have made Today show "no route" on a day with a Tenryu crossing
    // in it. It has no stage number, which is what keeps the numbering honest.
    const walks = days.filter((d) => d.kind === 'walk');
    const numbered = walks.filter((d) => typeof d.walkingDayNumber === 'number');
    expect(numbered).toHaveLength(15);
    expect(numbered.map((d) => d.walkingDayNumber)).toEqual(
      Array.from({ length: 15 }, (_, i) => i + 1),
    );
    expect(walks.length - numbered.length).toBe(1);
  });

  it('matches the trip container declared in trip.json', () => {
    const trip = TripSchema.parse(read('trip.json'));
    // `walkingDayCount` counts numbered stages, not days with walking in them;
    // see the stage-numbering test above for why those differ by one.
    expect(
      days.filter((d) => d.kind === 'walk' && typeof d.walkingDayNumber === 'number'),
    ).toHaveLength(trip.walkingDayCount);
    expect(days.filter((d) => d.kind === 'rest')).toHaveLength(trip.recoveryDayCount + 1); // +1 for the protected Kyoto day
    expect(days.filter((d) => d.kind === 'flex')).toHaveLength(trip.flexDayCount);
  });

  it('keeps every coordinate inside a Japan bounding box', () => {
    const check = (lat: number, lon: number): void => {
      expect(lat).toBeGreaterThan(30);
      expect(lat).toBeLessThan(46);
      expect(lon).toBeGreaterThan(128);
      expect(lon).toBeLessThan(146);
    };
    for (const s of stations) check(s.lat, s.lon);
    for (const w of waypoints) check(w.geometry.coordinates[1], w.geometry.coordinates[0]);
    const route = RouteFileSchema.parse(read('route.geojson')).features[0]!;
    for (const [lon, lat] of route.geometry.coordinates) check(lat, lon);
  });
});
