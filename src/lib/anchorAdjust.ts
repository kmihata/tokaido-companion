/**
 * Moving a shipped anchor onto the route.
 *
 * The anchors come from the source dataset, which is recorded GPS trajectories
 * from people who walked the road. Walkers start and finish at stations, so a
 * track near a station leans toward the forecourt, and an anchor projected onto
 * that track inherits the lean. 草薙駅前 sits 43 m off the line its neighbours
 * describe, and no amount of retracing fixes it: the anchor *is* the section
 * boundary, so a retraced section is pinned to exactly the wrong point.
 *
 * The margin is the real problem rather than the metres. An anchor resolves as
 * a day finish only while it lies within ANCHOR_TOLERANCE_KM of the route. At
 * 43 m that works; at 60 m the anchor silently stops being a valid day end and
 * the plan falls back to a stored kilometre. Nothing tells you.
 *
 * So this is a delta, stored on the device exactly like a route edit, never a
 * rewrite of the shipped data. The shipped anchor stays where the source put
 * it and can always be recovered by removing the adjustment.
 */
import type { AnchorFeature, RouteMeta } from '../data/schemas';
import type { PlanningLine } from './planningLine';
import { anchorAlongKm } from './dayPlan';
import { haversineKm, nearestPointOnLine } from './geo';
import type { Position } from './geo';

export const ANCHOR_ADJUST_SCHEMA_VERSION = 1;

/**
 * The furthest an anchor may be moved from where the source put it.
 *
 * This is a correction, not a relocation. Beyond half a kilometre the thing
 * being moved is no longer the place the source named, and a day boundary
 * would shift by more than a walker would notice on the ground — which is
 * exactly the kind of silent change this project keeps having to hunt down.
 */
export const MAX_ADJUST_KM = 0.5;

/** How close to the line a moved anchor has to land to count as "on" it. */
export const ADJUST_ON_ROUTE_TOLERANCE_KM = 0.02;

export interface AnchorAdjustment {
  schemaVersion: number;
  anchorId: string;
  /** Where the anchor is moved to. Always a point on the active route. */
  position: [number, number];
  /** Distance from the shipped position, kept for display and for the audit trail. */
  movedKm: number;
  /**
   * Why it was moved. Required, because an unexplained shifted anchor is
   * indistinguishable from a data error six months later.
   */
  note: string;
  savedAt: string;
}

export interface AnchorOffRoute {
  anchor: AnchorFeature;
  /** How far the anchor sits from the nearest point on the route. */
  offRouteM: number;
  /** Extra distance the route walks to touch it, if it is a vertex. */
  detourM: number;
  /** How sharply the line turns at the anchor. */
  turnDeg: number;
  /** How much the line's heading has changed once it is past the anchor. */
  netTurnDeg: number;
  /**
   * The line leaves its heading to touch this anchor and immediately resumes
   * it. That is the shape worth correcting; a plain corner is not.
   */
  isSpike: boolean;
  /** The route model depends on this anchor sitting exactly where it does. */
  structural: boolean;
  alongKm: number;
  adjusted: boolean;
}

/**
 * Anchors the route model is pinned to: where a path starts and ends, where a
 * variant leaves the main line and where it rejoins.
 *
 * These are refused, not warned about. The Saya Kaido junction reads as a
 * textbook spike — the line turns 84 degrees to reach it and carries on the way
 * it was going — because that is what a fork looks like once the active route
 * has been flattened into one line. Moving it would detach the variant from the
 * point it diverges at, which is how 45 km got added to this route once
 * already.
 */
export function structuralAnchorIds(
  meta: RouteMeta,
  anchors: readonly AnchorFeature[] = [],
): Set<string> {
  const ids = new Set<string>();
  for (const p of meta.paths) {
    if (p.startAnchorId) ids.add(p.startAnchorId);
    if (p.endAnchorId) ids.add(p.endAnchorId);
  }
  for (const v of meta.variants) {
    ids.add(v.divergeAnchorId);
    if (v.rejoinAnchorId) ids.add(v.rejoinAnchorId);
  }

  // A fork carries more than one anchor. 'Saya Kaido junction' is the pinned
  // one and 'Saya Kaido start' sits on the same spot, reporting the same 46 m
  // and the same 84 degrees, because both are describing the fork rather than
  // anything wrong. Pin the neighbours too: two anchors at one place with no
  // way to tell them apart is the precise shape of the incident this guard
  // exists to prevent.
  const pinnedPositions = anchors
    .filter((a) => ids.has(a.properties.id))
    .map((a) => [a.geometry.coordinates[0], a.geometry.coordinates[1]] as Position);
  if (pinnedPositions.length > 0) {
    for (const a of anchors) {
      if (ids.has(a.properties.id)) continue;
      const p: Position = [a.geometry.coordinates[0], a.geometry.coordinates[1]];
      if (pinnedPositions.some((q) => haversineKm(p, q) <= COINCIDENT_KM)) {
        ids.add(a.properties.id);
      }
    }
  }
  return ids;
}

/** Close enough to a pinned anchor to be describing the same join. */
const COINCIDENT_KM = 0.025;

/** A turn at least this sharp is worth examining. */
const SPIKE_TURN_DEG = 60;

/**
 * ...but only if the line is going the same way afterwards as before.
 *
 * This distinction is the whole value of the ranking. Post towns were built
 * with dog-leg junctions to slow traffic through them, so the old road really
 * does turn ninety degrees at a post station, and eight of the twelve sharpest
 * turns on the route are simply that. Ranking on the detour alone put
 * Tenryugawa Bridge and Hodogaya-juku at the top of a list of things to fix,
 * where there is nothing to fix. A spike goes out and comes back.
 */
const SPIKE_NET_DEG = 30;

export function makeAnchorAdjustment(
  anchor: AnchorFeature,
  position: Position,
  note: string,
  now: Date = new Date(),
): AnchorAdjustment {
  const from: Position = [anchor.geometry.coordinates[0], anchor.geometry.coordinates[1]];
  return {
    schemaVersion: ANCHOR_ADJUST_SCHEMA_VERSION,
    anchorId: anchor.properties.id,
    position: [Number(position[0].toFixed(6)), Number(position[1].toFixed(6))],
    movedKm: Math.round(haversineKm(from, position) * 1000) / 1000,
    note: note.trim(),
    savedAt: now.toISOString(),
  };
}

/**
 * Refuse an adjustment that would reorder the anchors.
 *
 * Moving an anchor past its neighbour renames which stretch is which: sections
 * invert, a day finishes before it starts, and the route length appears to
 * change without any geometry having moved. This is the same failure shape as
 * the two coincident junction anchors that put 45 km on the route, so it is
 * refused rather than warned about.
 */
export function validateAnchorAdjustment(
  line: PlanningLine,
  anchors: readonly AnchorFeature[],
  anchorId: string,
  position: Position,
  structuralIds: ReadonlySet<string> = new Set(),
): { ok: true } | { ok: false; reason: string } {
  const anchor = anchors.find((a) => a.properties.id === anchorId);
  if (!anchor) return { ok: false, reason: 'That anchor is not in the route data.' };
  if (structuralIds.has(anchorId)) {
    return {
      ok: false,
      reason:
        'The route is built around this anchor — it is where a path begins or ends, or where the Saya Kaido leaves the main line. Moving it would detach that join.',
    };
  }

  const near = nearestPointOnLine(line.positions, position);
  if (!near) return { ok: false, reason: 'No route loaded.' };
  if (near.offRouteKm > ADJUST_ON_ROUTE_TOLERANCE_KM) {
    return {
      ok: false,
      reason: `That point is ${Math.round(near.offRouteKm * 1000)} m off the route. An anchor has to sit on it, or it stops working as a day finish.`,
    };
  }

  const from: Position = [anchor.geometry.coordinates[0], anchor.geometry.coordinates[1]];
  const moved = haversineKm(from, position);
  if (moved > MAX_ADJUST_KM) {
    return {
      ok: false,
      reason: `That is ${Math.round(moved * 1000)} m from where the source put this anchor. The limit is ${MAX_ADJUST_KM * 1000} m — beyond that it is a different place, not a correction.`,
    };
  }

  // Neighbours along the route, by their current resolved positions.
  const ordered = anchors
    .map((a) => ({ id: a.properties.id, km: anchorAlongKm(line, anchors, a.properties.id) }))
    .filter((x): x is { id: string; km: number } => x.km !== null)
    .sort((a, b) => a.km - b.km);
  const i = ordered.findIndex((x) => x.id === anchorId);
  if (i >= 0) {
    const before = ordered[i - 1];
    const after = ordered[i + 1];
    if (before && near.alongKm <= before.km) {
      return { ok: false, reason: 'That would move this anchor past the one before it on the route.' };
    }
    if (after && near.alongKm >= after.km) {
      return { ok: false, reason: 'That would move this anchor past the one after it on the route.' };
    }
  }

  return { ok: true };
}

/**
 * Layer the adjustments onto the shipped anchors.
 *
 * Only the geometry and the stored `alongKm` move. Everything downstream
 * resolves an anchor's position from its geometry, so an adjusted anchor is
 * simply where it now is; `alongKm` is carried along by the same delta so the
 * reference-layer export does not disagree with the map.
 */
export function applyAnchorAdjustments(
  anchors: readonly AnchorFeature[],
  adjustments: readonly AnchorAdjustment[],
): AnchorFeature[] {
  if (adjustments.length === 0) return anchors as AnchorFeature[];
  const byId = new Map(adjustments.map((a) => [a.anchorId, a]));
  return anchors.map((anchor) => {
    const adj = byId.get(anchor.properties.id);
    if (!adj) return anchor;
    const from: Position = [anchor.geometry.coordinates[0], anchor.geometry.coordinates[1]];
    const delta = haversineKm(from, adj.position);
    return {
      ...anchor,
      geometry: { ...anchor.geometry, coordinates: [adj.position[0], adj.position[1]] },
      properties: {
        ...anchor.properties,
        alongKm: Math.round((anchor.properties.alongKm + signedAlong(from, adj.position, delta)) * 1000) / 1000,
        verification: 'manually-traced' as const,
        source: `${anchor.properties.source} — position adjusted on device`,
      },
    };
  });
}

/**
 * Which way along the route the move went.
 *
 * Only the sign matters and only for the stored `alongKm`; a move is at most
 * MAX_ADJUST_KM, so treating the route as locally straight is fine here.
 */
function signedAlong(from: Position, to: Position, delta: number): number {
  return to[1] < from[1] || (to[1] === from[1] && to[0] < from[0]) ? delta : -delta;
}

/**
 * Anchors ranked by how badly the line detours to touch them.
 *
 * Spikes first, largest detour first within that, because a spike is the only
 * shape here that is actually wrong.
 */
export function anchorsOffRoute(
  line: PlanningLine,
  anchors: readonly AnchorFeature[],
  adjustments: readonly AnchorAdjustment[],
  structuralIds: ReadonlySet<string> = new Set(),
): AnchorOffRoute[] {
  const adjusted = new Set(adjustments.map((a) => a.anchorId));
  const out: AnchorOffRoute[] = [];
  for (const anchor of anchors) {
    const target: Position = [anchor.geometry.coordinates[0], anchor.geometry.coordinates[1]];
    const near = nearestPointOnLine(line.positions, target);
    if (!near) continue;
    const shape = vertexShape(line, target);
    out.push({
      anchor,
      offRouteM: Math.round(near.offRouteKm * 1000),
      detourM: shape.detourM,
      turnDeg: shape.turnDeg,
      netTurnDeg: shape.netTurnDeg,
      isSpike: shape.turnDeg >= SPIKE_TURN_DEG && shape.netTurnDeg < SPIKE_NET_DEG,
      structural: structuralIds.has(anchor.properties.id),
      alongKm: near.alongKm,
      adjusted: adjusted.has(anchor.properties.id),
    });
  }
  return out.sort(
    (a, b) =>
      Number(b.isSpike) - Number(a.isSpike) ||
      b.detourM - a.detourM ||
      b.offRouteM - a.offRouteM,
  );
}

interface VertexShape {
  detourM: number;
  turnDeg: number;
  netTurnDeg: number;
}

/**
 * What the line does at this point.
 *
 * `detourM` is the extra distance walked because the line visits it. When the
 * anchor is itself a vertex — which is the Kusanagi case — the number that
 * matters is not how far it is from the line (zero, it *is* the line) but how
 * far the line goes out of its way to reach it.
 */
function vertexShape(line: PlanningLine, p: Position): VertexShape {
  const none: VertexShape = { detourM: 0, turnDeg: 0, netTurnDeg: 0 };
  let i = -1;
  for (let k = 0; k < line.positions.length; k++) {
    const q = line.positions[k]!;
    if (Math.abs(q[0] - p[0]) < 1e-7 && Math.abs(q[1] - p[1]) < 1e-7) {
      i = k;
      break;
    }
  }
  if (i <= 0 || i >= line.positions.length - 1) return none;

  const a = line.positions[i - 1]!;
  const c = line.positions[i + 1]!;
  const detourM = Math.round((haversineKm(a, p) + haversineKm(p, c) - haversineKm(a, c)) * 1000);
  const incoming = bearingDeg(a, p);
  const turnDeg = Math.round(angleBetween(incoming, bearingDeg(p, c)));

  // Compare the heading before the anchor with the heading once the line is
  // past it, so an excursion that returns to its old course is visible.
  const d = line.positions[i + 2];
  const netTurnDeg = d ? Math.round(angleBetween(incoming, bearingDeg(c, d))) : turnDeg;

  return { detourM, turnDeg, netTurnDeg };
}

function bearingDeg(a: Position, b: Position): number {
  const la1 = (a[1] * Math.PI) / 180;
  const la2 = (b[1] * Math.PI) / 180;
  const dLon = ((b[0] - a[0]) * Math.PI) / 180;
  const y = Math.sin(dLon) * Math.cos(la2);
  const x = Math.cos(la1) * Math.sin(la2) - Math.sin(la1) * Math.cos(la2) * Math.cos(dLon);
  return (Math.atan2(y, x) * 180) / Math.PI;
}

function angleBetween(b1: number, b2: number): number {
  const t = Math.abs(b1 - b2);
  return t > 180 ? 360 - t : t;
}
