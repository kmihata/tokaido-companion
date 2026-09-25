/**
 * Reading route geometry back in from an external editor.
 *
 * Bulk tracing happens in a dedicated tool — gpx.studio, CalTopo — because
 * drawing hundreds of kilometres at street level is a solved problem and those
 * do it better than this project would. This is the other half of that round
 * trip, and it was the missing half.
 *
 * Two rules, both learned the hard way:
 *
 *  1. **Never silently join disconnected geometry.** Separate tracks and
 *     separate segments come back as separate pieces, and the caller decides
 *     what they mean. Joining them is exactly the mistake Footpath makes on
 *     import, which draws 21 km across Ise Bay on this route.
 *  2. **Never resample or simplify.** The points come back as they were drawn.
 *
 * Parsing uses DOMParser, which is what the app actually runs in the browser.
 * The unit tests run in jsdom for the same reason.
 */
import { lineLengthKm } from './geo';
import type { Position } from './geo';

/** Anything larger than this is not a hand-traced section. */
export const MAX_IMPORT_BYTES = 8 * 1024 * 1024;

export interface ImportedTrack {
  /** Name from the file, where it had one. */
  name: string | null;
  /** Which element it came from, so the review screen can say. */
  origin: 'gpx-trk' | 'gpx-trkseg' | 'gpx-rte' | 'geojson-linestring' | 'geojson-multilinestring';
  positions: Position[];
  lengthKm: number;
  /** True when the source carried elevation, which is dropped deliberately. */
  hadElevation: boolean;
}

export type ImportResult =
  | { ok: true; tracks: ImportedTrack[]; format: 'gpx' | 'geojson'; warnings: string[] }
  | { ok: false; errors: string[] };

function track(
  name: string | null,
  origin: ImportedTrack['origin'],
  positions: Position[],
  hadElevation: boolean,
): ImportedTrack {
  return { name, origin, positions, lengthKm: lineLengthKm(positions), hadElevation };
}

function validPositions(raw: readonly (readonly number[])[]): Position[] {
  const out: Position[] = [];
  for (const p of raw) {
    const lon = p[0];
    const lat = p[1];
    if (typeof lon !== 'number' || typeof lat !== 'number') continue;
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;
    if (Math.abs(lat) > 90 || Math.abs(lon) > 180) continue;
    out.push([lon, lat]);
  }
  return out;
}

// --- GPX --------------------------------------------------------------------

function parseGpx(text: string): ImportResult {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (doc.querySelector('parsererror')) {
    return { ok: false, errors: ['That file is not valid XML.'] };
  }
  const root = doc.documentElement;
  if (!root || root.nodeName.toLowerCase() !== 'gpx') {
    return { ok: false, errors: ['That XML file is not a GPX document.'] };
  }

  const tracks: ImportedTrack[] = [];
  const warnings: string[] = [];
  let elevationSeen = false;

  const pointsFrom = (nodes: Element[]): Position[] => {
    const raw: number[][] = [];
    for (const n of nodes) {
      const lat = Number(n.getAttribute('lat'));
      const lon = Number(n.getAttribute('lon'));
      if (n.getElementsByTagName('ele').length > 0) elevationSeen = true;
      raw.push([lon, lat]);
    }
    return validPositions(raw);
  };
  const nameOf = (el: Element): string | null => {
    const n = el.getElementsByTagName('name')[0];
    return n?.textContent?.trim() || null;
  };

  for (const trk of Array.from(root.getElementsByTagName('trk'))) {
    const segs = Array.from(trk.getElementsByTagName('trkseg'));
    const trkName = nameOf(trk);
    if (segs.length === 0) continue;
    segs.forEach((seg, i) => {
      const pts = pointsFrom(Array.from(seg.getElementsByTagName('trkpt')));
      if (pts.length < 2) return;
      tracks.push(
        track(
          segs.length > 1 && trkName ? `${trkName} (segment ${i + 1})` : trkName,
          segs.length > 1 ? 'gpx-trkseg' : 'gpx-trk',
          pts,
          elevationSeen,
        ),
      );
    });
    if (segs.length > 1) {
      warnings.push(
        `"${trkName ?? 'A track'}" contains ${segs.length} separate segments. They are kept apart — joining them would invent a line across whatever separates them.`,
      );
    }
  }

  for (const rte of Array.from(root.getElementsByTagName('rte'))) {
    const pts = pointsFrom(Array.from(rte.getElementsByTagName('rtept')));
    if (pts.length < 2) continue;
    tracks.push(track(nameOf(rte), 'gpx-rte', pts, elevationSeen));
  }

  if (tracks.length === 0) {
    return { ok: false, errors: ['No track or route with at least two points was found in that GPX.'] };
  }
  if (elevationSeen) {
    warnings.push(
      'The file carries elevation. It is dropped: Footpath substitutes its own terrain model on import, and a second set of numbers would only contradict it.',
    );
  }
  return { ok: true, tracks, format: 'gpx', warnings };
}

// --- GeoJSON ----------------------------------------------------------------

interface GeoJsonish {
  type?: string;
  geometry?: { type?: string; coordinates?: unknown };
  coordinates?: unknown;
  features?: unknown[];
  properties?: { name?: unknown; title?: unknown };
}

function parseGeoJson(text: string): ImportResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, errors: ['That file is not valid JSON.'] };
  }
  if (!parsed || typeof parsed !== 'object') {
    return { ok: false, errors: ['Expected a GeoJSON object.'] };
  }

  const tracks: ImportedTrack[] = [];
  const warnings: string[] = [];

  const nameOf = (o: GeoJsonish): string | null => {
    const n = o.properties?.name ?? o.properties?.title;
    return typeof n === 'string' && n.trim() ? n.trim() : null;
  };

  const takeGeometry = (geom: GeoJsonish, name: string | null): void => {
    const coords = geom.coordinates;
    if (geom.type === 'LineString' && Array.isArray(coords)) {
      const pts = validPositions(coords as number[][]);
      if (pts.length >= 2) tracks.push(track(name, 'geojson-linestring', pts, hasElevation(coords as number[][])));
    } else if (geom.type === 'MultiLineString' && Array.isArray(coords)) {
      const parts = coords as number[][][];
      parts.forEach((part, i) => {
        const pts = validPositions(part);
        if (pts.length >= 2) {
          tracks.push(
            track(parts.length > 1 && name ? `${name} (part ${i + 1})` : name, 'geojson-multilinestring', pts, hasElevation(part)),
          );
        }
      });
      if (parts.length > 1) {
        warnings.push(
          `"${name ?? 'A MultiLineString'}" contains ${parts.length} separate parts. They are kept apart.`,
        );
      }
    }
  };

  const obj = parsed as GeoJsonish;
  if (obj.type === 'FeatureCollection' && Array.isArray(obj.features)) {
    for (const f of obj.features as GeoJsonish[]) {
      if (f?.geometry) takeGeometry(f.geometry as GeoJsonish, nameOf(f));
    }
  } else if (obj.type === 'Feature' && obj.geometry) {
    takeGeometry(obj.geometry as GeoJsonish, nameOf(obj));
  } else {
    takeGeometry(obj, null);
  }

  if (tracks.length === 0) {
    return {
      ok: false,
      errors: ['No LineString with at least two points was found. Point and Polygon geometry is ignored.'],
    };
  }
  return { ok: true, tracks, format: 'geojson', warnings };
}

function hasElevation(coords: readonly (readonly number[])[]): boolean {
  return coords.some((c) => c.length > 2);
}

// --- entry point ------------------------------------------------------------

export function parseRouteFile(filename: string, text: string): ImportResult {
  const bytes = new TextEncoder().encode(text).length;
  if (bytes > MAX_IMPORT_BYTES) {
    return {
      ok: false,
      errors: [
        `That file is ${(bytes / 1024 / 1024).toFixed(1)} MB. The limit is ${MAX_IMPORT_BYTES / 1024 / 1024} MB — a traced section should be far smaller.`,
      ],
    };
  }
  if (text.trim().length === 0) return { ok: false, errors: ['That file is empty.'] };

  const looksXml = text.trimStart().startsWith('<');
  const byExtension = /\.gpx$/i.test(filename) ? 'gpx' : /\.(geo)?json$/i.test(filename) ? 'geojson' : null;

  if (byExtension === 'gpx' || (byExtension === null && looksXml)) return parseGpx(text);
  return parseGeoJson(text);
}
