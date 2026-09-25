import { kvGet, kvSet } from '../lib/idb';
import { ANCHOR_ADJUST_SCHEMA_VERSION } from '../lib/anchorAdjust';
import type { AnchorAdjustment } from '../lib/anchorAdjust';
import { serializeWrite } from './writeQueue';

/**
 * Anchor positions Kevin has corrected, on this device.
 *
 * A delta, like route edits: the shipped anchors are never rewritten, so
 * removing an adjustment restores exactly what the source published. These are
 * small and hard to reproduce from memory — export before clearing storage;
 * see OFFLINE-AND-RECOVERY.md.
 */
export const ANCHOR_ADJUST_KEY = 'anchoradjust.v1';

export async function loadAnchorAdjustments(): Promise<AnchorAdjustment[]> {
  try {
    const all = await kvGet<AnchorAdjustment[]>(ANCHOR_ADJUST_KEY);
    if (!Array.isArray(all)) return [];
    return all.filter((a) => a.schemaVersion === ANCHOR_ADJUST_SCHEMA_VERSION);
  } catch {
    return [];
  }
}

export function saveAnchorAdjustment(adj: AnchorAdjustment): Promise<AnchorAdjustment[]> {
  return serializeWrite(async () => {
    const all = await loadAnchorAdjustments();
    const i = all.findIndex((a) => a.anchorId === adj.anchorId);
    const next =
      i >= 0 ? all.map((a) => (a.anchorId === adj.anchorId ? adj : a)) : [...all, adj];
    await kvSet(ANCHOR_ADJUST_KEY, next);
    return next;
  });
}

export function deleteAnchorAdjustment(anchorId: string): Promise<AnchorAdjustment[]> {
  return serializeWrite(async () => {
    const next = (await loadAnchorAdjustments()).filter((a) => a.anchorId !== anchorId);
    await kvSet(ANCHOR_ADJUST_KEY, next);
    return next;
  });
}

/**
 * A file Kevin can keep.
 *
 * These are small and entirely judgment — where an anchor ought to sit, and
 * why — so they are the least reproducible thing in device storage. Nothing
 * else in the project records them.
 */
export function anchorAdjustmentsExport(
  adjustments: readonly AnchorAdjustment[],
  routeDataVersion: string,
): string {
  return (
    JSON.stringify(
      {
        schemaVersion: ANCHOR_ADJUST_SCHEMA_VERSION,
        kind: 'samwise-anchor-adjustments',
        exported: new Date().toISOString(),
        appliesToRouteDataVersion: routeDataVersion,
        note: 'Anchor positions corrected on the device. The shipped anchors are unchanged; these are a delta applied over them.',
        adjustments,
      },
      null,
      2,
    ) + '\n'
  );
}
