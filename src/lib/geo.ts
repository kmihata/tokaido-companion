/**
 * Pure geodesic helpers. No DOM, no React, no I/O — everything here is
 * unit-tested in tests/unit/geo.test.ts.
 *
 * Coordinate convention: GeoJSON order, [lon, lat], degrees.
 */

export type Position = readonly [lon: number, lat: number];

/** Mean Earth radius, metres (IUGG). */
const EARTH_RADIUS_M = 6_371_008.8;

const toRad = (deg: number): number => (deg * Math.PI) / 180;

/**
 * Great-circle distance in metres between two points.
 *
 * Haversine. Accurate to ~0.5% — far better than the accuracy of any
 * coordinate currently in this project's fixtures.
 */
export function haversineMetres(a: Position, b: Position): number {
  const [lon1, lat1] = a;
  const [lon2, lat2] = b;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(s)));
}

export function haversineKm(a: Position, b: Position): number {
  return haversineMetres(a, b) / 1000;
}

/** Total length of a polyline in kilometres. */
export function lineLengthKm(line: readonly Position[]): number {
  let total = 0;
  for (let i = 1; i < line.length; i++) {
    total += haversineKm(line[i - 1]!, line[i]!);
  }
  return total;
}

/**
 * Cumulative distance in kilometres at each vertex of a polyline.
 * Result has the same length as the input; the first element is always 0.
 */
export function cumulativeKm(line: readonly Position[]): number[] {
  const out: number[] = [];
  let total = 0;
  for (let i = 0; i < line.length; i++) {
    if (i > 0) total += haversineKm(line[i - 1]!, line[i]!);
    out.push(total);
  }
  return out;
}

export interface NearestOnLine {
  /** Index of the vertex starting the closest segment. */
  segmentIndex: number;
  /** Closest point on the line. */
  point: Position;
  /** Perpendicular distance from the query point to the line, km. */
  offRouteKm: number;
  /** Distance along the line from its start to `point`, km. */
  alongKm: number;
}

/**
 * Closest point on a polyline to `p`.
 *
 * Uses a local equirectangular projection per segment. Fine at walking scale;
 * would need replacing for anything intercontinental.
 *
 * Returns null for an empty line.
 */
export function nearestPointOnLine(
  line: readonly Position[],
  p: Position,
): NearestOnLine | null {
  if (line.length === 0) return null;
  if (line.length === 1) {
    return { segmentIndex: 0, point: line[0]!, offRouteKm: haversineKm(line[0]!, p), alongKm: 0 };
  }

  const cum = cumulativeKm(line);
  let best: NearestOnLine | null = null;

  for (let i = 0; i < line.length - 1; i++) {
    const a = line[i]!;
    const b = line[i + 1]!;
    // Project into a local plane scaled around the segment's mean latitude.
    const latScale = Math.cos(toRad((a[1] + b[1]) / 2));
    const ax = a[0] * latScale;
    const ay = a[1];
    const bx = b[0] * latScale;
    const by = b[1];
    const px = p[0] * latScale;
    const py = p[1];
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
    const point: Position = [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];
    const offRouteKm = haversineKm(point, p);
    if (best === null || offRouteKm < best.offRouteKm) {
      best = {
        segmentIndex: i,
        point,
        offRouteKm,
        alongKm: cum[i]! + haversineKm(a, point),
      };
    }
  }
  return best;
}

/** Bounding box [west, south, east, north] of a set of positions. */
export function bbox(positions: readonly Position[]): [number, number, number, number] | null {
  if (positions.length === 0) return null;
  let w = Infinity;
  let s = Infinity;
  let e = -Infinity;
  let n = -Infinity;
  for (const [lon, lat] of positions) {
    if (lon < w) w = lon;
    if (lon > e) e = lon;
    if (lat < s) s = lat;
    if (lat > n) n = lat;
  }
  return [w, s, e, n];
}

export const kmToMiles = (km: number): number => km * 0.621371;
export const milesToKm = (mi: number): number => mi / 0.621371;
