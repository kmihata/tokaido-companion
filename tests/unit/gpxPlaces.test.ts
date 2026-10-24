import { describe, expect, it } from 'vitest';
import { guessPlaceType, isDuplicate, parseGpxPlaces } from '../../src/lib/gpxPlaces';

const KABUTOISHI = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Claude" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata><name>Kabutoishi-zaka rain detour</name></metadata>
  <wpt lat="35.1785361" lon="139.0139331">
    <name>1 Decision point: Ashinoko Country Iriguchi</name>
    <desc>Bus stop on Route 1. Wet: stay on Route 1 &amp; keep going downhill.</desc>
  </wpt>
  <wpt lat="35.1730150" lon="139.0081760"><name>2 Bottom of Kabutoishi-zaka</name><desc>Wet-weather route does not use this.</desc></wpt>
  <wpt lat="35.1720264" lon="139.0081007"><name><![CDATA[3 Rejoin: Settai-chaya]]></name></wpt>
  <wpt lat="nope" lon="139"><name>bad</name></wpt>
  <trk><name>t</name><trkseg><trkpt lat="35" lon="139"/></trkseg></trk>
</gpx>`;

describe('parseGpxPlaces', () => {
  it('reads waypoints, decodes entities and CDATA, skips bad coordinates, counts tracks', () => {
    const r = parseGpxPlaces(KABUTOISHI);
    expect(r.waypoints.map((w) => w.name)).toEqual([
      '1 Decision point: Ashinoko Country Iriguchi',
      '2 Bottom of Kabutoishi-zaka',
      '3 Rejoin: Settai-chaya',
    ]);
    expect(r.waypoints[0]!.description).toContain('Route 1 & keep');
    expect(r.waypoints[0]!.lat).toBeCloseTo(35.1785361, 7);
    expect(r.trackCount).toBe(1);
    expect(r.errors).toContain('Skipped a waypoint with no usable coordinates.');
  });
  it('refuses something that is not GPX', () => {
    expect(parseGpxPlaces('{"a":1}').errors).toEqual(['Not a GPX file.']);
  });
  it('says so when there are no waypoints', () => {
    expect(parseGpxPlaces('<gpx><trk></trk></gpx>').errors).toContain('The file has no waypoints.');
  });
});

describe('guessPlaceType', () => {
  it('reads a wet-weather detour as a hazard and a station as a bailout', () => {
    expect(guessPlaceType({ name: 'WET: leave old road here', description: '', lat: 0, lon: 0 })).toBe('hazard');
    expect(guessPlaceType({ name: 'Numazu Station', description: '', lat: 0, lon: 0 })).toBe('rail-bailout');
    expect(guessPlaceType({ name: 'Amazake-chaya', description: 'tea house', lat: 0, lon: 0 })).toBe('landmark');
  });
});

describe('isDuplicate', () => {
  it('matches the same name at the same spot, not a different name', () => {
    const p = { title: 'A', lat: 35, lon: 139 };
    expect(isDuplicate({ name: 'A', description: '', lat: 35.00005, lon: 139 }, [p])).toBe(true);
    expect(isDuplicate({ name: 'B', description: '', lat: 35, lon: 139 }, [p])).toBe(false);
    expect(isDuplicate({ name: 'A', description: '', lat: 35.01, lon: 139 }, [p])).toBe(false);
  });
});
