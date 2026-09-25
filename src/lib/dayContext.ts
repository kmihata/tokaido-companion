/**
 * Assembles everything the field screens need about one day.
 *
 * Kept out of the components so it can be tested without a DOM, and so that
 * "what counts as today's reference point for sunset" is one decision written
 * down in one place rather than three slightly different ones in three
 * screens.
 */
import type { Day, PointFeature, Station } from '../data/schemas';
import type { Dataset } from '../data/load';
import { stationsByIds, waypointById, waypointPosition } from '../data/load';
import { sunTimesForIsoDate } from './daylight';
import type { RouteStretch } from '../data/load';
import type { Position } from './geo';
import { haversineKm, nearestPointOnLine } from './geo';

export interface DayContext {
  day: Day;
  stations: Station[];
  bailouts: PointFeature[];
  hazards: PointFeature[];
  allWaypoints: PointFeature[];
  startPos: Position | null;
  endPos: Position | null;
  /** Coordinate used for the daylight calculation. */
  sunReference: Position | null;
  sunrise: Date | null;
  sunset: Date | null;
  dayLengthMinutes: number | null;
  /** Next walking day, for the "what moves to tomorrow" arithmetic. */
  tomorrow: Day | null;
}

function firstStationPos(stations: readonly Station[]): Position | null {
  const s = stations[0];
  return s ? [s.lon, s.lat] : null;
}

export function buildDayContext(dataset: Dataset, day: Day): DayContext {
  const stations = stationsByIds(dataset.stations, day.stationIds);
  const allWaypoints = dataset.waypoints.filter((w) => w.properties.dayIds.includes(day.id));
  const bailouts = day.bailoutWaypointIds
    .map((id) => waypointById(dataset.waypoints, id))
    .filter((w): w is PointFeature => Boolean(w));
  const hazards = day.hazardWaypointIds
    .map((id) => waypointById(dataset.waypoints, id))
    .filter((w): w is PointFeature => Boolean(w));

  const startWp = day.fromWaypointId ? waypointById(dataset.waypoints, day.fromWaypointId) : null;
  const endWp = day.toWaypointId ? waypointById(dataset.waypoints, day.toWaypointId) : null;

  const startPos: Position | null = startWp ? waypointPosition(startWp) : firstStationPos(stations);
  const lastStation = stations[stations.length - 1];
  const endPos: Position | null = endWp
    ? waypointPosition(endWp)
    : lastStation
      ? [lastStation.lon, lastStation.lat]
      : null;

  // Sunset varies by roughly four minutes per degree of longitude, and the
  // route spans about four degrees, so which end of the day is used matters by
  // about a quarter of an hour. Use the FINISH: that is the point where
  // running out of light is a problem.
  const sunReference = endPos ?? startPos;

  const sun = sunReference
    ? sunTimesForIsoDate(day.date, sunReference[1], sunReference[0])
    : null;

  const idx = dataset.days.findIndex((d) => d.id === day.id);
  let tomorrow: Day | null = null;
  for (let i = idx + 1; i < dataset.days.length; i++) {
    const d = dataset.days[i];
    if (d && d.kind === 'walk') {
      tomorrow = d;
      break;
    }
  }

  return {
    day,
    stations,
    bailouts,
    hazards,
    allWaypoints,
    startPos,
    endPos,
    sunReference,
    sunrise: sun?.sunrise ?? null,
    sunset: sun?.sunset ?? null,
    dayLengthMinutes: sun?.dayLengthMinutes ?? null,
    tomorrow,
  };
}

/** Where a point sits relative to the active route. */
export interface RouteProjection {
  stretchIndex: number;
  /** Distance from the start of that stretch, km. */
  alongKm: number;
  /** Perpendicular distance from the route to the point, km. */
  offRouteKm: number;
  /** The closest point on the route itself. */
  point: Position;
}

/**
 * Project a coordinate onto the active route.
 *
 * This is what makes "how far to the next exit" a real number rather than a
 * straight line across a hillside. Returns null only when there is no route.
 */
export function projectOntoRoute(
  stretches: readonly RouteStretch[],
  p: Position,
): RouteProjection | null {
  let best: RouteProjection | null = null;
  for (let i = 0; i < stretches.length; i++) {
    const s = stretches[i];
    if (!s) continue;
    const near = nearestPointOnLine(s.positions, p);
    if (!near) continue;
    if (best === null || near.offRouteKm < best.offRouteKm) {
      best = {
        stretchIndex: i,
        alongKm: near.alongKm,
        offRouteKm: near.offRouteKm,
        point: near.point,
      };
    }
  }
  return best;
}

export interface BailoutMeasure {
  feature: PointFeature;
  /** Walking distance along the route to the point nearest the exit, km. */
  alongRouteKm: number | null;
  /** Extra distance from the route to the exit itself, km. Straight line. */
  offRouteKm: number | null;
  /** alongRouteKm + offRouteKm — the figure to plan with. */
  totalKm: number | null;
  /** True when the exit lies ahead in the direction of travel. */
  ahead: boolean | null;
  /** Straight line from the current position, for comparison only. */
  straightLineKm: number | null;
  /** True when the exit sits on a different stretch, across a break. */
  acrossBreak: boolean;
}

/**
 * Measure each bailout against the route rather than as the crow flies.
 *
 * Rail stations are not on the walking line, so the honest answer has two
 * parts: the distance walked along the route to the nearest point, plus the
 * hop off the route to reach the station. The second part is still a straight
 * line and the UI says so.
 *
 * Direction matters. Walking Tokyo to Kyoto, distance along the route only
 * increases, so an exit with a smaller `alongKm` than the current position is
 * behind — which the old straight-line sort could not tell.
 */
export function measureBailouts(
  stretches: readonly RouteStretch[],
  bailouts: readonly PointFeature[],
  from: RouteProjection | null,
  fromPos: Position | null,
): BailoutMeasure[] {
  const measured = bailouts.map((f): BailoutMeasure => {
    const pos = waypointPosition(f);
    const proj = projectOntoRoute(stretches, pos);
    const straightLineKm = fromPos ? haversineKm(fromPos, pos) : null;

    if (!proj || !from) {
      return {
        feature: f,
        alongRouteKm: null,
        offRouteKm: proj?.offRouteKm ?? null,
        totalKm: null,
        ahead: null,
        straightLineKm,
        acrossBreak: false,
      };
    }

    const acrossBreak = proj.stretchIndex !== from.stretchIndex;
    const delta = proj.alongKm - from.alongKm;
    const alongRouteKm = acrossBreak ? null : Math.abs(delta);
    return {
      feature: f,
      alongRouteKm,
      offRouteKm: proj.offRouteKm,
      totalKm: alongRouteKm === null ? null : alongRouteKm + proj.offRouteKm,
      ahead: acrossBreak ? null : delta >= 0,
      straightLineKm,
      acrossBreak,
    };
  });

  // Exits ahead first, nearest first; anything unmeasurable last.
  return measured.sort((a, b) => {
    const rank = (m: BailoutMeasure): number => (m.ahead === true ? 0 : m.ahead === false ? 1 : 2);
    if (rank(a) !== rank(b)) return rank(a) - rank(b);
    return (a.totalKm ?? a.straightLineKm ?? Infinity) - (b.totalKm ?? b.straightLineKm ?? Infinity);
  });
}
