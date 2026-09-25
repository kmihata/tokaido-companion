import { kvGet, kvSet } from '../lib/idb';
import { ROUTE_EDIT_SCHEMA_VERSION } from '../lib/routeEdits';
import type { RouteEdit } from '../lib/routeEdits';
import { serializeWrite } from './writeQueue';

/**
 * Route edits, on this device.
 *
 * The shipped route is precached and always recoverable from the network; this
 * is the delta on top. That split is deliberate — if the whole route lived in
 * IndexedDB, an iOS Safari eviction on day nine would lose it. Only the delta
 * is at risk, and only the delta needs backing up.
 *
 * Permanent changes should be exported and baked into public/data/ by the
 * build, at which point the edit can be deleted. See DATA-SCHEMAS.md.
 */
export const ROUTE_EDITS_KEY = 'routeedits.v1';

export async function loadRouteEdits(): Promise<RouteEdit[]> {
  try {
    const all = await kvGet<RouteEdit[]>(ROUTE_EDITS_KEY);
    if (!Array.isArray(all)) return [];
    return all.filter((e) => e.schemaVersion === ROUTE_EDIT_SCHEMA_VERSION);
  } catch {
    return [];
  }
}

export function saveRouteEdit(edit: RouteEdit): Promise<RouteEdit[]> {
  return serializeWrite(async () => {
    const all = await loadRouteEdits();
    const next = all.some((e) => e.id === edit.id)
      ? all.map((e) => (e.id === edit.id ? edit : e))
      : [...all, edit];
    await kvSet(ROUTE_EDITS_KEY, next);
    return next;
  });
}

export function deleteRouteEdit(id: string): Promise<RouteEdit[]> {
  return serializeWrite(async () => {
    const next = (await loadRouteEdits()).filter((e) => e.id !== id);
    await kvSet(ROUTE_EDITS_KEY, next);
    return next;
  });
}

export function setRouteEditActive(id: string, active: boolean): Promise<RouteEdit[]> {
  return serializeWrite(async () => {
    const next = (await loadRouteEdits()).map((e) => (e.id === id ? { ...e, active } : e));
    await kvSet(ROUTE_EDITS_KEY, next);
    return next;
  });
}

/** Everything needed to bake these into the shipped data. */
export function routeEditsExport(edits: readonly RouteEdit[], routeDataVersion: string): string {
  return (
    JSON.stringify(
      {
        schemaVersion: ROUTE_EDIT_SCHEMA_VERSION,
        kind: 'samwise-route-edits',
        exported: new Date().toISOString(),
        appliesToRouteDataVersion: routeDataVersion,
        note: 'Layer these onto the shipped route, or bake them in with scripts/apply-route-edits.mjs and delete them from the device.',
        edits,
      },
      null,
      2,
    ) + '\n'
  );
}
