import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useAppState } from '../state/AppState';
import { useLocationFix } from '../state/useLocationFix';
import type { LocationFix } from '../state/useLocationFix';
import { assetUrl } from '../lib/base';
import { locateOnLeg } from '../lib/whereAmI';
import { KIND_LABEL, nextRestrooms, placeOnLine } from '../lib/restrooms';
import type { AheadRestroom, RestroomsFile } from '../lib/restrooms';
import { formatClock, formatKmMi } from '../lib/time';

/**
 * One tap: the next three public restrooms ahead on the route, how far each
 * is, what kind of place it is, and how long the gap is after each one, so
 * the stop-or-go call can be made on the move. A convenience store is shown
 * separately as the fallback. See lib/restrooms.ts.
 */
export function NextRestroomCard({ dayId }: { dayId: string }): ReactNode {
  const { plan } = useAppState();
  const leg = plan.legs.find((l) => l.plan.dayId === dayId) ?? null;
  const line = plan.line;

  const [file, setFile] = useState<RestroomsFile | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [fix, setFix] = useState<LocationFix | null>(null);

  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const res = await fetch(assetUrl('data/restrooms.json'));
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as RestroomsFile;
        if (live) setFile(json);
      } catch (e) {
        if (live) setLoadError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      live = false;
    };
  }, []);

  const placed = useMemo(
    () => (file && line ? placeOnLine(line, file.restrooms) : []),
    [file, line],
  );

  const geo = useLocationFix(setFix);

  const position = useMemo(
    () => (fix && line && leg ? locateOnLeg(line, leg, [fix.lon, fix.lat]) : null),
    [fix, line, leg],
  );

  const next = useMemo(
    () => (position ? nextRestrooms(placed, position.rawAlongKm) : null),
    [placed, position],
  );

  if (!leg || !line) return null;

  return (
    <section className="card" data-testid="next-restroom">
      <div className="card__label">Next restroom</div>

      {next ? (
        <>
          {next.ahead.length === 0 ? (
            <p style={{ margin: '4px 0 0' }}>No public restroom on file ahead of you.</p>
          ) : (
            <ol className="restrooms" style={{ margin: '8px 0 0', paddingLeft: 20 }}>
              {next.ahead.map((a, i) => (
                <RestroomRow key={a.restroom.id} a={a} best={a.restroom.tier === next.bestTier} last={i === next.ahead.length - 1} />
              ))}
            </ol>
          )}

          {next.roadside ? (
            <p className="small" style={{ marginTop: 10 }} data-testid="next-restroom-roadside">
              <strong>Next roadside station:</strong> {next.roadside.restroom.name},{' '}
              {formatKmMi(next.roadside.aheadKm)} ahead.
            </p>
          ) : null}

          {next.store ? (
            <p className="small" style={{ marginTop: 10 }} data-testid="next-restroom-store">
              <strong>Store fallback:</strong> {next.store.restroom.name},{' '}
              {formatKmMi(next.store.aheadKm)} ahead
              {next.store.restroom.offRouteKm >= 0.05
                ? `, ${Math.round(next.store.restroom.offRouteKm * 1000)} m off the route`
                : ''}
              . Ask before using.
            </p>
          ) : null}

          {position?.status === 'far-from-section' ? (
            <p className="small" style={{ marginTop: 8 }}>
              <strong>This fix is {position.offRouteKm.toFixed(1)} km from today’s section,</strong> so
              “ahead” may be wrong.
            </p>
          ) : null}

          <p className="small muted" style={{ marginTop: 8 }}>
            {fix?.pretend ? 'Pretend position from Settings' : `Fix at ${fix ? formatClock(new Date(fix.at)) : '—'}`}.
            Distances are along the route. Types are inferred from OpenStreetMap, not checked.
          </p>
        </>
      ) : (
        <p style={{ margin: '4px 0 0' }}>
          Tap to see the next three restrooms ahead and the gap after each.
        </p>
      )}

      {loadError ? (
        <p className="small" role="alert" style={{ marginTop: 8 }}>
          Restroom list did not load ({loadError}). It is cached once the app has been opened online.
        </p>
      ) : null}
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
          disabled={geo.status === 'locating' || !file}
          data-testid="next-restroom-button"
        >
          {geo.status === 'locating' ? 'Finding you… up to 15 s' : 'Next restroom'}
        </button>
      </div>
    </section>
  );
}

function RestroomRow({ a, best, last }: { a: AheadRestroom; best: boolean; last: boolean }): ReactNode {
  const r = a.restroom;
  const off = r.offRouteKm >= 0.05 ? `${Math.round(r.offRouteKm * 1000)} m off the route` : 'on the route';
  const gap =
    a.gapAfterKm === null
      ? 'nothing public on file after this'
      : `then ${formatKmMi(a.gapAfterKm)} to the next public one`;
  return (
    <li style={{ marginBottom: last ? 0 : 10 }}>
      <div>
        <strong>{formatKmMi(a.aheadKm)}</strong> · {KIND_LABEL[r.kind]}
        {best ? ' ★' : ''}
      </div>
      <div className="small">
        {r.name ? `${r.name} · ` : ''}
        {off}
        {r.notes.length ? ` · ${r.notes.join(', ')}` : ''}
      </div>
      <div className="small muted">{gap}</div>
    </li>
  );
}
