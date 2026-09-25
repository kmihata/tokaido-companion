// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { MAX_IMPORT_BYTES, parseRouteFile } from '../../src/lib/routeImport';

const gpxHeader = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="test" xmlns="http://www.topografix.com/GPX/1/1">`;

const pts = (n: number, lat0 = 35.0): string =>
  Array.from({ length: n }, (_, i) => `<trkpt lat="${lat0 + i * 0.001}" lon="139.0"></trkpt>`).join('');

describe('parseRouteFile — GPX', () => {
  it('reads a single track with its name', () => {
    const r = parseRouteFile('a.gpx', `${gpxHeader}<trk><name>Hakone hybrid</name><trkseg>${pts(5)}</trkseg></trk></gpx>`);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.format).toBe('gpx');
    expect(r.tracks).toHaveLength(1);
    expect(r.tracks[0]!.name).toBe('Hakone hybrid');
    expect(r.tracks[0]!.origin).toBe('gpx-trk');
    expect(r.tracks[0]!.positions).toHaveLength(5);
    expect(r.tracks[0]!.lengthKm).toBeGreaterThan(0.3);
  });

  it('keeps multiple tracks apart', () => {
    const r = parseRouteFile(
      'b.gpx',
      `${gpxHeader}<trk><name>A</name><trkseg>${pts(3)}</trkseg></trk><trk><name>B</name><trkseg>${pts(3, 36)}</trkseg></trk></gpx>`,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.tracks.map((t) => t.name)).toEqual(['A', 'B']);
  });

  /**
   * The lesson from the Footpath device test, applied in the other direction:
   * joining separate segments would invent a line across whatever separates
   * them. On this route that is 21 km of Ise Bay.
   */
  it('keeps track segments apart and says so', () => {
    const r = parseRouteFile(
      'c.gpx',
      `${gpxHeader}<trk><name>Split</name><trkseg>${pts(3)}</trkseg><trkseg>${pts(3, 36)}</trkseg></trk></gpx>`,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.tracks).toHaveLength(2);
    expect(r.tracks[0]!.origin).toBe('gpx-trkseg');
    expect(r.tracks.map((t) => t.name)).toEqual(['Split (segment 1)', 'Split (segment 2)']);
    expect(r.warnings.join(' ')).toMatch(/kept apart/i);
  });

  it('reads a route element as well as a track', () => {
    const r = parseRouteFile(
      'd.gpx',
      `${gpxHeader}<rte><name>Planned</name><rtept lat="35.0" lon="139.0"></rtept><rtept lat="35.01" lon="139.0"></rtept></rte></gpx>`,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.tracks[0]!.origin).toBe('gpx-rte');
    expect(r.tracks[0]!.name).toBe('Planned');
  });

  it('drops elevation and says why', () => {
    const r = parseRouteFile(
      'e.gpx',
      `${gpxHeader}<trk><trkseg><trkpt lat="35.0" lon="139.0"><ele>10</ele></trkpt><trkpt lat="35.01" lon="139.0"><ele>20</ele></trkpt></trkseg></trk></gpx>`,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.tracks[0]!.hadElevation).toBe(true);
    expect(r.tracks[0]!.positions[0]).toHaveLength(2);
    expect(r.warnings.join(' ')).toMatch(/Footpath substitutes its own terrain model/i);
  });

  it('skips a track with fewer than two points', () => {
    const r = parseRouteFile('f.gpx', `${gpxHeader}<trk><trkseg>${pts(1)}</trkseg></trk></gpx>`);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors.join(' ')).toMatch(/two points/i);
  });

  it('refuses malformed XML and non-GPX XML', () => {
    expect(parseRouteFile('g.gpx', '<gpx><trk>').ok).toBe(false);
    const r = parseRouteFile('h.gpx', '<?xml version="1.0"?><kml><Placemark/></kml>');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join(' ')).toMatch(/not a GPX/i);
  });

  it('discards points with impossible coordinates', () => {
    const r = parseRouteFile(
      'i.gpx',
      `${gpxHeader}<trk><trkseg><trkpt lat="35.0" lon="139.0"></trkpt><trkpt lat="999" lon="139.0"></trkpt><trkpt lat="35.01" lon="139.0"></trkpt></trkseg></trk></gpx>`,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.tracks[0]!.positions).toHaveLength(2);
  });
});

describe('parseRouteFile — GeoJSON', () => {
  const ls = (coords: number[][]) => JSON.stringify({ type: 'LineString', coordinates: coords });

  it('reads a bare LineString', () => {
    const r = parseRouteFile('a.geojson', ls([[139, 35], [139, 35.01]]));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.format).toBe('geojson');
    expect(r.tracks[0]!.origin).toBe('geojson-linestring');
  });

  it('reads a FeatureCollection and takes the names', () => {
    const r = parseRouteFile(
      'b.geojson',
      JSON.stringify({
        type: 'FeatureCollection',
        features: [
          { type: 'Feature', properties: { name: 'One' }, geometry: { type: 'LineString', coordinates: [[139, 35], [139, 35.01]] } },
          { type: 'Feature', properties: { title: 'Two' }, geometry: { type: 'LineString', coordinates: [[139, 36], [139, 36.01]] } },
          { type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [139, 35] } },
        ],
      }),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.tracks.map((t) => t.name)).toEqual(['One', 'Two']);
  });

  it('keeps MultiLineString parts apart', () => {
    const r = parseRouteFile(
      'c.geojson',
      JSON.stringify({
        type: 'Feature',
        properties: { name: 'Split' },
        geometry: { type: 'MultiLineString', coordinates: [[[139, 35], [139, 35.01]], [[139, 36], [139, 36.01]]] },
      }),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.tracks).toHaveLength(2);
    expect(r.warnings.join(' ')).toMatch(/kept apart/i);
  });

  it('drops the third coordinate where a source carries elevation', () => {
    const r = parseRouteFile('d.geojson', ls([[139, 35, 10], [139, 35.01, 20]]));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.tracks[0]!.hadElevation).toBe(true);
    expect(r.tracks[0]!.positions[0]).toEqual([139, 35]);
  });

  it('refuses a file with no line geometry', () => {
    const r = parseRouteFile('e.geojson', JSON.stringify({ type: 'FeatureCollection', features: [] }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join(' ')).toMatch(/no linestring/i);
  });

  it('refuses invalid JSON', () => {
    const r = parseRouteFile('f.geojson', '{not json');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join(' ')).toMatch(/not valid json/i);
  });
});

describe('parseRouteFile — guards', () => {
  it('refuses an empty file', () => {
    const r = parseRouteFile('a.gpx', '   ');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join(' ')).toMatch(/empty/i);
  });

  it('refuses a file over the size limit', () => {
    const r = parseRouteFile('big.geojson', 'x'.repeat(MAX_IMPORT_BYTES + 10));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join(' ')).toMatch(/limit/i);
  });

  it('detects the format from content when the extension is unhelpful', () => {
    const r = parseRouteFile('download', `${gpxHeader}<trk><trkseg>${pts(3)}</trkseg></trk></gpx>`);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.format).toBe('gpx');
  });
});
