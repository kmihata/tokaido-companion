/**
 * Changes Kevin makes to the route.
 *
 * EVERY EDIT IS A VARIANT. Nothing mutates the imported source geometry, which
 * buys three things at once:
 *
 *  - the original stays intact and comparable on the map;
 *  - an edit is undone by deactivating it, not by restoring a backup;
 *  - anchors never need reindexing, because no path is spliced. An anchor that
 *    falls inside a replaced section simply stops being on the active line, and
 *    `anchorAlongKm` already returns null for that.
 *
 * A variant that diverges and rejoins the SAME path is a replaced section. One
 * that resolves a gap closes a discontinuity. One that diverges and never
 * rejoins runs on to the end — which is how the missing Kyoto approach gets
 * added.
 *
 * AND one whose two ends both lie on an existing VARIANT is an edit to that
 * variant: its geometry is spliced in place rather than added alongside. That
 * case is not optional. Adding it alongside makes two alignments leave the
 * route at the same junction, and `buildStretches` walks both — which on the
 * Saya Kaido added 45 km of route that does not exist.
 *
 * Edits live in IndexedDB as a delta on top of the shipped route, and are
 * exportable so a permanent change can be baked into public/data/ by the build.
 * The shipped route stays recoverable from the network; only the delta is at
 * risk from a storage eviction, and only the delta needs backing up.
 */
import type { AnchorFeature, RouteFeature, RouteMeta, VariantSummary } from '../data/schemas';
import type { Position } from './geo';
import { lineLengthKm } from './geo';
import { ANCHOR_TOLERANCE_KM } from './dayPlan';

export const ROUTE_EDIT_SCHEMA_VERSION = 1;

export type RouteEditKind = 'replace-section' | 'resolve-gap' | 'add-variant';

export interface RouteEdit {
  schemaVersion: number;
  id: string;
  createdAt: string;
  kind: RouteEditKind;
  label: string;
  reason: string;
  /** Where the geometry came from. Never invented, always recorded. */
  origin: { filename: string; trackName: string | null; format: string; importedAt: string };
  divergeAnchorId: string;
  /** Null when the edit runs on to the end of the route. */
  rejoinAnchorId: string | null;
  /** Set when the edit closes a gap. */
  replacesPathId: string | null;
  geometry: Position[];
  lengthKm: number;
  active: boolean;
  verification: 'imported' | 'manually-traced' | 'desk-checked' | 'street-view-checked' | 'field-checked';
}

export function newRouteEditId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return `edit-${crypto.randomUUID()}`;
  return `edit-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export interface MakeRouteEditInput {
  kind: RouteEditKind;
  label: string;
  reason?: string;
  origin: RouteEdit['origin'];
  divergeAnchorId: string;
  rejoinAnchorId?: string | null;
  replacesPathId?: string | null;
  geometry: Position[];
  verification?: RouteEdit['verification'];
  active?: boolean;
}

export function makeRouteEdit(input: MakeRouteEditInput): RouteEdit {
  return {
    schemaVersion: ROUTE_EDIT_SCHEMA_VERSION,
    id: newRouteEditId(),
    createdAt: new Date().toISOString(),
    kind: input.kind,
    label: input.label.trim(),
    reason: (input.reason ?? '').trim(),
    origin: input.origin,
    divergeAnchorId: input.divergeAnchorId,
    rejoinAnchorId: input.rejoinAnchorId ?? null,
    replacesPathId: input.replacesPathId ?? null,
    geometry: input.geometry,
    lengthKm: lineLengthKm(input.geometry),
    active: input.active ?? true,
    verification: input.verification ?? 'imported',
  };
}

/** Metres under a kilometre, kilometres above, because 50801 m reads as noise. */
function gapText(km: number): string {
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(2)} km`;
}

export type EditValidation = { ok: true; warnings: string[] } | { ok: false; errors: string[] };

/**
 * How far an edit's endpoint may sit from its anchor before it is refused.
 *
 * Lowered from 0.25 to match ANCHOR_TOLERANCE_KM on 2026-09-20. It used to
 * error at 250 m and merely warn above 20 m, while `apply-route-edits.mjs`
 * refuses anything past 50 m — so between those two numbers there was a band
 * where the desk said "adopted, now bake it" about an edit that could never be
 * baked. Yunoki Station to Fujikawa Bridge landed in it at 103 m: the trace was
 * accepted, adopted, and then refused by the baker, leaving finished work
 * stranded in IndexedDB with a card telling Kevin it was not safe there.
 *
 * An edit that cannot be baked can only live on the device, and device state is
 * precisely what this project has learned not to trust. Refuse it at the door.
 */
export const EDIT_JOIN_TOLERANCE_KM = ANCHOR_TOLERANCE_KM;

/**
 * Check an edit against the route before adopting it.
 *
 * The endpoints have to actually meet the anchors they claim to join, or the
 * assembled route acquires an invisible jump — the same failure as a bridged
 * gap, just self-inflicted.
 */
export function validateRouteEdit(
  input: MakeRouteEditInput,
  anchors: readonly AnchorFeature[],
): EditValidation {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!input.label.trim()) errors.push('Give the change a name.');
  if (input.geometry.length < 2) errors.push('The geometry needs at least two points.');

  const diverge = anchors.find((a) => a.properties.id === input.divergeAnchorId);
  if (!diverge) errors.push('The start anchor was not found.');
  const rejoin = input.rejoinAnchorId
    ? anchors.find((a) => a.properties.id === input.rejoinAnchorId)
    : null;
  if (input.rejoinAnchorId && !rejoin) errors.push('The rejoin anchor was not found.');

  if (errors.length) return { ok: false, errors };

  const first = input.geometry[0]!;
  const last = input.geometry[input.geometry.length - 1]!;
  const dStart = gapKm(first, diverge!);
  if (dStart > EDIT_JOIN_TOLERANCE_KM) {
    errors.push(
      `The geometry starts ${gapText(dStart)} from ${diverge!.properties.title}, past the ${Math.round(EDIT_JOIN_TOLERANCE_KM * 1000)} m the baker allows. Extend the trace to the anchor and export again — adopting it here would strand it on this machine.`,
    );
  } else if (dStart > 0.02) {
    warnings.push(`The start is ${Math.round(dStart * 1000)} m from ${diverge!.properties.title}.`);
  }

  if (rejoin) {
    /**
     * Both ends must sit on the same piece of the route, unless the edit is
     * closing a gap between two pieces. Otherwise the edit describes a jump
     * from one alignment to another, and the assembled route either walks both
     * or silently walks neither.
     *
     * This is the check that would have caught the Saya Kaido case: a section
     * cut from the Saya came back matched to the coincident junction anchor on
     * the Tokaido, and the result added 45 km of route that does not exist.
     */
    if (!input.replacesPathId && rejoin.properties.pathId !== diverge!.properties.pathId) {
      errors.push(
        `${diverge!.properties.title} is on ${diverge!.properties.pathId} but ${rejoin.properties.title} is on ${rejoin.properties.pathId}. Both ends have to be on the same part of the route. If two points share a coordinate, pick the one on the same alignment as the other end.`,
      );
    }

    const dEnd = gapKm(last, rejoin);
    if (dEnd > EDIT_JOIN_TOLERANCE_KM) {
      errors.push(
        `The geometry ends ${gapText(dEnd)} from ${rejoin.properties.title}, past the ${Math.round(EDIT_JOIN_TOLERANCE_KM * 1000)} m the baker allows. Extend the trace to the anchor and export again, or pick a different rejoin point — adopting it here would strand it on this machine.`,
      );
    } else if (dEnd > 0.02) {
      warnings.push(`The end is ${Math.round(dEnd * 1000)} m from ${rejoin.properties.title}.`);
    }
    if (rejoin.properties.pathId === diverge!.properties.pathId) {
      if (rejoin.properties.indexOnPath <= diverge!.properties.indexOnPath) {
        errors.push('The rejoin point comes before the start point on the route.');
      }
    }
  }

  return errors.length ? { ok: false, errors } : { ok: true, warnings };
}

function gapKm(p: Position, anchor: AnchorFeature): number {
  const [lon, lat] = anchor.geometry.coordinates;
  const R = 6371.0088;
  const rad = (d: number): number => (d * Math.PI) / 180;
  const h =
    Math.sin(rad(lat - p[1]) / 2) ** 2 +
    Math.cos(rad(p[1])) * Math.cos(rad(lat)) * Math.sin(rad(lon - p[0]) / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Layer the edits onto the shipped route, producing the meta and features the
 * rest of the app consumes. Inactive edits are still returned, so the map can
 * draw them for comparison.
 */
export interface AppliedEdits {
  meta: RouteMeta;
  features: RouteFeature[];
  /** Ids of edits an overlapping, newer edit has replaced. */
  superseded: string[];
}

/**
 * Layer the edits onto the shipped route.
 *
 * **The newest edit wins where two overlap.** Retracing a section and adopting
 * the result is the normal way to improve it, and without this the first
 * version adopted would keep winning while the newer one sat in the list doing
 * nothing — visible in the app, absent from the route. Superseded ids are
 * returned so the UI can say which, rather than leaving it to be discovered.
 */
export function applyRouteEdits(
  meta: RouteMeta,
  features: readonly RouteFeature[],
  edits: readonly RouteEdit[],
  anchors: readonly AnchorFeature[] = [],
): AppliedEdits {
  if (edits.length === 0) return { meta, features: [...features], superseded: [] };

  // An edit whose ends both sit on the same variant edits that variant in
  // place. Splicing keeps one alignment where there is one alignment.
  const variantIds = new Set(meta.variants.map((v) => v.id));
  const anchorOf = (id: string): AnchorFeature | undefined =>
    anchors.find((a) => a.properties.id === id);

  const spliced = new Map<string, { geometry: Position[]; lengthKm: number; label: string }>();
  const appended: RouteEdit[] = [];
  const superseded: string[] = [];

  // Newest first, so a retraced section replaces the version before it. Storage
  // order is insertion order, so the end of the list is the most recent.
  const claimed = new Map<string, { from: number; to: number }[]>();
  const rangeOf = (e: RouteEdit): { pathId: string; from: number; to: number } | null => {
    const a = anchorOf(e.divergeAnchorId);
    const b = e.rejoinAnchorId ? anchorOf(e.rejoinAnchorId) : undefined;
    if (!a) return null;
    const pathId = a.properties.pathId;
    if (b && b.properties.pathId !== pathId) return null;
    const i = a.properties.indexOnPath;
    const j = b ? b.properties.indexOnPath : Number.MAX_SAFE_INTEGER;
    return { pathId, from: Math.min(i, j), to: Math.max(i, j) };
  };

  const ordered = [...edits].sort((x, y) => y.createdAt.localeCompare(x.createdAt));
  const newestFirst = ordered.every((e, i) => i === 0 || ordered[i - 1]!.createdAt >= e.createdAt)
    ? ordered
    : [...edits].reverse();

  for (const e of newestFirst) {
    if (e.active) {
      const r = rangeOf(e);
      if (r) {
        const taken = claimed.get(r.pathId) ?? [];
        if (taken.some((t) => r.from < t.to && t.from < r.to)) {
          superseded.push(e.id);
          continue;
        }
        claimed.set(r.pathId, [...taken, r]);
      }
    }
    const from = anchorOf(e.divergeAnchorId);
    const to = e.rejoinAnchorId ? anchorOf(e.rejoinAnchorId) : undefined;
    const onVariant =
      from && to && from.properties.pathId === to.properties.pathId && variantIds.has(from.properties.pathId);

    if (!onVariant || !e.active) {
      appended.push(e);
      continue;
    }

    const variantId = from.properties.pathId;
    const current =
      spliced.get(variantId)?.geometry ??
      (features.find((f) => f.properties.id === variantId)?.geometry.coordinates.map(
        ([lon, lat]) => [lon, lat] as Position,
      ) ?? []);
    const a = Math.min(from.properties.indexOnPath, to.properties.indexOnPath);
    const b = Math.max(from.properties.indexOnPath, to.properties.indexOnPath);
    if (current.length === 0 || a < 0 || b >= current.length) {
      appended.push(e);
      continue;
    }
    const next = [...current.slice(0, a), ...e.geometry, ...current.slice(b + 1)];
    spliced.set(variantId, { geometry: next, lengthKm: lineLengthKm(next), label: e.label });
  }

  const edits_ = appended;

  const editVariants: VariantSummary[] = edits_.map((e) => ({
    id: e.id,
    title: e.label,
    rationale: e.reason || `Imported from ${e.origin.filename}.`,
    divergeAnchorId: e.divergeAnchorId,
    rejoinAnchorId: e.rejoinAnchorId,
    ...(e.replacesPathId ? { replacesPathId: e.replacesPathId } : {}),
    lengthKm: e.lengthKm,
    active: e.active,
    source: `imported: ${e.origin.filename}`,
    confidence: 'medium' as const,
    verification: e.verification,
    lastChecked: null,
  }));

  const editFeatures: RouteFeature[] = edits_.map((e) => ({
    type: 'Feature' as const,
    id: e.id,
    geometry: { type: 'LineString' as const, coordinates: e.geometry.map(([lon, lat]) => [lon, lat] as [number, number]) },
    properties: {
      schemaVersion: 2,
      id: e.id,
      featureRole: 'variant' as const,
      order: 99,
      title: e.label,
      kind: 'walking' as const,
      lengthKm: e.lengthKm,
      startAnchorId: e.divergeAnchorId,
      endAnchorId: e.rejoinAnchorId,
      active: e.active,
      ...(e.replacesPathId ? { replacesPathId: e.replacesPathId } : {}),
      rationale: e.reason || undefined,
      navigational: false as const,
      demonstration: false,
      source: `imported: ${e.origin.filename}`,
      confidence: 'medium' as const,
      verification: e.verification,
      lastChecked: null,
      classification: 'public' as const,
    },
  }));

  const patchedVariants = meta.variants.map((v) => {
    const patch = spliced.get(v.id);
    return patch ? { ...v, lengthKm: patch.lengthKm, title: `${v.title} — ${patch.label}` } : v;
  });

  const patchedFeatures = features.map((f) => {
    const patch = spliced.get(f.properties.id);
    if (!patch) return f;
    return {
      ...f,
      geometry: {
        type: 'LineString' as const,
        coordinates: patch.geometry.map(([lon, lat]) => [lon, lat] as [number, number]),
      },
      properties: { ...f.properties, lengthKm: patch.lengthKm, verification: 'manually-traced' as const },
    };
  });

  return {
    meta: { ...meta, variants: [...patchedVariants, ...editVariants] },
    features: [...patchedFeatures, ...editFeatures],
    superseded,
  };
}
