/**
 * Route exports.
 *
 * Two destinations, two formats:
 *
 *  - **GPX for Footpath.** One `<trk>` per continuous stretch, never one `<trk>`
 *    with several `<trkseg>`. Tested on device 2026-08-20: Footpath silently
 *    bridges multiple segments inside one track — on this route that draws
 *    21 km straight across Ise Bay — but treats multiple `<trk>` elements as
 *    separate routes and offers to save them as a named list. See the Footpath
 *    section of HANDOFF.md.
 *
 *  - **GeoJSON for an external editor.** A reference layer of anchors, hazards
 *    and waypoints to load underneath while tracing in gpx.studio or similar,
 *    so the Tokaido furniture is visible instead of bare OSM.
 *
 * Pure functions over already-loaded data. No network, no file system; the
 * caller hands the string to the share sheet.
 */
import type { Dataset, RouteStretch } from '../data/load';
import type { DayLeg } from './dayPlan';
import type { UserPoint } from './userPoints';
import { publicOnly } from './userPoints';
import type { Position } from './geo';
import { formatDayLabel } from './time';

const esc = (s: string): string =>
  s.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c] ?? c,
  );

const coord = (n: number): string => n.toFixed(6);

export interface GpxTrack {
  name: string;
  positions: readonly Position[];
}

export interface GpxWaypoint {
  name: string;
  description?: string;
  position: Position;
}

/**
 * Write a GPX document.
 *
 * `listName` becomes `<metadata><name>`, which Footpath uses as the name of the
 * list it creates when a file contains more than one track. Each track's own
 * name becomes the name of a route inside that list. Names truncate at roughly
 * 25 characters in Footpath's list rows, so put the discriminator first.
 */
export function toGpx(
  listName: string,
  description: string,
  tracks: readonly GpxTrack[],
  waypoints: readonly GpxWaypoint[] = [],
  generatedAt: Date = new Date(),
): string {
  const usable = tracks.filter((t) => t.positions.length >= 2);
  if (usable.length === 0) throw new Error('Nothing to export: no track has two or more points.');

  const parts: string[] = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<gpx version="1.1" creator="Samwise — Tokaido Field Companion"',
    '     xmlns="http://www.topografix.com/GPX/1/1"',
    '     xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"',
    '     xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">',
    '  <metadata>',
    `    <name>${esc(listName)}</name>`,
    `    <desc>${esc(description)}</desc>`,
    `    <time>${generatedAt.toISOString()}</time>`,
    '  </metadata>',
  ];

  for (const w of waypoints) {
    parts.push(`  <wpt lat="${coord(w.position[1])}" lon="${coord(w.position[0])}">`);
    parts.push(`    <name>${esc(w.name)}</name>`);
    if (w.description) parts.push(`    <desc>${esc(w.description)}</desc>`);
    parts.push('  </wpt>');
  }

  for (const t of usable) {
    parts.push('  <trk>');
    parts.push(`    <name>${esc(t.name)}</name>`);
    parts.push('    <trkseg>');
    for (const [lon, lat] of t.positions) {
      parts.push(`      <trkpt lat="${coord(lat)}" lon="${coord(lon)}"></trkpt>`);
    }
    parts.push('    </trkseg>');
    parts.push('  </trk>');
  }

  parts.push('</gpx>');
  return parts.join('\n') + '\n';
}

/** Short, front-loaded track name for a stretch. */
export function stretchTrackName(index: number, total: number, s: RouteStretch): string {
  const n = total > 1 ? `${index + 1}/${total} ` : '';
  return `TOKAIDO ${n}— ${s.lengthKm.toFixed(0)} km`;
}

/**
 * The whole active route as one file, one track per continuous stretch.
 *
 * Gaps are preserved by construction: a stretch ends where the route breaks,
 * and nothing is drawn across it.
 */
export function masterRouteGpx(dataset: Dataset, generatedAt: Date = new Date()): string {
  const { stretches, routeMeta, waypoints } = dataset;
  const tracks: GpxTrack[] = stretches.map((s, i) => ({
    name: stretchTrackName(i, stretches.length, s),
    positions: s.positions,
  }));

  const wpts: GpxWaypoint[] = waypoints
    .filter((w) => ['rail-bailout', 'hazard', 'water', 'ferry-gap', 'river-crossing'].includes(w.properties.type))
    .map((w) => ({
      name: w.properties.title,
      description: [
        w.properties.type,
        w.properties.safetyNotes ?? w.properties.operationalNotes ?? '',
        `${w.properties.confidence} / ${w.properties.verification}`,
      ]
        .filter(Boolean)
        .join(' · '),
      position: [w.geometry.coordinates[0], w.geometry.coordinates[1]] as Position,
    }));

  return toGpx(
    'TOKAIDO MASTER — reference',
    `Unverified reference route. ${routeMeta.source.attribution}. ${routeMeta.notice}`,
    tracks,
    wpts,
    generatedAt,
  );
}

/**
 * Reference layer for an external route editor.
 *
 * Load this underneath in gpx.studio or CalTopo so the post stations, passes,
 * bridges and known hazards are visible while tracing, instead of bare OSM.
 */
export function referenceLayerGeoJson(dataset: Dataset, userPoints: readonly UserPoint[] = []): string {
  const features = [
    // Kevin's own public points. Private ones — lodging, anything he marked —
    // are filtered here and asserted absent by tests/build/bundle.test.ts.
    ...publicOnly(userPoints).map((p) => ({
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: [p.lon, p.lat] },
      properties: {
        name: p.title,
        layer: 'user-point',
        kind: p.type,
        notes: p.notes || null,
        confidence: p.confidence,
        verification: p.verification,
        positionSource: 'user-placed',
      },
    })),
    ...dataset.anchors.map((a) => ({
      type: 'Feature' as const,
      geometry: a.geometry,
      properties: {
        name: a.properties.title,
        nameJa: a.properties.titleJa,
        layer: 'anchor',
        kind: a.properties.kind,
        stationNumber: a.properties.stationNumber,
        alongKm: a.properties.alongKm,
      },
    })),
    ...dataset.waypoints.map((w) => ({
      type: 'Feature' as const,
      geometry: w.geometry,
      properties: {
        name: w.properties.title,
        layer: 'waypoint',
        kind: w.properties.type,
        notes: w.properties.safetyNotes ?? w.properties.operationalNotes ?? null,
        confidence: w.properties.confidence,
        verification: w.properties.verification,
        positionSource: w.properties.positionSource,
      },
    })),
  ];

  return (
    JSON.stringify(
      {
        type: 'FeatureCollection',
        name: 'Samwise reference layer — Tokaido',
        attribution: dataset.routeMeta.source.attribution,
        notice: dataset.routeMeta.notice,
        features,
      },
      null,
      2,
    ) + '\n'
  );
}

/** The active alignment as GeoJSON, one LineString per continuous stretch. */
export function activeRouteGeoJson(dataset: Dataset): string {
  return (
    JSON.stringify(
      {
        type: 'FeatureCollection',
        name: 'Samwise active route — Tokaido',
        attribution: dataset.routeMeta.source.attribution,
        notice: dataset.routeMeta.notice,
        features: dataset.stretches.map((s) => ({
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: s.positions },
          properties: {
            name: s.title,
            memberIds: s.memberIds,
            lengthKm: s.lengthKm,
            navigational: false,
          },
        })),
      },
      null,
      2,
    ) + '\n'
  );
}

// ---------------------------------------------------------------------------
// Per-day export — the nightly file
// ---------------------------------------------------------------------------

/**
 * One day, one file, several tracks.
 *
 * Footpath reads multiple `<trk>` elements as multiple routes and offers to
 * save them all into a list named from `<metadata><name>`. So a whole evening's
 * preparation is one trip through the share sheet and one tap, instead of three
 * sequential save-or-lose imports. Measured on device 2026-08-20.
 *
 * Names are front-loaded because Footpath truncates list rows at roughly 25
 * characters: "D04 ACTIVE" and "D04 CONTINUE" diverge at character five.
 */
export function dayGpx(
  dataset: Dataset,
  leg: DayLeg,
  generatedAt: Date = new Date(),
  userPoints: readonly UserPoint[] = [],
): string {
  const n = String(leg.plan.walkingDayNumber).padStart(2, '0');
  const day = leg.day;
  const dateLabel = day ? formatDayLabel(new Date(`${day.date}T12:00:00+09:00`)) : '';
  const from = day?.from ?? anchorTitle(dataset, leg.startAnchorId) ?? 'start';
  const to = day?.to ?? anchorTitle(dataset, leg.endAnchorId) ?? 'finish';

  const tracks: GpxTrack[] = [
    { name: `D${n} ACTIVE — ${from} to ${to}`, positions: leg.positions },
  ];

  if (leg.continuation) {
    const beyond = anchorTitle(dataset, leg.plan.continueToAnchorId) ?? 'onward';
    tracks.push({
      name: `D${n} CONTINUE — ${to} toward ${beyond}`,
      positions: leg.continuation.positions,
    });
  }

  const dayIds = day ? [day.id] : [];
  const wpts: GpxWaypoint[] = dataset.waypoints
    .filter(
      (w) =>
        w.properties.dayIds.some((id) => dayIds.includes(id)) &&
        ['rail-bailout', 'hazard', 'water', 'food', 'resupply', 'ferry-gap', 'river-crossing'].includes(
          w.properties.type,
        ),
    )
    .map((w) => ({
      name: w.properties.title,
      description: [
        w.properties.type,
        w.properties.safetyNotes ?? w.properties.operationalNotes ?? '',
        `${w.properties.confidence} / ${w.properties.verification}`,
      ]
        .filter(Boolean)
        .join(' · '),
      position: [w.geometry.coordinates[0], w.geometry.coordinates[1]] as Position,
    }));

  // Kevin's own public points that fall inside this day, so a station or a
  // water stop he added shows up in Footpath while he is walking. Private
  // points — lodging especially — never leave the device.
  const [fromKm, toKm] = [leg.startAlongKm, leg.continuation?.toAlongKm ?? leg.endAlongKm];
  for (const p of publicOnly(userPoints)) {
    if (!p.onRoute) continue;
    if (p.onRoute.alongKm < fromKm || p.onRoute.alongKm > toKm) continue;
    wpts.push({
      name: p.title,
      description: [p.type, p.notes, 'added by me'].filter(Boolean).join(' · '),
      position: [p.lon, p.lat] as Position,
    });
  }

  const desc = [
    `Walking day ${leg.plan.walkingDayNumber}${dateLabel ? `, ${dateLabel}` : ''}.`,
    `Active ${leg.distanceKm.toFixed(1)} km${leg.continuation ? `, continuation +${leg.continuation.extraKm.toFixed(1)} km` : ''}.`,
    `Unverified. ${dataset.routeMeta.source.attribution}.`,
    'Elevation intentionally omitted: Footpath substitutes its own terrain model.',
  ].join(' ');

  return toGpx(`Tokaido D${n}${dateLabel ? ` — ${dateLabel}` : ''}`, desc, tracks, wpts, generatedAt);
}

function anchorTitle(dataset: Dataset, anchorId: string | null): string | null {
  if (!anchorId) return null;
  return dataset.anchors.find((a) => a.properties.id === anchorId)?.properties.title ?? null;
}

/** Filename for a day package. Sorts correctly and reads at a glance. */
export function dayGpxFilename(leg: DayLeg): string {
  const n = String(leg.plan.walkingDayNumber).padStart(2, '0');
  const date = leg.day?.date ?? 'undated';
  return `Tokaido-D${n}-${date}.gpx`;
}

/** Plain-text daily summary, for pasting anywhere or printing as backup. */
export function daySummaryText(dataset: Dataset, leg: DayLeg): string {
  const day = leg.day;
  const lines: string[] = [];
  const push = (s = ''): void => void lines.push(s);

  push(`WALKING DAY ${leg.plan.walkingDayNumber}${day ? ` — ${day.date}` : ''}`);
  if (day) push(day.label);
  push('='.repeat(56));
  push();
  push(`Planned distance   ${leg.distanceKm.toFixed(1)} km / ${(leg.distanceKm * 0.621371).toFixed(1)} mi`);
  if (leg.draftKm !== null) {
    const sign = (leg.deltaKm ?? 0) >= 0 ? '+' : '';
    push(`Draft schedule     ${leg.draftKm.toFixed(1)} km (${sign}${(leg.deltaKm ?? 0).toFixed(1)} km)`);
  }
  push(`Cumulative         ${leg.cumulativeKm.toFixed(1)} km`);
  if (leg.continuation) {
    push(`Continuation       +${leg.continuation.extraKm.toFixed(1)} km beyond the planned finish`);
  }
  push();

  if (day) {
    if (day.startLightGuidance) push(`START: ${day.startLightGuidance}`);
    if (day.railRedundancy) push(`RAIL:  ${day.railRedundancy}`);
    if (day.sleepBase) push(`SLEEP: ${day.sleepBase}`);
    push();
    if (day.safetyNotes.length) {
      push('SAFETY');
      for (const s of day.safetyNotes) push(`  - ${s}`);
      push();
    }
    if (day.weatherSensitive.length) {
      push('WEATHER-SENSITIVE');
      for (const s of day.weatherSensitive) push(`  - ${s}`);
      push();
    }
    const bailouts = dataset.waypoints.filter(
      (w) => w.properties.type === 'rail-bailout' && w.properties.dayIds.includes(day.id),
    );
    if (bailouts.length) {
      push('BAILOUTS');
      for (const b of bailouts) push(`  - ${b.properties.title}`);
      push();
    }
    push(`TIRED-DAY VIEW: ${day.tiredDaySummary}`);
    push();
  }

  push('-'.repeat(56));
  push('Unverified route. Not checked on the ground. Navigate with a real map.');
  push(dataset.routeMeta.source.attribution);
  return lines.join('\n') + '\n';
}
