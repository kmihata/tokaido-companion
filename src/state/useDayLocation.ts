import { useCallback, useEffect, useState } from 'react';
import { kvGet, kvSet } from '../lib/idb';
import { useLocationFix } from './useLocationFix';
import type { LocationFix } from './useLocationFix';
import { LAST_FIX_KEY } from '../components/WhereAmICard';

/** A fix younger than this is reused rather than asking the GPS again. */
export const FRESH_FIX_MS = 2 * 60_000;

interface StoredLastFix {
  dayId: string;
  fix: LocationFix;
}

/**
 * The latest location fix for one day, shared with the Today card.
 *
 * Kevin, 2026-10-29: the AI packet from the day card said "Device position: not
 * available". This keeps the last "Where am I?" fix for the day, and `refresh`
 * takes a new one when the last is stale. The AI card calls `refresh` when he
 * starts typing a question, so the GPS has time to answer before he taps Copy
 * (iOS only allows copying inside the tap, so the fix cannot wait for it).
 */
export function useDayLocation(dayId: string | null): {
  fix: LocationFix | null;
  locating: boolean;
  error: string | null;
  refresh: () => void;
} {
  const [fix, setFix] = useState<LocationFix | null>(null);

  useEffect(() => {
    if (!dayId) return;
    let live = true;
    void kvGet<StoredLastFix>(LAST_FIX_KEY)
      .then((v) => {
        if (live && v && v.dayId === dayId) setFix(v.fix);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [dayId]);

  const onFix = useCallback(
    (f: LocationFix) => {
      setFix(f);
      if (dayId) void kvSet<StoredLastFix>(LAST_FIX_KEY, { dayId, fix: f }).catch(() => undefined);
    },
    [dayId],
  );
  const geo = useLocationFix(onFix);

  const refresh = useCallback(() => {
    if (!dayId || geo.status === 'locating') return;
    if (fix && Date.now() - fix.at < FRESH_FIX_MS) return;
    geo.locate();
  }, [dayId, geo, fix]);

  return { fix, locating: geo.status === 'locating', error: geo.status === 'error' ? geo.error : null, refresh };
}
