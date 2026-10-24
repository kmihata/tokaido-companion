/**
 * Bring the waypoints from a GPX file in as Kevin's own places.
 *
 * Kevin, 2026-10-24, on the road: a planning session in another tool produced
 * a GPX of decision points for a rain detour (Kabutoishi-zaka), and the Samwise
 * day file had no way to carry them, so the day had to be rebuilt by hand. Day
 * exports already include his own public places that fall on that day, so
 * importing waypoints as places is all it takes for them to reach Footpath.
 *
 * Waypoints only. Tracks in the file are ignored and the import says so.
 *
 * Pure. Unit-tested in tests/unit/gpxPlaces.test.ts.
 */
import type { UserPointType } from './userPoints';
import { haversineKm } from './geo';

export const GPX_PLACES_MAX_BYTES = 2_000_000;
export const GPX_PLACES_MAX_POINTS = 200;
/** A point already within this distance with the same name is the same point. */
export const DUPLICATE_WITHIN_KM = 0.015;

export interface GpxWaypoint {
  name: string;
  description: string;
  lat: number;
  lon: number;
}

export interface ParsedGpxPlaces {
  waypoints: GpxWaypoint[];
  trackCount: number;
  errors: string[];
}

function decode(s: string): string {
  return s
    .replace(/^<!\[CDATA\[([\s\S]*)\]\]>$/, '$1')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, '&')
    .trim();
}

function tag(body: string, name: string): string {
  const m = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`).exec(body);
  return m ? decode(m[1]!) : '';
}

export function parseGpxPlaces(text: string): ParsedGpxPlaces {
  const errors: string[] = [];
  if (text.length > GPX_PLACES_MAX_BYTES) {
    return { waypoints: [], trackCount: 0, errors: ['File is over 2 MB; that is not a places file.'] };
  }
  if (!/<gpx[\s>]/.test(text)) {
    return { waypoints: [], trackCount: 0, errors: ['Not a GPX file.'] };
  }
  const waypoints: GpxWaypoint[] = [];
  const re = /<wpt\b([^>]*)>([\s\S]*?)<\/wpt>|<wpt\b([^>]*)\/>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const attrs = m[1] ?? m[3] ?? '';
    const body = m[2] ?? '';
    const lat = Number(/\blat="([^"]+)"/.exec(attrs)?.[1]);
    const lon = Number(/\blon="([^"]+)"/.exec(attrs)?.[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
      errors.push('Skipped a waypoint with no usable coordinates.');
      continue;
    }
    const name = tag(body, 'name') || `Point ${waypoints.length + 1}`;
    const description = [tag(body, 'desc'), tag(body, 'cmt')].filter(Boolean).join(' · ');
    waypoints.push({ name, description, lat, lon });
  }
  if (waypoints.length > GPX_PLACES_MAX_POINTS) {
    errors.push(`Only the first ${GPX_PLACES_MAX_POINTS} waypoints were kept.`);
    waypoints.length = GPX_PLACES_MAX_POINTS;
  }
  const trackCount = (text.match(/<trk[\s>]/g) ?? []).length + (text.match(/<rte[\s>]/g) ?? []).length;
  if (waypoints.length === 0) errors.push('The file has no waypoints.');
  return { waypoints, trackCount, errors };
}

/** A best guess at the place type from its words. Always editable afterwards. */
export function guessPlaceType(w: GpxWaypoint): UserPointType {
  const t = `${w.name} ${w.description}`;
  if (/hazard|avoid|danger|caution|shoulder|detour|\bwet\b|slippery|closed|危険|注意/i.test(t)) return 'hazard';
  if (/station|\bbus\b|bus stop|\brail\b|\bJR\b|train|駅|バス/i.test(t)) return 'rail-bailout';
  if (/water|toilet|水/i.test(t)) return 'water';
  if (/food|cafe|café|restaurant|konbini|convenience|shop/i.test(t)) return 'food';
  if (/pharmacy|薬/i.test(t)) return 'pharmacy';
  if (/hiroshige|research/i.test(t)) return 'research';
  return 'landmark';
}

/** True when a place with the same name already sits at (nearly) the same spot. */
export function isDuplicate(
  w: GpxWaypoint,
  existing: readonly { title: string; lat: number; lon: number }[],
): boolean {
  return existing.some(
    (p) => p.title.trim() === w.name.trim() && haversineKm([p.lon, p.lat], [w.lon, w.lat]) <= DUPLICATE_WITHIN_KM,
  );
}
