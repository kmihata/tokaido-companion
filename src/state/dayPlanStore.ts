import { kvDelete, kvGet, kvSet } from '../lib/idb';
import { serializeWrite } from './writeQueue';
import { DAY_PLAN_SCHEMA_VERSION, emptyDayPlanDocument } from '../lib/dayPlan';
import type { DayPlan, DayPlanDocument } from '../lib/dayPlan';

/**
 * Kevin's day-boundary decisions.
 *
 * The route ships in the repository and is precached; his edits are the delta
 * on top, stored here. Only days he has actually moved are recorded, so a
 * change to the underlying route flows through to every untouched day
 * automatically instead of freezing a stale distance.
 */
export const DAY_PLAN_KEY = 'dayplan.v1';
export const SNAPSHOT_KEY = 'dayplan.snapshots.v1';

// Writes are serialized across every store; see state/writeQueue.ts.
const serialize = serializeWrite;

export interface PlanSnapshot {
  id: string;
  savedAt: string;
  label: string;
  routeDataVersion: string;
  document: DayPlanDocument;
}

export async function loadDayPlanDocument(): Promise<DayPlanDocument | null> {
  try {
    const doc = await kvGet<DayPlanDocument>(DAY_PLAN_KEY);
    if (!doc || doc.schemaVersion !== DAY_PLAN_SCHEMA_VERSION) return null;
    return doc;
  } catch {
    return null;
  }
}

export function saveOverride(dayId: string, patch: Partial<DayPlan>): Promise<DayPlanDocument> {
  return serialize(async () => {
    const current = (await loadDayPlanDocument()) ?? emptyDayPlanDocument();
    const next: DayPlanDocument = {
      ...current,
      updatedAt: new Date().toISOString(),
      overrides: { ...current.overrides, [dayId]: { ...current.overrides[dayId], ...patch } },
    };
    await kvSet(DAY_PLAN_KEY, next);
    return next;
  });
}

export function clearOverride(dayId: string): Promise<DayPlanDocument> {
  return serialize(async () => {
    const current = (await loadDayPlanDocument()) ?? emptyDayPlanDocument();
    const overrides = { ...current.overrides };
    delete overrides[dayId];
    const next: DayPlanDocument = { ...current, updatedAt: new Date().toISOString(), overrides };
    await kvSet(DAY_PLAN_KEY, next);
    return next;
  });
}

export async function resetDayPlan(): Promise<void> {
  await kvDelete(DAY_PLAN_KEY);
}

// --- snapshots -------------------------------------------------------------

export async function listSnapshots(): Promise<PlanSnapshot[]> {
  try {
    return (await kvGet<PlanSnapshot[]>(SNAPSHOT_KEY)) ?? [];
  } catch {
    return [];
  }
}

/** Save the current plan under a label. Newest first; the last 20 are kept. */
export function saveSnapshot(label: string, routeDataVersion: string): Promise<PlanSnapshot> {
  return serialize(async () => saveSnapshotInner(label, routeDataVersion));
}

async function saveSnapshotInner(label: string, routeDataVersion: string): Promise<PlanSnapshot> {
  const document = (await loadDayPlanDocument()) ?? emptyDayPlanDocument();
  const snap: PlanSnapshot = {
    id:
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `snap-${Date.now().toString(36)}`,
    savedAt: new Date().toISOString(),
    label,
    routeDataVersion,
    document,
  };
  const all = [snap, ...(await listSnapshots())].slice(0, 20);
  await kvSet(SNAPSHOT_KEY, all);
  return snap;
}

export async function restoreSnapshot(id: string): Promise<DayPlanDocument | null> {
  const snap = (await listSnapshots()).find((s) => s.id === id);
  if (!snap) return null;
  const restored: DayPlanDocument = { ...snap.document, updatedAt: new Date().toISOString() };
  await kvSet(DAY_PLAN_KEY, restored);
  return restored;
}

export async function deleteSnapshot(id: string): Promise<void> {
  await kvSet(SNAPSHOT_KEY, (await listSnapshots()).filter((s) => s.id !== id));
}

// --- nightly preparation ---------------------------------------------------

export const PREPARED_KEY = 'prepared.v1';

/**
 * The readiness checklist for one day.
 *
 * Every item is USER-CONFIRMED. Samwise cannot see whether Footpath imported a
 * file, whether the Watch received a route, or whether Apple Maps has the
 * region — there is no integration that would let it. Recording a tick is a
 * record of Kevin's own check, and the UI must never imply otherwise.
 */
export const CHECKLIST_ITEMS = [
  { id: 'gpx-imported', label: 'Day file imported and saved in Footpath' },
  { id: 'cue-sheet', label: 'Footpath cue sheet inspected for unknown-path warnings' },
  { id: 'footpath-offline', label: 'Footpath offline maps downloaded for tomorrow' },
  { id: 'watch', label: 'Active route sent to the Watch' },
  { id: 'apple-maps', label: 'Apple Maps region downloaded as the emergency fallback' },
  { id: 'samwise-offline', label: 'Samwise offline readiness passed' },
  { id: 'charged', label: 'Phone, watch and power bank charged' },
  { id: 'backed-up', label: 'Captures and private data exported' },
] as const;

export type ChecklistId = (typeof CHECKLIST_ITEMS)[number]['id'];

export interface PreparedRecord {
  dayId: string;
  preparedAt: string | null;
  checklist: Partial<Record<ChecklistId, boolean>>;
  routeDataVersion: string;
  activeKm: number;
  continueKm: number | null;
}

export async function loadPrepared(): Promise<Record<string, PreparedRecord>> {
  try {
    return (await kvGet<Record<string, PreparedRecord>>(PREPARED_KEY)) ?? {};
  } catch {
    return {};
  }
}

export function savePrepared(record: PreparedRecord): Promise<Record<string, PreparedRecord>> {
  return serialize(async () => {
    const all = await loadPrepared();
    const next = { ...all, [record.dayId]: record };
    await kvSet(PREPARED_KEY, next);
    return next;
  });
}

/** True when every checklist item has been ticked. */
export function checklistComplete(record: PreparedRecord | undefined): boolean {
  if (!record) return false;
  return CHECKLIST_ITEMS.every((i) => record.checklist[i.id] === true);
}

/**
 * The day plan as a file.
 *
 * This was the last piece of device state with nothing behind it. Route edits
 * can be rebuilt from `route-sources/working/`, places export from Settings,
 * anchor moves export from the Route screen — but which day finishes where was
 * recoverable from nothing at all, and on 2026-09-13 a cleared cache took five
 * adopted retraces with it and would have taken this too.
 *
 * It matters more than its size suggests: hotels are booked against these
 * boundaries, and losing them means rebuilding a schedule by hand from
 * defaults that have since moved as the route was retraced.
 *
 * The resolved legs are written alongside the overrides. The overrides are what
 * restores the plan; the legs are what makes the file readable by a person
 * deciding where to sleep, and they carry the route version they were measured
 * against so a stale file cannot be mistaken for a current one.
 */
const KM_TO_MI = 0.621371;

export function dayPlanExport(
  doc: DayPlanDocument | null,
  legs: readonly {
    plan: { dayId: string };
    day: { label: string; date: string } | null;
    startAlongKm: number;
    endAlongKm: number;
    distanceKm: number;
    endAnchorId: string | null;
  }[],
  routeDataVersion: string,
  anchorTitle: (id: string | null) => string | null,
): string {
  return (
    JSON.stringify(
      {
        schemaVersion: DAY_PLAN_SCHEMA_VERSION,
        kind: 'samwise-day-plan',
        exported: new Date().toISOString(),
        routeDataVersion,
        note: 'Day boundaries. `overrides` is the restorable part — days not listed there follow the defaults for whatever route is shipped. `days` is the resolved plan at the route version above, for reading.',
        overrides: doc?.overrides ?? {},
        days: legs.map((l) => ({
          dayId: l.plan.dayId,
          date: l.day?.date ?? null,
          label: l.day?.label ?? null,
          startKm: Math.round(l.startAlongKm * 100) / 100,
          endKm: Math.round(l.endAlongKm * 100) / 100,
          distanceKm: Math.round(l.distanceKm * 100) / 100,
          // Miles alongside, because this file is read by a person planning
          // hotels and Kevin thinks in both. Derived, never stored separately:
          // a second figure that can drift from the first is worse than none.
          distanceMi: Math.round(l.distanceKm * KM_TO_MI * 100) / 100,
          endMi: Math.round(l.endAlongKm * KM_TO_MI * 100) / 100,
          finishesAt: anchorTitle(l.endAnchorId),
          moved: Boolean(doc?.overrides[l.plan.dayId]),
        })),
      },
      null,
      2,
    ) + '\n'
  );
}
