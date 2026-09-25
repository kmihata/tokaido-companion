import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { loadDataset } from '../data/load';
import type { Dataset } from '../data/load';
import { emptyPrivateData } from '../data/privateSchema';
import type { PrivateData } from '../data/privateSchema';
import { kvGet, kvSet, kvDelete } from '../lib/idb';
import { DEFAULT_SETTINGS, loadSettings, saveSettings } from './settings';
import type { Settings } from './settings';
import { isoDateIn } from '../lib/time';
import type { AnchorFeature } from '../data/schemas';
import { buildPlanningLine } from '../lib/planningLine';
import type { PlanningLine } from '../lib/planningLine';
import { applyOverrides, buildDefaultDayPlans, buildLegs, moveDayEnd } from '../lib/dayPlan';
import type { DayLeg, DayPlan, DayPlanDocument } from '../lib/dayPlan';
import {
  clearOverride,
  loadDayPlanDocument,
  resetDayPlan,
  saveOverride,
} from './dayPlanStore';
import { deleteUserPoint, loadUserPoints, saveUserPoint } from './userPointStore';
import {
  deleteRouteEdit,
  loadRouteEdits,
  saveRouteEdit,
  setRouteEditActive,
} from './routeEditStore';
import { applyRouteEdits } from '../lib/routeEdits';
import type { RouteEdit } from '../lib/routeEdits';
import { buildStretches } from '../data/load';
import type { UserPoint } from '../lib/userPoints';
import { usableAsDayEnd } from '../lib/userPoints';
import {
  deleteAnchorAdjustment,
  loadAnchorAdjustments,
  saveAnchorAdjustment,
} from './anchorAdjustStore';
import { applyAnchorAdjustments } from '../lib/anchorAdjust';
import type { AnchorAdjustment } from '../lib/anchorAdjust';

export const PRIVATE_KEY = 'private.v1';
export const SYNC_KEY = 'sync.v1';

export interface SyncMeta {
  lastSyncedAt: string | null;
  dataVersion: string | null;
}

export interface PlanApi {
  /** The active route flattened into one distance axis. */
  line: PlanningLine | null;
  plans: DayPlan[];
  legs: DayLeg[];
  document: DayPlanDocument | null;
  /** Shipped anchors plus Kevin's own, as one list. */
  anchors: AnchorFeature[];
  /** True when this day's boundary has been moved from the default. */
  isOverridden: (dayId: string) => boolean;
  moveEnd: (dayId: string, alongKm: number, anchorId?: string | null) => Promise<string | null>;
  setContinuation: (dayId: string, alongKm: number | null, anchorId?: string | null) => Promise<void>;
  resetDay: (dayId: string) => Promise<void>;
  resetAll: () => Promise<void>;
  reload: () => Promise<void>;
}

export interface RouteEditsApi {
  edits: RouteEdit[];
  /** Ids replaced by a newer edit covering the same stretch. */
  superseded: string[];
  save: (e: RouteEdit) => Promise<void>;
  remove: (id: string) => Promise<void>;
  setActive: (id: string, active: boolean) => Promise<void>;
}

export interface AnchorAdjustmentsApi {
  adjustments: AnchorAdjustment[];
  byId: (anchorId: string) => AnchorAdjustment | null;
  save: (a: AnchorAdjustment) => Promise<void>;
  remove: (anchorId: string) => Promise<void>;
}

export interface UserPointsApi {
  points: UserPoint[];
  save: (p: UserPoint) => Promise<void>;
  remove: (id: string) => Promise<void>;
  byId: (id: string) => UserPoint | null;
}

interface AppStateValue {
  dataset: Dataset | null;
  datasetError: string | null;
  reloadDataset: () => Promise<void>;
  settings: Settings;
  updateSettings: (patch: Partial<Settings>) => void;
  privateData: PrivateData | null;
  setPrivateData: (d: PrivateData | null) => Promise<void>;
  sync: SyncMeta;
  /** The date the app is treating as "today", honouring the override. */
  effectiveDate: string;
  dateIsOverridden: boolean;
  plan: PlanApi;
  userPoints: UserPointsApi;
  routeEdits: RouteEditsApi;
  anchorAdjustments: AnchorAdjustmentsApi;
}

const Ctx = createContext<AppStateValue | null>(null);

export function AppStateProvider({ children }: { children: ReactNode }): ReactNode {
  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [datasetError, setDatasetError] = useState<string | null>(null);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [privateData, setPrivateDataState] = useState<PrivateData | null>(null);
  const [sync, setSync] = useState<SyncMeta>({ lastSyncedAt: null, dataVersion: null });
  const [planDoc, setPlanDoc] = useState<DayPlanDocument | null>(null);
  const [points, setPoints] = useState<UserPoint[]>([]);
  const [edits, setEdits] = useState<RouteEdit[]>([]);
  const [superseded, setSuperseded] = useState<string[]>([]);
  const [adjustments, setAdjustments] = useState<AnchorAdjustment[]>([]);

  const reloadDataset = useCallback(async () => {
    setDatasetError(null);
    try {
      const ds = await loadDataset();
      setDataset(ds);
      const meta: SyncMeta = { lastSyncedAt: ds.loadedAt, dataVersion: ds.index.dataVersion };
      setSync(meta);
      await kvSet(SYNC_KEY, meta).catch(() => undefined);
    } catch (err) {
      setDatasetError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    void reloadDataset();
    void loadSettings().then(setSettings);
    void kvGet<SyncMeta>(SYNC_KEY).then((m) => {
      if (m) setSync((prev) => (prev.lastSyncedAt ? prev : m));
    });
    void kvGet<PrivateData>(PRIVATE_KEY).then((d) => setPrivateDataState(d ?? null));
    void loadDayPlanDocument().then(setPlanDoc);
    void loadUserPoints().then(setPoints);
    void loadRouteEdits().then(setEdits);
    void loadAnchorAdjustments().then(setAdjustments);
  }, [reloadDataset]);

  const updateSettings = useCallback((patch: Partial<Settings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      void saveSettings(next);
      return next;
    });
  }, []);

  const setPrivateData = useCallback(async (d: PrivateData | null) => {
    if (d === null) {
      await kvDelete(PRIVATE_KEY);
      setPrivateDataState(null);
      return;
    }
    await kvSet(PRIVATE_KEY, d);
    setPrivateDataState(d);
  }, []);

  /**
   * The shipped route with Kevin's edits layered on. Every screen consumes
   * this, not the raw dataset, so an edit is simply part of the route.
   */
  const edited = useMemo<Dataset | null>(() => {
    if (!dataset) return null;
    if (edits.length === 0 && adjustments.length === 0) return dataset;
    // Route edits are validated against the anchors as the source published
    // them, so that an adjusted anchor cannot quietly change which edits are
    // considered to join up. Adjustments are layered on afterwards.
    const { meta, features } = applyRouteEdits(dataset.routeMeta, dataset.routeFeatures, edits, dataset.anchors);
    const anchors = applyAnchorAdjustments(dataset.anchors, adjustments);
    const { stretches, breaks } = buildStretches(meta, features, anchors);
    return {
      ...dataset,
      anchors,
      routeMeta: meta,
      routeFeatures: features,
      stretches,
      breaks,
      activeLengthKm: stretches.reduce((t, s) => t + s.lengthKm, 0),
    };
  }, [dataset, edits, adjustments]);

  useEffect(() => {
    if (!dataset || edits.length === 0) {
      setSuperseded([]);
      return;
    }
    setSuperseded(
      applyRouteEdits(dataset.routeMeta, dataset.routeFeatures, edits, dataset.anchors).superseded,
    );
  }, [dataset, edits]);

  const line = useMemo(
    () => (edited ? buildPlanningLine(edited.stretches, edited.breaks) : null),
    [edited],
  );

  const plans = useMemo(() => {
    if (!edited || !line) return [];
    return applyOverrides(buildDefaultDayPlans(line, edited.anchors, edited.days), planDoc);
  }, [edited, line, planDoc]);

  /**
   * Shipped anchors plus Kevin's own, presented as one list so a point he added
   * is a day endpoint exactly like a post station is.
   */
  const allAnchors = useMemo(() => {
    if (!edited) return [];
    return [...edited.anchors, ...userAnchorsAsFeatures(points)];
  }, [edited, points]);

  const legs = useMemo(() => {
    if (!edited || !line) return [];
    return buildLegs(line, plans, edited.days, allAnchors);
  }, [edited, line, plans, allAnchors]);

  const plan = useMemo<PlanApi>(
    () => ({
      line,
      plans,
      legs,
      document: planDoc,
      isOverridden: (dayId) => Boolean(planDoc?.overrides[dayId]),
      anchors: allAnchors,
      moveEnd: async (dayId, alongKm, anchorId = null) => {
        if (!line) return 'No route loaded.';
        const r = moveDayEnd(plans, line, dayId, alongKm, anchorId);
        if (!r.ok) return r.reason;
        setPlanDoc(await saveOverride(dayId, { endAlongKm: alongKm, endAnchorId: anchorId }));
        return null;
      },
      setContinuation: async (dayId, alongKm, anchorId = null) => {
        setPlanDoc(
          await saveOverride(dayId, { continueToAlongKm: alongKm, continueToAnchorId: anchorId }),
        );
      },
      resetDay: async (dayId) => setPlanDoc(await clearOverride(dayId)),
      resetAll: async () => {
        await resetDayPlan();
        setPlanDoc(null);
      },
      reload: async () => setPlanDoc(await loadDayPlanDocument()),
    }),
    [line, plans, legs, planDoc, allAnchors],
  );

  const anchorAdjustments = useMemo<AnchorAdjustmentsApi>(
    () => ({
      adjustments,
      byId: (anchorId) => adjustments.find((a) => a.anchorId === anchorId) ?? null,
      save: async (a) => setAdjustments(await saveAnchorAdjustment(a)),
      remove: async (anchorId) => setAdjustments(await deleteAnchorAdjustment(anchorId)),
    }),
    [adjustments],
  );

  const userPoints = useMemo<UserPointsApi>(
    () => ({
      points,
      save: async (p) => setPoints(await saveUserPoint(p)),
      remove: async (id) => setPoints(await deleteUserPoint(id)),
      byId: (id) => points.find((p) => p.id === id) ?? null,
    }),
    [points],
  );

  const routeEdits = useMemo<RouteEditsApi>(
    () => ({
      edits,
      superseded,
      save: async (e) => setEdits(await saveRouteEdit(e)),
      remove: async (id) => setEdits(await deleteRouteEdit(id)),
      setActive: async (id, active) => setEdits(await setRouteEditActive(id, active)),
    }),
    [edits, superseded],
  );

  const timezone = dataset?.trip.timezone ?? 'Asia/Tokyo';
  const realDate = isoDateIn(new Date(), timezone);
  const effectiveDate = settings.dateOverride ?? realDate;

  const value = useMemo<AppStateValue>(
    () => ({
      dataset: edited,
      datasetError,
      reloadDataset,
      settings,
      updateSettings,
      privateData,
      setPrivateData,
      sync,
      effectiveDate,
      dateIsOverridden: settings.dateOverride !== null,
      plan,
      userPoints,
      routeEdits,
      anchorAdjustments,
    }),
    [
      edited,
      datasetError,
      reloadDataset,
      settings,
      updateSettings,
      privateData,
      setPrivateData,
      sync,
      effectiveDate,
      plan,
      userPoints,
      routeEdits,
      anchorAdjustments,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAppState(): AppStateValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAppState must be used inside AppStateProvider.');
  return v;
}

export { emptyPrivateData };

/**
 * Present a user anchor in the same shape as a shipped one, so day planning
 * does not have to know the difference. `alongKm` comes from the projection
 * computed when the point was saved.
 */
function userAnchorsAsFeatures(points: readonly UserPoint[]): AnchorFeature[] {
  return points
    .filter((p) => usableAsDayEnd(p))
    .map((p) => ({
      type: 'Feature' as const,
      id: p.id,
      geometry: { type: 'Point' as const, coordinates: [p.lon, p.lat] as [number, number] },
      properties: {
        id: p.id,
        titleJa: p.title,
        title: p.title,
        romanised: true,
        kind: 'landmark' as const,
        stationNumber: null,
        nakasendoNumber: null,
        pathId: 'user',
        indexOnPath: -1,
        alongKm: p.onRoute?.alongKm ?? 0,
        navigational: false as const,
        demonstration: false,
        source: 'user-placed',
        confidence: 'demonstration' as const,
        verification: p.verification,
        lastChecked: p.lastChecked,
        classification: p.classification,
      },
    }));
}
