/**
 * Loads and validates the public dataset.
 *
 * Files are fetched from the app's own origin at BASE_URL + "data/...". They
 * are part of the service-worker precache, so after the first successful load
 * these fetches are served from the cache and work with the radio off.
 *
 * Validation failures are surfaced, never swallowed. A field tool showing
 * silently truncated data is worse than one showing an error.
 */
import { assetUrl } from '../lib/base';
import {
  AnchorsFileSchema,
  DataIndexSchema,
  DaysFileSchema,
  HiroshigeFileSchema,
  RouteFileSchema,
  RouteMetaSchema,
  StationsFileSchema,
  TripSchema,
  WaypointsFileSchema,
} from './schemas';
import type {
  AnchorFeature,
  DataIndex,
  Day,
  HiroshigeRef,
  PointFeature,
  RouteFeature,
  RouteMeta,
  Station,
  Trip,
} from './schemas';
import { cumulativeKm, lineLengthKm } from '../lib/geo';
import type { Position } from '../lib/geo';

export const DATA_FILES = [
  'data/index.json',
  'data/trip.json',
  'data/days.json',
  'data/stations.json',
  'data/waypoints.geojson',
  'data/route-meta.json',
  'data/route.geojson',
  'data/anchors.geojson',
  'data/hiroshige.json',
] as const;

/**
 * A continuous walkable stretch of the active route.
 *
 * The route is NOT one line. Where a gap is unresolved, the stretches either
 * side of it stay separate — which is also exactly the shape the Footpath
 * export needs, one `<trk>` per stretch, because Footpath silently bridges
 * anything inside a single track.
 */
export interface RouteStretch {
  id: string;
  title: string;
  /** Path and variant ids contributing to this stretch, in order. */
  memberIds: string[];
  positions: Position[];
  lengthKm: number;
  /** Cumulative distance at each position, km. */
  cumulativeKm: number[];
}

/** A break in the route: a gap that no active variant resolves. */
export interface RouteBreak {
  pathId: string;
  title: string;
  kind: string;
  note: string | null;
}

export interface Dataset {
  index: DataIndex;
  trip: Trip;
  days: Day[];
  stations: Station[];
  waypoints: PointFeature[];
  hiroshige: HiroshigeRef[];
  routeMeta: RouteMeta;
  routeFeatures: RouteFeature[];
  anchors: AnchorFeature[];
  /** The active alignment, split at every unresolved gap. */
  stretches: RouteStretch[];
  breaks: RouteBreak[];
  /** Total of every stretch, km. */
  activeLengthKm: number;
  loadedAt: string;
}

async function fetchJson(path: string, bust?: string): Promise<unknown> {
  // `bust` exists to get past the SERVICE WORKER, not the HTTP cache.
  //
  // `cache: 'no-cache'` only governs the browser cache; the service worker's
  // fetch handler runs first, and every file under data/ is precached, so a
  // reload keeps returning whatever the active worker holds. With
  // `skipWaiting: false` — deliberate, so a working field build is never
  // replaced mid-walk — the new data does not appear until every tab closes.
  //
  // That is right for the field app and wrong for the desk, which is a
  // networked tool with no offline promise and must never show a stale route.
  // Kevin's desk sat on `0.5.0-traced` for seven bakes because of this. A query
  // parameter does not match the precached entry, so the request goes to the
  // network.
  const url = bust ? `${assetUrl(path)}?fresh=${bust}` : assetUrl(path);
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return (await res.json()) as unknown;
}

/**
 * Assemble the active alignment from paths, active variants and anchors.
 *
 * The subtle case, and the one the Tokaido actually has: a variant can diverge
 * from a path BEFORE that path ends. The Saya Kaido leaves the east route ten
 * points short of the Miya ferry landing, so the east path is truncated at the
 * divergence anchor and the spur down to the landing is not walked.
 */
export function buildStretches(
  meta: RouteMeta,
  features: readonly RouteFeature[],
  anchors: readonly AnchorFeature[],
): { stretches: RouteStretch[]; breaks: RouteBreak[] } {
  const geometryOf = (id: string): Position[] =>
    (features.find((f) => f.properties.id === id)?.geometry.coordinates ?? []).map(
      ([lon, lat]) => [lon, lat] as Position,
    );
  const anchorById = (id: string): AnchorFeature | undefined =>
    anchors.find((a) => a.properties.id === id);

  const activeVariants = meta.variants.filter((v) => v.active);
  const stretches: RouteStretch[] = [];
  const breaks: RouteBreak[] = [];

  let current: { members: string[]; positions: Position[] } | null = null;
  const flush = (): void => {
    if (!current || current.positions.length < 2) {
      current = null;
      return;
    }
    const positions = current.positions;
    stretches.push({
      id: current.members.join('+'),
      title: current.members
        .map((id) => meta.paths.find((p) => p.id === id)?.title ?? meta.variants.find((v) => v.id === id)?.title ?? id)
        .join(' → '),
      memberIds: current.members,
      positions,
      lengthKm: lineLengthKm(positions),
      cumulativeKm: cumulativeKm(positions),
    });
    current = null;
  };
  const append = (id: string, positions: Position[]): void => {
    if (positions.length === 0) return;
    if (!current) current = { members: [], positions: [] };
    current.members.push(id);
    // Avoid duplicating the shared vertex where two members meet.
    const start = current.positions.length > 0 ? 1 : 0;
    current.positions.push(...positions.slice(start));
  };

  // A variant may be reached two ways: by diverging from a path, or by
  // resolving a gap. Track which have been used so neither double-counts.
  const used = new Set<string>();
  const anchorIndex = (id: string | null): number | null => {
    if (!id) return null;
    const idx = anchorById(id)?.properties.indexOnPath;
    return typeof idx === 'number' && idx >= 0 ? idx : null;
  };

  for (const path of [...meta.paths].sort((a, b) => a.order - b.order)) {
    if (path.kind === 'walking') {
      const geom = geometryOf(path.id);

      // Active variants leaving this path, in the order they leave it.
      const leaving = activeVariants
        .filter((v) => anchorById(v.divergeAnchorId)?.properties.pathId === path.id)
        .map((v) => ({ v, at: anchorIndex(v.divergeAnchorId) ?? 0 }))
        .sort((a, b) => a.at - b.at);

      let cursor = 0;
      for (const { v, at } of leaving) {
        if (used.has(v.id)) continue;
        // Only one alignment can be walked from a given junction. Two variants
        // leaving the same point would both be appended, one after the other,
        // with a jump back between them — which is how an edit to the Saya
        // Kaido once added 45 km of route that does not exist.
        if (at < cursor) continue;
        append(path.id, geom.slice(cursor, at + 1));
        append(v.id, geometryOf(v.id));
        used.add(v.id);

        // Rejoining the SAME path resumes it — that is a replaced section.
        // Rejoining elsewhere, or nowhere, means the variant leaves for good.
        const rejoin = anchorById(v.rejoinAnchorId ?? '');
        const rejoinsHere = rejoin?.properties.pathId === path.id;
        const rejoinAt = rejoinsHere ? anchorIndex(v.rejoinAnchorId) : null;
        cursor = rejoinsHere && rejoinAt !== null && rejoinAt > at ? rejoinAt : geom.length;
      }

      if (cursor < geom.length) append(path.id, geom.slice(cursor));
      continue;
    }

    const resolver = activeVariants.find((v) => v.replacesPathId === path.id);
    if (resolver) {
      // Already emitted when it diverged from the preceding path.
      if (used.has(resolver.id)) continue;
      append(resolver.id, geometryOf(resolver.id));
      used.add(resolver.id);
      continue;
    }

    // An unresolved gap ends the current stretch and is recorded as a break.
    flush();
    breaks.push({
      pathId: path.id,
      title: path.title,
      kind: path.kind,
      note: path.note ?? null,
    });
  }

  flush();

  return { stretches, breaks };
}

export interface LoadOptions {
  /**
   * Bypass the service worker's precache and read what the server has now.
   *
   * The desk sets this. The field app must not: its whole offline guarantee is
   * that these files come from the precache.
   */
  fresh?: boolean;
}

export async function loadDataset(options: LoadOptions = {}): Promise<Dataset> {
  const bust = options.fresh ? String(Date.now()) : undefined;
  const [indexRaw, tripRaw, daysRaw, stationsRaw, waypointsRaw, metaRaw, routeRaw, anchorsRaw, hiroshigeRaw] =
    await Promise.all(DATA_FILES.map((f) => fetchJson(f, bust)));

  const index = DataIndexSchema.parse(indexRaw);
  const trip = TripSchema.parse(tripRaw);
  const daysFile = DaysFileSchema.parse(daysRaw);
  const stationsFile = StationsFileSchema.parse(stationsRaw);
  const waypointsFile = WaypointsFileSchema.parse(waypointsRaw);
  const routeMeta = RouteMetaSchema.parse(metaRaw);
  const routeFile = RouteFileSchema.parse(routeRaw);
  const anchorsFile = AnchorsFileSchema.parse(anchorsRaw);
  const hiroshigeFile = HiroshigeFileSchema.parse(hiroshigeRaw);

  const { stretches, breaks } = buildStretches(routeMeta, routeFile.features, anchorsFile.features);

  return {
    index,
    trip,
    days: daysFile.days,
    stations: stationsFile.stations,
    waypoints: waypointsFile.features,
    hiroshige: hiroshigeFile.images,
    routeMeta,
    routeFeatures: routeFile.features,
    anchors: anchorsFile.features,
    stretches,
    breaks,
    activeLengthKm: stretches.reduce((t, s) => t + s.lengthKm, 0),
    loadedAt: new Date().toISOString(),
  };
}

// --- selectors -------------------------------------------------------------

export function dayByDate(days: readonly Day[], isoDate: string): Day | null {
  return days.find((d) => d.date === isoDate) ?? null;
}

export function dayById(days: readonly Day[], id: string): Day | null {
  return days.find((d) => d.id === id) ?? null;
}

/** The day in effect for `isoDate`: the exact match, else the next one, else the last. */
export function currentOrNextDay(days: readonly Day[], isoDate: string): Day | null {
  const exact = dayByDate(days, isoDate);
  if (exact) return exact;
  const upcoming = days.filter((d) => d.date >= isoDate).sort((a, b) => a.date.localeCompare(b.date));
  return upcoming[0] ?? days[days.length - 1] ?? null;
}

export function waypointById(waypoints: readonly PointFeature[], id: string): PointFeature | null {
  return waypoints.find((w) => w.properties.id === id) ?? null;
}

export function waypointsForDay(waypoints: readonly PointFeature[], dayId: string): PointFeature[] {
  return waypoints.filter((w) => w.properties.dayIds.includes(dayId));
}

export function stationsByIds(stations: readonly Station[], ids: readonly string[]): Station[] {
  return ids.map((id) => stations.find((s) => s.id === id)).filter((s): s is Station => Boolean(s));
}

export function waypointPosition(f: PointFeature): Position {
  return [f.geometry.coordinates[0], f.geometry.coordinates[1]];
}

export function anchorPosition(a: AnchorFeature): Position {
  return [a.geometry.coordinates[0], a.geometry.coordinates[1]];
}

export function anchorById(anchors: readonly AnchorFeature[], id: string): AnchorFeature | null {
  return anchors.find((a) => a.properties.id === id) ?? null;
}
