import { kvGet, kvSet } from '../lib/idb';
import { USER_POINT_SCHEMA_VERSION } from '../lib/userPoints';
import type { UserPoint } from '../lib/userPoints';
import { serializeWrite } from './writeQueue';

/**
 * Kevin's own points, on this device.
 *
 * Some of these are private — a real booking is not repository content — so
 * they live here rather than in the shipped dataset, alongside captures and the
 * imported private file. Export them before clearing storage; see
 * OFFLINE-AND-RECOVERY.md.
 */
export const USER_POINTS_KEY = 'userpoints.v1';

export async function loadUserPoints(): Promise<UserPoint[]> {
  try {
    const all = await kvGet<UserPoint[]>(USER_POINTS_KEY);
    if (!Array.isArray(all)) return [];
    return all.filter((p) => p.schemaVersion === USER_POINT_SCHEMA_VERSION);
  } catch {
    return [];
  }
}

export function saveUserPoint(point: UserPoint): Promise<UserPoint[]> {
  return serializeWrite(async () => {
    const all = await loadUserPoints();
    const i = all.findIndex((p) => p.id === point.id);
    const next = i >= 0 ? all.map((p) => (p.id === point.id ? point : p)) : [...all, point];
    await kvSet(USER_POINTS_KEY, next);
    return next;
  });
}

export function deleteUserPoint(id: string): Promise<UserPoint[]> {
  return serializeWrite(async () => {
    const next = (await loadUserPoints()).filter((p) => p.id !== id);
    await kvSet(USER_POINTS_KEY, next);
    return next;
  });
}

export function clearUserPoints(): Promise<UserPoint[]> {
  return serializeWrite(async () => {
    await kvSet(USER_POINTS_KEY, []);
    return [];
  });
}
