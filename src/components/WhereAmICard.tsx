import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useAppState } from '../state/AppState';
import { useLocationFix } from '../state/useLocationFix';
import type { LocationFix } from '../state/useLocationFix';
import { kvGet, kvSet } from '../lib/idb';
import { measureWhereAmI, paceSoFar, shouldReplaceFirstTap } from '../lib/whereAmI';
import type { TapRecord } from '../lib/whereAmI';
import { formatDuration, TARGET_MOVING_MPH } from '../lib/pace';
import { formatClock, formatKmMi } from '../lib/time';
import { Metric } from './Metric';

export const FIRST_TAP_KEY = 'whereami.first.v1';
export const LAST_FIX_KEY = 'whereami.last.v1';

interface StoredLastFix {
  dayId: string;
  fix: LocationFix;
}

/**
 * Top of Today: one button, one answer. Distance left along the path, walking
 * time at 3 mph, and pace so far. No inputs. See lib/whereAmI.ts.
 */
export function WhereAmICard({ dayId }: { dayId: string }): ReactNode {
  const { plan } = useAppState();
  const leg = plan.legs.find((l) => l.plan.dayId === dayId) ?? null;
  const line = plan.line;

  const [firstTap, setFirstTap] = useState<TapRecord | null>(null);
  const [lastFix, setLastFix] = useState<LocationFix | null>(null);

  // Restore the last answer, so reopening the app shows it with its time.
  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const [first, last] = await Promise.all([
          kvGet<TapRecord>(FIRST_TAP_KEY),
          kvGet<StoredLastFix>(LAST_FIX_KEY),
        ]);
        if (!live) return;
        setFirstTap(first && first.dayId === dayId ? first : null);
        setLastFix(last && last.dayId === dayId ? last.fix : null);
      } catch {
        // Storage unavailable: the card still works for this session.
      }
    })();
    return () => {
      live = false;
    };
  }, [dayId]);

  const save = useCallback(<T,>(key: string, value: T) => {
    void kvSet(key, value).catch(() => undefined);
  }, []);

  const onFix = useCallback(
    (fix: LocationFix) => {
      setLastFix(fix);
      save<StoredLastFix>(LAST_FIX_KEY, { dayId, fix });
      if (!line || !leg) return;
      const r = measureWhereAmI(line, leg, [fix.lon, fix.lat]);
      if (!r) return;
      setFirstTap((stored) => {
        if (!shouldReplaceFirstTap(stored, dayId, r.position.status)) return stored;
        const next: TapRecord = { dayId, at: fix.at, alongKm: r.position.alongKm };
        save(FIRST_TAP_KEY, next);
        return next;
      });
    },
    [dayId, leg, line, save],
  );

  const geo = useLocationFix(onFix);

  const result = useMemo(
    () => (lastFix && line && leg ? measureWhereAmI(line, leg, [lastFix.lon, lastFix.lat]) : null),
    [lastFix, line, leg],
  );

  const pace = useMemo(
    () =>
      result && lastFix
        ? paceSoFar(firstTap, { dayId, at: lastFix.at, alongKm: result.position.alongKm })
        : null,
    [firstTap, result, lastFix, dayId],
  );

  const countFromNow = (): void => {
    if (!result || !lastFix) return;
    const next: TapRecord = { dayId, at: lastFix.at, alongKm: result.position.alongKm };
    setFirstTap(next);
    save(FIRST_TAP_KEY, next);
  };

  if (!leg || !line) return null;

  const status = result?.position.status ?? null;

  return (
    <section className="card card--ok" data-testid="where-am-i">
      <div className="card__label">Distance left today</div>

      {result ? (
        <>
          <div className="card__big" data-testid="where-am-i-left">
            {formatKmMi(result.left.remainingKm)}
          </div>
          <div className="metrics" style={{ marginTop: 12 }}>
            <Metric
              label={`Walking time at ${TARGET_MOVING_MPH.toFixed(0)} mph`}
              value={formatDuration(result.left.movingMinutes)}
              note="walking only"
              testId="where-am-i-time"
            />
            <Metric
              label="Your pace so far"
              value={pace ? `${pace.mph.toFixed(1)} mph` : '—'}
              note={
                pace
                  ? `${pace.kmh.toFixed(1)} km/h since ${formatClock(new Date(pace.sinceAt))}, stops included`
                  : firstTap
                    ? `counting from ${formatClock(new Date(firstTap.at))}; tap again later`
                    : 'tap again later to see it'
              }
              testId="where-am-i-pace"
            />
          </div>

          {status === 'before-start' ? (
            <p className="small" style={{ marginTop: 8 }}>
              You have not reached today’s start yet, so this is the whole day.
            </p>
          ) : null}
          {status === 'past-finish' ? (
            <p className="small" style={{ marginTop: 8 }}>
              You are at or past today’s planned finish.
            </p>
          ) : null}
          {status === 'far-from-section' ? (
            <p className="small" style={{ marginTop: 8 }} data-testid="where-am-i-far">
              <strong>This fix is {result.position.offRouteKm.toFixed(1)} km from today’s section.</strong>{' '}
              The numbers above may not mean anything.
            </p>
          ) : result.showOffRoute ? (
            <p className="small" style={{ marginTop: 8 }}>
              You are {result.position.offRouteKm.toFixed(1)} km off the line. Add the walk back on.
            </p>
          ) : null}

          <p className="small muted" style={{ marginTop: 8 }} data-testid="where-am-i-fix">
            {lastFix?.pretend
              ? `Pretend position from Settings, ${formatClock(new Date(lastFix.at))}.`
              : `Fix at ${lastFix ? formatClock(new Date(lastFix.at)) : '—'}` +
                (lastFix?.accuracyM != null ? `, accurate to about ${Math.round(lastFix.accuracyM)} m.` : '.')}{' '}
            Measured along the path to the finish.
          </p>
        </>
      ) : (
        <p style={{ margin: '4px 0 0' }}>Tap below to measure from where you are standing.</p>
      )}

      {geo.status === 'error' && geo.error ? (
        <p className="small" role="alert" style={{ marginTop: 8 }}>
          {geo.error}
        </p>
      ) : null}

      <div className="btnrow" style={{ marginTop: 12 }}>
        <button
          type="button"
          className="btn btn--primary"
          onClick={geo.locate}
          disabled={geo.status === 'locating'}
          data-testid="where-am-i-button"
        >
          {geo.status === 'locating' ? 'Finding you… up to 15 s' : 'Where am I?'}
        </button>
        {result && firstTap && lastFix && firstTap.at !== lastFix.at ? (
          <button type="button" className="btn" onClick={countFromNow}>
            Count pace from now
          </button>
        ) : null}
      </div>
    </section>
  );
}
