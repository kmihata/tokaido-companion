/**
 * "Next restroom" on the Today screen.
 *
 * Kevin, 2026-10-29, after a week on the road: finding a restroom took real
 * time, both in planning and while walking. He needs two answers from one tap:
 * what is the next one, and should I stop at it, which depends on the gaps
 * after it. He prefers a roadside station (michi-no-eki) above all, then a
 * train station or a park, and a convenience store only as a fallback.
 *
 * The data is public OpenStreetMap, built once into public/data/restrooms.json.
 * Tiers come from what each toilet sits next to, so they are a good guess, not
 * an inspection.
 *
 * Pure. Unit-tested in tests/unit/restrooms.test.ts.
 */
import type { Position } from './geo';
import { haversineKm, nearestPointOnLine } from './geo';
import type { PlanningLine } from './planningLine';

export type RestroomKind = 'roadside' | 'station' | 'park' | 'shrine' | 'public' | 'store';

export interface Restroom {
  id: string;
  lat: number;
  lon: number;
  /** 1 roadside station, 2 train station, 3 park or shrine, 4 other public, 5 store. */
  tier: number;
  kind: RestroomKind;
  name: string;
  /** True when a toilet itself is on the map, not only the place that usually has one. */
  mapped: boolean;
  notes: string[];
}

export interface RestroomsFile {
  schemaVersion: number;
  generated: string;
  coverage: string;
  source: string;
  restrooms: Restroom[];
}

export interface PlacedRestroom extends Restroom {
  alongKm: number;
  offRouteKm: number;
}

/** Points farther than this from the line are not on the walk. */
export const MAX_OFF_ROUTE_KM = 0.45;

/** Lowest tier counted as a public restroom. Tier 5 is the store fallback. */
export const PUBLIC_MAX_TIER = 4;

/** Treat a restroom this far behind as "here", to absorb GPS noise. */
export const BEHIND_TOLERANCE_KM = 0.1;

export const KIND_LABEL: Record<RestroomKind, string> = {
  roadside: 'Roadside station',
  station: 'Train station',
  park: 'Park',
  shrine: 'Shrine or temple',
  public: 'Public toilet',
  store: 'Convenience store',
};

/**
 * Put every restroom on the planning line once.
 *
 * The line is walked in one direction, so each restroom's position along it
 * is fixed. Anything too far off the line is dropped.
 */
export function placeOnLine(line: PlanningLine, restrooms: readonly Restroom[]): PlacedRestroom[] {
  const pos = line.positions;
  if (pos.length < 2) return [];

  // Scanning the whole 500 km line for each of several hundred points took
  // over a second on a laptop, too slow for a phone. Bucket segments by grid
  // cell so each point only checks the segments near it.
  const index = new Map<string, number[]>();
  for (let i = 0; i < pos.length - 1; i++) {
    const a = pos[i]!;
    const b = pos[i + 1]!;
    const x0 = Math.floor(Math.min(a[0], b[0]) / CELL_DEG);
    const x1 = Math.floor(Math.max(a[0], b[0]) / CELL_DEG);
    const y0 = Math.floor(Math.min(a[1], b[1]) / CELL_DEG);
    const y1 = Math.floor(Math.max(a[1], b[1]) / CELL_DEG);
    for (let x = x0; x <= x1; x++) {
      for (let y = y0; y <= y1; y++) {
        const key = `${x},${y}`;
        const list = index.get(key);
        if (list) list.push(i);
        else index.set(key, [i]);
      }
    }
  }

  const out: PlacedRestroom[] = [];
  for (const r of restrooms) {
    const p: Position = [r.lon, r.lat];
    const cx = Math.floor(r.lon / CELL_DEG);
    const cy = Math.floor(r.lat / CELL_DEG);
    const candidates = new Set<number>();
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (const i of index.get(`${cx + dx},${cy + dy}`) ?? []) candidates.add(i);
      }
    }
    if (candidates.size === 0) continue;
    const idx = [...candidates].sort((a, b) => a - b);

    let best: { i: number; point: Position; off: number } | null = null;
    for (const i of idx) {
      const near = nearestPointOnLine([pos[i]!, pos[i + 1]!], p);
      if (near && (best === null || near.offRouteKm < best.off)) {
        best = { i, point: near.point, off: near.offRouteKm };
      }
    }
    if (!best || best.off > MAX_OFF_ROUTE_KM) continue;
    // Measure on the planning line's own axis, which does not count the jump
    // across a break.
    const alongKm = line.cumulativeKm[best.i]! + haversineKm(pos[best.i]!, best.point);
    out.push({ ...r, alongKm, offRouteKm: best.off });
  }
  out.sort((a, b) => a.alongKm - b.alongKm);
  return out;
}

/** Grid cell for the segment index, degrees. About 1 km, wider than MAX_OFF_ROUTE_KM. */
const CELL_DEG = 0.01;

export interface AheadRestroom {
  restroom: PlacedRestroom;
  /** Along the route from where you stand. Never negative. */
  aheadKm: number;
  /**
   * Along the route from this restroom to the next public one. Null when no
   * public restroom is known after it within the data.
   */
  gapAfterKm: number | null;
}

export interface NextRestrooms {
  /** The next public restrooms ahead, nearest first. */
  ahead: AheadRestroom[];
  /** The nearest convenience store ahead, if any. */
  store: AheadRestroom | null;
  /** The best tier among `ahead`, so the card can point at it. */
  bestTier: number | null;
  /**
   * The next roadside station, Kevin's first choice, when it is not already
   * in `ahead`. Only within ROADSIDE_LOOKAHEAD_KM; farther is not a plan.
   */
  roadside: AheadRestroom | null;
}

export const ROADSIDE_LOOKAHEAD_KM = 20;

/**
 * The next `count` public restrooms ahead of `alongKm`, with the gap after
 * each, and the nearest store as a fallback.
 *
 * Several mapped toilets at one station or park often sit within metres of
 * each other; they are collapsed so the list shows places, not fixtures.
 */
export function nextRestrooms(
  placed: readonly PlacedRestroom[],
  alongKm: number,
  count = 3,
): NextRestrooms {
  const from = alongKm - BEHIND_TOLERANCE_KM;
  const publicAhead = collapse(placed.filter((r) => r.tier <= PUBLIC_MAX_TIER && r.alongKm >= from));

  const ahead: AheadRestroom[] = publicAhead.slice(0, count).map((r, i) => {
    const next = publicAhead[i + 1];
    return {
      restroom: r,
      aheadKm: Math.max(0, r.alongKm - alongKm),
      gapAfterKm: next ? next.alongKm - r.alongKm : null,
    };
  });

  const storeR = placed.find((r) => r.tier > PUBLIC_MAX_TIER && r.alongKm >= from) ?? null;
  const store = storeR
    ? { restroom: storeR, aheadKm: Math.max(0, storeR.alongKm - alongKm), gapAfterKm: null }
    : null;

  const bestTier = ahead.length ? Math.min(...ahead.map((a) => a.restroom.tier)) : null;

  const rs = publicAhead.find(
    (r) => r.kind === 'roadside' && r.alongKm - alongKm <= ROADSIDE_LOOKAHEAD_KM,
  );
  const roadside =
    rs && !ahead.some((a) => a.restroom.id === rs.id)
      ? { restroom: rs, aheadKm: Math.max(0, rs.alongKm - alongKm), gapAfterKm: null }
      : null;

  return { ahead, store, bestTier, roadside };
}

/** Within this distance along the route, two restrooms are the same stop. */
export const SAME_STOP_KM = 0.15;

/**
 * Merge restrooms that are effectively the same stop, keeping the best tier
 * (and, among equals, the one nearest the route).
 */
export function collapse(sorted: readonly PlacedRestroom[]): PlacedRestroom[] {
  const out: PlacedRestroom[] = [];
  for (const r of sorted) {
    const last = out[out.length - 1];
    if (last && r.alongKm - last.alongKm < SAME_STOP_KM) {
      const better =
        r.tier < last.tier || (r.tier === last.tier && r.offRouteKm < last.offRouteKm);
      if (better) out[out.length - 1] = r;
      continue;
    }
    out.push(r);
  }
  return out;
}

/**
 * Open a restroom in Apple Maps with walking directions from where you are.
 *
 * Kevin, 2026-10-29: the card says "Train station, 1.2 km ahead, 80 m off the
 * route" but not where exactly. A maps.apple.com link opens the Maps app on
 * iPhone (not a web page), shows the pin, and starts a walking route to it.
 */
export function appleMapsUrl(r: Pick<Restroom, 'lat' | 'lon' | 'name' | 'kind'>): string {
  const label = r.name || KIND_LABEL[r.kind];
  const ll = `${r.lat.toFixed(6)},${r.lon.toFixed(6)}`;
  return `https://maps.apple.com/?daddr=${ll}&dirflg=w&q=${encodeURIComponent(`Toilet: ${label}`)}`;
}

/** In a day file, at most one restroom pin per this much route. */
export const GPX_PIN_SPACING_KM = 0.75;

const SHORT_KIND: Record<RestroomKind, string> = {
  roadside: 'Michi-no-eki',
  station: 'Station',
  park: 'Park',
  shrine: 'Shrine',
  public: 'Public',
  store: 'Store',
};

/**
 * Public restrooms between two distances on the line, as GPX waypoints for a
 * day file. Names start "WC" and stay short, because Footpath truncates labels
 * at about 25 characters. Stores are left out; they are a fallback, not a pin.
 */
export function restroomWaypoints(
  placed: readonly PlacedRestroom[],
  fromKm: number,
  toKm: number,
): { name: string; description: string; position: Position }[] {
  const inRange = placed
    .filter((r) => r.tier <= PUBLIC_MAX_TIER && r.alongKm >= fromKm && r.alongKm <= toKm)
    .sort((a, b) => a.alongKm - b.alongKm);
  // Some days have 50-75 restrooms in town; as pins that buries the route.
  // Keep the best one in each stretch of GPX_PIN_SPACING_KM.
  const thinned: PlacedRestroom[] = [];
  for (const r of inRange) {
    const last = thinned[thinned.length - 1];
    if (last && r.alongKm - last.alongKm < GPX_PIN_SPACING_KM) {
      if (r.tier < last.tier || (r.tier === last.tier && r.offRouteKm < last.offRouteKm)) {
        thinned[thinned.length - 1] = r;
      }
      continue;
    }
    thinned.push(r);
  }
  return thinned
    .map((r) => ({
      name: `WC ${SHORT_KIND[r.kind]}${r.name ? ` ${r.name}` : ''}`.slice(0, 25),
      description: [
        `Restroom: ${KIND_LABEL[r.kind]}${r.name ? `, ${r.name}` : ''}`,
        r.offRouteKm >= 0.05 ? `${Math.round(r.offRouteKm * 1000)} m off the route` : 'on the route',
        ...r.notes,
        r.mapped ? 'toilet mapped in OpenStreetMap' : 'inferred from the place, toilet not mapped',
        'OpenStreetMap (ODbL), not checked on the ground',
      ].join(' · '),
      position: [r.lon, r.lat] as Position,
    }));
}
