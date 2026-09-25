/**
 * Cutting one section of the route out for editing elsewhere.
 *
 * Editing 534 km in a single browser document is how 49 km of accidental
 * backtrack got appended to the end without anyone noticing. A section between
 * two named anchors is five to fifteen kilometres — small enough to see whole,
 * and small enough that anything unexpected is obvious.
 *
 * The export carries the neighbouring anchors and public waypoints as GPX
 * waypoints, so the Tokaido furniture is visible while tracing instead of bare
 * OSM. Coming back, the importer's nearest-anchor detection lands on exactly
 * the two ends this cut from.
 *
 * Pure. Unit-tested in tests/unit/sectionExport.test.ts.
 */
import type { AnchorFeature, PointFeature } from '../data/schemas';
import type { PlanningLine } from './planningLine';
import { sliceLine } from './planningLine';
import { anchorAlongKm } from './dayPlan';
import { haversineKm } from './geo';
import type { Position } from './geo';
import { toGpx } from './routeExport';
import type { GpxWaypoint } from './routeExport';
import type { UserPoint } from './userPoints';
import { publicOnly } from './userPoints';

export interface SectionStats {
  fromAnchorId: string;
  toAnchorId: string;
  fromTitle: string;
  toTitle: string;
  fromKm: number;
  toKm: number;
  lengthKm: number;
  pointCount: number;
  /** Mean distance between consecutive points, metres. */
  meanSpacingM: number;
  /** Largest single step, metres. The thing that cuts corners. */
  maxGapM: number;
}

/** Anchors that lie on the active line, in route order. */
export function anchorsAlongRoute(
  line: PlanningLine,
  anchors: readonly AnchorFeature[],
): { anchor: AnchorFeature; alongKm: number }[] {
  return anchors
    .map((anchor) => ({ anchor, alongKm: anchorAlongKm(line, anchors, anchor.properties.id) }))
    .filter((x): x is { anchor: AnchorFeature; alongKm: number } => x.alongKm !== null)
    .sort((a, b) => a.alongKm - b.alongKm);
}

export function sectionGeometry(
  line: PlanningLine,
  anchors: readonly AnchorFeature[],
  fromAnchorId: string,
  toAnchorId: string,
): Position[] {
  const fromKm = anchorAlongKm(line, anchors, fromAnchorId);
  const toKm = anchorAlongKm(line, anchors, toAnchorId);
  if (fromKm === null || toKm === null) return [];
  return sliceLine(line, fromKm, toKm);
}

export function sectionStats(
  line: PlanningLine,
  anchors: readonly AnchorFeature[],
  fromAnchorId: string,
  toAnchorId: string,
): SectionStats | null {
  const from = anchors.find((a) => a.properties.id === fromAnchorId);
  const to = anchors.find((a) => a.properties.id === toAnchorId);
  if (!from || !to) return null;
  const fromKm = anchorAlongKm(line, anchors, fromAnchorId);
  const toKm = anchorAlongKm(line, anchors, toAnchorId);
  if (fromKm === null || toKm === null) return null;

  const lo = Math.min(fromKm, toKm);
  const hi = Math.max(fromKm, toKm);
  const positions = sliceLine(line, lo, hi);
  if (positions.length < 2) return null;

  let maxGap = 0;
  let total = 0;
  for (let i = 1; i < positions.length; i++) {
    const d = haversineKm(positions[i - 1]!, positions[i]!);
    total += d;
    if (d > maxGap) maxGap = d;
  }

  return {
    fromAnchorId,
    toAnchorId,
    fromTitle: from.properties.title,
    toTitle: to.properties.title,
    fromKm: lo,
    toKm: hi,
    lengthKm: total,
    pointCount: positions.length,
    meanSpacingM: (total * 1000) / (positions.length - 1),
    maxGapM: maxGap * 1000,
  };
}

/**
 * Every adjacent-anchor section, coarsest first.
 *
 * "Coarse" is a proxy for "cuts corners", which is what makes a cue sheet say
 * `Unknown path` and what makes a distance an underestimate. Very short
 * sections are excluded: two anchors 200 m apart say nothing useful about
 * sampling.
 */
export function sectionsByCoarseness(
  line: PlanningLine,
  anchors: readonly AnchorFeature[],
  minLengthKm = 0.4,
): SectionStats[] {
  const ordered = anchorsAlongRoute(line, anchors);
  const out: SectionStats[] = [];
  for (let i = 0; i < ordered.length - 1; i++) {
    const a = ordered[i]!;
    const b = ordered[i + 1]!;
    if (b.alongKm - a.alongKm < minLengthKm) continue;
    const s = sectionStats(line, anchors, a.anchor.properties.id, b.anchor.properties.id);
    if (s) out.push(s);
  }
  return out.sort((x, y) => y.meanSpacingM - x.meanSpacingM);
}

/** Filename that says what it is and sorts sensibly. */
export function sectionFilename(stats: SectionStats): string {
  const slug = (s: string): string =>
    s
      .normalize('NFKD')
      .replace(/[^\w\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .slice(0, 28);
  return `section-${Math.round(stats.fromKm)}km-${slug(stats.fromTitle)}-to-${slug(stats.toTitle)}.gpx`;
}

/**
 * The section as a GPX, with the surrounding furniture as waypoints.
 *
 * `contextKm` widens the waypoint net either side so the anchors just beyond
 * the cut are visible too — useful for seeing where the section is going.
 */
export function sectionGpx(
  line: PlanningLine,
  anchors: readonly AnchorFeature[],
  waypoints: readonly PointFeature[],
  stats: SectionStats,
  userPoints: readonly UserPoint[] = [],
  contextKm = 2,
  generatedAt: Date = new Date(),
): string {
  const positions = sliceLine(line, stats.fromKm, stats.toKm);
  const lo = stats.fromKm - contextKm;
  const hi = stats.toKm + contextKm;

  const wpts: GpxWaypoint[] = [];

  for (const { anchor, alongKm } of anchorsAlongRoute(line, anchors)) {
    if (alongKm < lo || alongKm > hi) continue;
    const p = anchor.properties;
    wpts.push({
      name: p.title,
      description: [p.titleJa, p.kind, p.stationNumber !== null ? `station #${p.stationNumber}` : '']
        .filter(Boolean)
        .join(' · '),
      position: [anchor.geometry.coordinates[0], anchor.geometry.coordinates[1]] as Position,
    });
  }

  // Operational waypoints near the section — hazards especially. These are the
  // reason to trace with the furniture visible rather than over bare OSM.
  const near = (p: Position): boolean => {
    const slice = sliceLine(line, Math.max(0, lo), Math.min(line.lengthKm, hi));
    return slice.some((q) => haversineKm(p, q) < 1.5);
  };
  for (const w of waypoints) {
    const p: Position = [w.geometry.coordinates[0], w.geometry.coordinates[1]];
    if (w.properties.type === 'hotel') continue;
    if (!near(p)) continue;
    wpts.push({
      name: w.properties.title,
      description: [w.properties.type, w.properties.safetyNotes ?? w.properties.operationalNotes ?? '']
        .filter(Boolean)
        .join(' · '),
      position: p,
    });
  }
  for (const u of publicOnly(userPoints)) {
    const p: Position = [u.lon, u.lat];
    if (!near(p)) continue;
    wpts.push({ name: u.title, description: [u.type, u.notes, 'added by me'].filter(Boolean).join(' · '), position: p });
  }

  const name = `Section — ${stats.fromTitle} to ${stats.toTitle}`;
  const desc = [
    `${stats.lengthKm.toFixed(1)} km, ${stats.pointCount} points, mean spacing ${Math.round(stats.meanSpacingM)} m.`,
    `Route km ${stats.fromKm.toFixed(1)} to ${stats.toKm.toFixed(1)}.`,
    'Trace with road snapping on, then import back into Samwise as a replaced section.',
    'Waypoints are context only — do not export them back.',
  ].join(' ');

  return toGpx(name, desc, [{ name, positions }], wpts, generatedAt);
}
