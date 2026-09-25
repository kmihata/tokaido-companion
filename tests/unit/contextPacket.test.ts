import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildContextPacket } from '../../src/lib/contextPacket';
import type { PacketInput } from '../../src/lib/contextPacket';
import { DaysFileSchema, StationsFileSchema, WaypointsFileSchema } from '../../src/data/schemas';

const DATA = join(process.cwd(), 'public', 'data');
const read = (f: string): unknown => JSON.parse(readFileSync(join(DATA, f), 'utf8')) as unknown;

const days = DaysFileSchema.parse(read('days.json')).days;
const stations = StationsFileSchema.parse(read('stations.json')).stations;
const waypoints = WaypointsFileSchema.parse(read('waypoints.geojson')).features;

const hakone = days.find((d) => d.id === 'd-2026-10-24')!;
const hazard = waypoints.find((w) => w.properties.id === 'wp-hazard-hakone-pass-ic')!;

function input(patch: Partial<PacketInput> = {}): PacketInput {
  return {
    generatedAt: new Date('2026-10-24T03:00:00Z'),
    dataVersion: '0.1.0-demo',
    day: hakone,
    waypoint: {
      ...hazard.properties,
      lon: hazard.geometry.coordinates[0],
      lat: hazard.geometry.coordinates[1],
    },
    stations: stations.filter((s) => hakone.stationIds.includes(s.id)),
    position: { lat: 35.183, lon: 139.009, accuracyM: 12 },
    completedKm: 22.5,
    paceKmh: 3.8,
    sunset: new Date('2026-10-24T07:56:00Z'),
    question: 'Is the green-painted shoulder actually walkable in the rain?',
    ...patch,
  };
}

describe('buildContextPacket', () => {
  it('leads with a provenance warning before any fact', () => {
    const p = buildContextPacket(input());
    expect(p.indexOf('PROVENANCE WARNING')).toBe(0);
    expect(p.indexOf('PROVENANCE WARNING')).toBeLessThan(p.indexOf('--- CONTEXT ---'));
    expect(p).toMatch(/schematic/i);
    expect(p.replace(/\s+/g, ' ')).toMatch(/do not treat any figure here as navigational/i);
  });

  it('includes the day, its plan, and its safety notes', () => {
    const p = buildContextPacket(input());
    expect(p).toContain('2026-10-24');
    expect(p).toContain(hakone.label);
    expect(p).toContain('Hakone Pass IC');
    expect(p).toMatch(/green paint/i);
  });

  it('marks waypoint coordinates as an approximate placemark', () => {
    const p = buildContextPacket(input());
    expect(p).toMatch(/APPROXIMATE PLACEMARK/);
    expect(p).toMatch(/confidence: demonstration/i);
    expect(p).toMatch(/verification: unverified/i);
  });

  it('includes the question and asks the assistant to separate knowledge from inference', () => {
    const p = buildContextPacket(input());
    expect(p).toContain('Is the green-painted shoulder actually walkable in the rain?');
    expect(p).toMatch(/separate what you actually know/i);
    expect(p).toMatch(/I am the one deciding/i);
  });

  it('says so plainly when the question is blank', () => {
    expect(buildContextPacket(input({ question: '   ' }))).toContain('(no question entered)');
  });

  it('reports missing state rather than omitting it', () => {
    const p = buildContextPacket(input({ position: null, completedKm: null, paceKmh: null, sunset: null }));
    expect(p).toMatch(/Device position: not available/);
    expect(p).toMatch(/Distance walked today \(as entered\): not entered/);
    expect(p).toMatch(/Pace including stops \(as entered\): not entered/);
    expect(p).toMatch(/not computed/);
  });
});

describe('buildContextPacket — private data', () => {
  it('omits private detail by default', () => {
    const p = buildContextPacket(input());
    expect(p).not.toContain('PRIVATE DETAIL');
  });

  it('omits private detail when an empty list is passed', () => {
    const p = buildContextPacket(input({ includePrivateLines: [] }));
    expect(p).not.toContain('PRIVATE DETAIL');
  });

  it('includes it only when lines are explicitly supplied, and labels it as deliberate', () => {
    const p = buildContextPacket(input({ includePrivateLines: ['Lodging: Somewhere Inn'] }));
    expect(p).toContain('PRIVATE DETAIL');
    expect(p).toContain('included deliberately by me');
    expect(p).toContain('Lodging: Somewhere Inn');
  });
});

describe('buildContextPacket — provider neutrality', () => {
  it('names no AI provider anywhere in the packet', () => {
    const p = buildContextPacket(input()).toLowerCase();
    for (const brand of ['claude', 'chatgpt', 'openai', 'anthropic', 'gemini', 'copilot']) {
      expect(p).not.toContain(brand);
    }
  });

  it('stays short enough to paste into a mobile chat box', () => {
    expect(buildContextPacket(input()).length).toBeLessThan(6000);
  });
});
