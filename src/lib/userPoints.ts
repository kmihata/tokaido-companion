/**
 * Points Kevin adds himself.
 *
 * Two roles, and the difference matters:
 *
 *  - An **anchor** sits exactly ON the route and can therefore be used as a
 *    day finish. Saving one moves it onto the line.
 *  - A **waypoint** is a place near the route — a hotel, a station, a pharmacy
 *    — and keeps the position it was given.
 *
 * PRIVACY: a real booking is private. Lodging defaults to `private`, private
 * points never reach any export or the repository, and
 * `tests/build/bundle.test.ts` enforces that the exporters honour it.
 *
 * Pure. Storage lives in state/userPointStore.ts.
 */
import type { RouteStretch } from '../data/load';
import type { Position } from './geo';
import { projectOntoRoute } from './dayContext';

export const USER_POINT_SCHEMA_VERSION = 1;

export const USER_POINT_TYPES = [
  { id: 'day-end', label: 'Planned stop', role: 'anchor', privateByDefault: false },
  { id: 'hotel', label: 'Sleep / lodging', role: 'waypoint', privateByDefault: true },
  { id: 'rail-bailout', label: 'Rail station / bailout', role: 'waypoint', privateByDefault: false },
  { id: 'water', label: 'Water', role: 'waypoint', privateByDefault: false },
  { id: 'food', label: 'Food / resupply', role: 'waypoint', privateByDefault: false },
  { id: 'pharmacy', label: 'Pharmacy', role: 'waypoint', privateByDefault: false },
  { id: 'medical', label: 'Medical', role: 'waypoint', privateByDefault: false },
  { id: 'hazard', label: 'Hazard', role: 'waypoint', privateByDefault: false },
  { id: 'research', label: 'Research / Hiroshige site', role: 'waypoint', privateByDefault: false },
  { id: 'landmark', label: 'Notable place', role: 'waypoint', privateByDefault: false },
] as const;

export type UserPointType = (typeof USER_POINT_TYPES)[number]['id'];
export type UserPointRole = 'anchor' | 'waypoint';

export interface UserPoint {
  schemaVersion: number;
  id: string;
  createdAt: string;
  updatedAt: string;
  role: UserPointRole;
  type: UserPointType;
  title: string;
  notes: string;
  lat: number;
  lon: number;
  /** Projection onto the active route at save time. Null when off the line entirely. */
  onRoute: { alongKm: number; offRouteKm: number } | null;
  classification: 'public' | 'private';
  source: 'user';
  confidence: 'user-placed';
  verification: 'unverified' | 'field-checked';
  lastChecked: string | null;
}

export function typeSpec(type: UserPointType): (typeof USER_POINT_TYPES)[number] {
  return USER_POINT_TYPES.find((t) => t.id === type) ?? USER_POINT_TYPES[0];
}

export function newUserPointId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return `up-${crypto.randomUUID()}`;
  return `up-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export interface MakeUserPointInput {
  role: UserPointRole;
  type: UserPointType;
  title: string;
  notes?: string;
  lat: number;
  lon: number;
  classification?: 'public' | 'private';
  verification?: 'unverified' | 'field-checked';
  id?: string;
  createdAt?: string;
}

/**
 * Build a point, projecting it onto the route.
 *
 * An anchor is MOVED onto the line, because a day finish that is 200 m off the
 * route would silently add distance to two days. A waypoint keeps where it was
 * put, and records how far off the line it is so the UI can say so.
 */
export function makeUserPoint(
  input: MakeUserPointInput,
  stretches: readonly RouteStretch[],
): UserPoint {
  const now = new Date().toISOString();
  const projection = projectOntoRoute(stretches, [input.lon, input.lat] as Position);
  const snap = input.role === 'anchor' && projection !== null;

  return {
    schemaVersion: USER_POINT_SCHEMA_VERSION,
    id: input.id ?? newUserPointId(),
    createdAt: input.createdAt ?? now,
    updatedAt: now,
    role: input.role,
    type: input.type,
    title: input.title.trim(),
    notes: (input.notes ?? '').trim(),
    lat: snap ? projection.point[1] : input.lat,
    lon: snap ? projection.point[0] : input.lon,
    onRoute: projection
      ? { alongKm: projection.alongKm, offRouteKm: snap ? 0 : projection.offRouteKm }
      : null,
    classification:
      input.classification ?? (typeSpec(input.type).privateByDefault ? 'private' : 'public'),
    source: 'user',
    confidence: 'user-placed',
    verification: input.verification ?? 'unverified',
    lastChecked: null,
  };
}

export type ValidationResult = { ok: true } | { ok: false; errors: string[] };

export function validateUserPoint(input: Partial<MakeUserPointInput>): ValidationResult {
  const errors: string[] = [];
  if (!input.title || input.title.trim().length === 0) errors.push('Give it a name.');
  if ((input.title ?? '').length > 80) errors.push('Name is too long (80 characters maximum).');
  if (typeof input.lat !== 'number' || !Number.isFinite(input.lat) || Math.abs(input.lat) > 90) {
    errors.push('Latitude must be between -90 and 90.');
  }
  if (typeof input.lon !== 'number' || !Number.isFinite(input.lon) || Math.abs(input.lon) > 180) {
    errors.push('Longitude must be between -180 and 180.');
  }
  if (!input.type || !USER_POINT_TYPES.some((t) => t.id === input.type)) {
    errors.push('Choose a type.');
  }
  return errors.length ? { ok: false, errors } : { ok: true };
}

/** Parse "35.2560, 139.1550" or "35.2560 139.1550". */
export function parseCoordinates(text: string): { lat: number; lon: number } | null {
  const m = /^\s*(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)\s*$/.exec(text);
  if (!m) return null;
  const lat = Number(m[1]);
  const lon = Number(m[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { lat, lon };
}

/** Only points safe to put in a public export. */
export function publicOnly(points: readonly UserPoint[]): UserPoint[] {
  return points.filter((p) => p.classification === 'public');
}

/**
 * User anchors that can serve as a day finish: on the route, and close enough
 * to it that using one does not quietly add distance.
 */
export const ANCHOR_ON_ROUTE_TOLERANCE_KM = 0.05;

export function usableAsDayEnd(p: UserPoint): boolean {
  return p.role === 'anchor' && p.onRoute !== null && p.onRoute.offRouteKm <= ANCHOR_ON_ROUTE_TOLERANCE_KM;
}
