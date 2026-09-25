import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useAppState } from '../state/AppState';
import { DemoBanner } from '../components/DemoBanner';
import { Metric } from '../components/Metric';
import { href, navigate } from '../router';
import { formatKmMi } from '../lib/time';
import { positionAt } from '../lib/planningLine';
import { ANCHOR_TOLERANCE_KM, anchorAlongKm } from '../lib/dayPlan';
import {
  MAX_ADJUST_KM,
  anchorsOffRoute,
  makeAnchorAdjustment,
  structuralAnchorIds,
  validateAnchorAdjustment,
} from '../lib/anchorAdjust';

/**
 * Move a shipped anchor onto the road.
 *
 * The list is the diagnostic and the editor is the fix. Ranking by the detour
 * the route walks to reach an anchor — rather than by how far the anchor is
 * from the line — is what surfaces the real cases: an anchor that *is* a vertex
 * is zero metres from the route by definition, and still drags the line 43 m
 * sideways to touch it.
 */
export function AdjustAnchorScreen({ anchorId }: { anchorId: string | null }): ReactNode {
  const { dataset, plan, anchorAdjustments } = useAppState();
  const line = plan.line;

  const structural = useMemo(
    () => (dataset ? structuralAnchorIds(dataset.routeMeta, dataset.anchors) : new Set<string>()),
    [dataset],
  );

  const ranked = useMemo(
    () =>
      line
        ? anchorsOffRoute(line, dataset?.anchors ?? [], anchorAdjustments.adjustments, structural)
        : [],
    [line, dataset, anchorAdjustments.adjustments, structural],
  );

  if (!dataset || !line) return <p>Loading…</p>;
  if (anchorId) return <Editor anchorId={anchorId} />;

  const spikes = ranked.filter((r) => ((r.isSpike && r.detourM >= 10) || r.adjusted) && !r.structural);
  const corners = ranked.filter((r) => !r.structural && !r.isSpike && r.detourM >= 50);
  const pinned = ranked.filter((r) => r.structural && r.detourM >= 10);

  return (
    <>
      <a className="backlink" href={href('/route')}>
        ← Route
      </a>
      <DemoBanner inline />

      <header className="pagehead">
        <h1>Adjust an anchor</h1>
        <p className="muted">
          Anchors come from recorded GPS traces, and walkers start and finish at stations. Where a
          trace leaned off the road, the anchor inherited the lean — and because an anchor is a
          section boundary, retracing the section cannot fix it.
        </p>
      </header>

      <section className="card">
        <h2>Any anchor</h2>
        <p className="small muted">
          The lists below are what looks wrong. This is everything else — because an anchor can be
          in a poor place to stand without the geometry showing it, and once the route is tidy the
          lists go empty and there would otherwise be no way in at all.
        </p>
        <label className="field">
          <span className="field__label">Open an anchor</span>
          <select
            data-testid="adjust-pick"
            value=""
            onChange={(e) => {
              if (e.target.value) navigate(`/adjust/${e.target.value}`);
            }}
          >
            <option value="">Choose…</option>
            {ranked
              .filter((r) => !r.structural)
              .sort((a, b) => a.alongKm - b.alongKm)
              .map((r) => (
                <option key={r.anchor.properties.id} value={r.anchor.properties.id}>
                  {formatKmMi(r.alongKm)} · {r.anchor.properties.title}
                </option>
              ))}
          </select>
        </label>
      </section>

      {spikes.length === 0 ? (
        <section className="card card--ok" data-testid="adjust-none">
          <h2>Nothing pulling the route out of shape</h2>
          <p>No anchor makes the line leave its course and come straight back.</p>
        </section>
      ) : (
        <section className="card">
          <h2>The line goes out and comes back</h2>
          <p className="small muted">
            At these the route turns sharply to touch the anchor and then resumes the heading it
            was already on. That is a detour around nothing. “Detour” is the extra distance walked
            to reach it.
          </p>
          <ul className="list" data-testid="adjust-list">
            {spikes.slice(0, 20).map((r) => (
              <li key={r.anchor.properties.id}>
                <a className="list__item" href={href(`/adjust/${r.anchor.properties.id}`)}>
                  <h3>
                    {r.anchor.properties.title}
                    {r.adjusted ? ' · adjusted' : ''}
                  </h3>
                  <div className="list__meta">
                    {r.detourM} m detour · turns {r.turnDeg}° · {formatKmMi(r.alongKm)}
                  </div>
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      {pinned.length > 0 ? (
        <section className="card">
          <h2>Pinned by the route model</h2>
          <p className="small muted">
            These look like detours and cannot be moved. A fork reads as a sharp turn once the
            active route is flattened into one line, but the Saya Kaido has to leave the main line
            somewhere, and a path has to start and end somewhere. Detaching one of these joins is
            how 45 km was added to this route once already.
          </p>
          <ul className="list" data-testid="adjust-pinned">
            {pinned.slice(0, 6).map((r) => (
              <li key={r.anchor.properties.id}>
                <div className="list__item">
                  <h3>{r.anchor.properties.title}</h3>
                  <div className="list__meta">
                    {r.detourM} m · turns {r.turnDeg}° · {formatKmMi(r.alongKm)}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {corners.length > 0 ? (
        <section className="card">
          <h2>Sharp, but not wrong</h2>
          <p className="small muted">
            These turn just as sharply and are left alone: the road is still going the new way
            afterwards, so the anchor is on a genuine corner. Post towns were laid out with dog-leg
            junctions to slow traffic through them, so the Tōkaidō really does turn ninety degrees
            at a post station.
          </p>
          <ul className="list" data-testid="adjust-corners">
            {corners.slice(0, 6).map((r) => (
              <li key={r.anchor.properties.id}>
                <a className="list__item" href={href(`/adjust/${r.anchor.properties.id}`)}>
                  <h3>{r.anchor.properties.title}</h3>
                  <div className="list__meta">
                    {r.detourM} m · turns {r.turnDeg}°, still {r.netTurnDeg}° off course afterwards
                  </div>
                </a>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}

const NUDGES = [-50, -10, 10, 50];

function Editor({ anchorId }: { anchorId: string }): ReactNode {
  const { dataset, plan, anchorAdjustments } = useAppState();
  const line = plan.line;
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pendingKm, setPendingKm] = useState<number | null>(null);

  const anchor = dataset?.anchors.find((a) => a.properties.id === anchorId) ?? null;
  const shipped = anchor ? anchorAdjustments.byId(anchorId) : null;

  const currentKm = useMemo(
    () => (line && anchor ? anchorAlongKm(line, dataset?.anchors ?? [], anchorId) : null),
    [line, anchor, dataset, anchorId],
  );

  const structural = useMemo(
    () => (dataset ? structuralAnchorIds(dataset.routeMeta, dataset.anchors) : new Set<string>()),
    [dataset],
  );

  const stats = useMemo(
    () =>
      line
        ? anchorsOffRoute(line, anchor ? [anchor] : [], anchorAdjustments.adjustments, structural)[0] ??
          null
        : null,
    [line, anchor, anchorAdjustments.adjustments, structural],
  );

  if (!dataset || !line) return <p>Loading…</p>;
  if (!anchor) {
    return (
      <>
        <a className="backlink" href={href('/adjust')}>
          ← Adjust an anchor
        </a>
        <h1>Anchor not found</h1>
        <p className="mono">{anchorId}</p>
      </>
    );
  }

  const targetKm = pendingKm ?? currentKm;
  const target = targetKm === null ? null : positionAt(line, targetKm);
  const check =
    target === null
      ? null
      : validateAnchorAdjustment(line, dataset.anchors, anchorId, target, structural);

  const nudge = (metres: number): void => {
    if (targetKm === null) return;
    const next = Math.max(0, Math.min(line.lengthKm, targetKm + metres / 1000));
    setPendingKm(next);
    setError(null);
  };

  const onSave = async (): Promise<void> => {
    if (target === null || targetKm === null) return;
    if (note.trim().length < 3) {
      setError('Say why it moved. An unexplained shifted anchor looks like a data error later.');
      return;
    }
    const v = validateAnchorAdjustment(line, dataset.anchors, anchorId, target, structural);
    if (!v.ok) {
      setError(v.reason);
      return;
    }
    await anchorAdjustments.save(makeAnchorAdjustment(anchor, target, note));
    navigate('/adjust');
  };

  const onRemove = async (): Promise<void> => {
    await anchorAdjustments.remove(anchorId);
    navigate('/adjust');
  };

  return (
    <>
      <a className="backlink" href={href('/adjust')}>
        ← Adjust an anchor
      </a>
      <DemoBanner inline />

      <header className="pagehead">
        <h1>{anchor.properties.title}</h1>
        <p className="muted">
          {anchor.properties.titleJa} · {anchor.properties.kind}
        </p>
      </header>

      <section className="card">
        <h2>As it stands</h2>
        <div className="metrics">
          <Metric label="Detour it causes" value={stats ? `${stats.detourM} m` : '—'} testId="adjust-detour" />
          <Metric label="Off the route" value={stats ? `${stats.offRouteM} m` : '—'} testId="adjust-offroute" />
          <Metric label="Along the route" value={currentKm === null ? '—' : formatKmMi(currentKm)} />
        </div>
        {stats && !stats.isSpike && stats.detourM >= 50 ? (
          <p className="small">
            The line is still {stats.netTurnDeg}° off its old heading after this point, so this is
            a corner the road genuinely turns, not a detour around nothing. Moving it would
            straighten a bend that is really there.
          </p>
        ) : null}
        {stats && stats.offRouteM > ANCHOR_TOLERANCE_KM * 1000 * 0.8 ? (
          <p className="small">
            This is close to the {Math.round(ANCHOR_TOLERANCE_KM * 1000)} m limit past which the
            anchor stops resolving as a day finish. Worth moving for the margin alone.
          </p>
        ) : null}
      </section>

      <section className="card">
        <h2>Move it</h2>
        <p className="small muted">
          The anchor always lands on the route line, so it stays usable as a day finish and a
          section boundary. It cannot pass the anchor before or after it, and it cannot move more
          than {MAX_ADJUST_KM * 1000} m from where the source put it.
        </p>
        <p className="small">
          This moves the boundary, not the line. The stray point stays in the geometry until the
          section is retraced — but it is no longer pinned, so a retrace can now go straight past
          it. Moving the anchor is what makes the retrace able to fix it.
        </p>
        <div className="btnrow">
          {NUDGES.map((m) => (
            <button key={m} type="button" className="btn" data-testid={`adjust-nudge-${m}`} onClick={() => nudge(m)}>
              {m > 0 ? `+${m}` : m} m
            </button>
          ))}
        </div>
        {pendingKm !== null && currentKm !== null ? (
          <p className="small mono" data-testid="adjust-moved">
            moved {Math.round((pendingKm - currentKm) * 1000)} m along the route →{' '}
            {formatKmMi(pendingKm)}
          </p>
        ) : (
          <p className="small muted">Not moved yet.</p>
        )}
        {check && !check.ok ? <p className="small warn" data-testid="adjust-check">{check.reason}</p> : null}

        <label className="field">
          <span className="field__label">Why</span>
          <input
            type="text"
            value={note}
            data-testid="adjust-note"
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. source trace leaned toward the station forecourt"
          />
        </label>

        {error ? <p className="small warn" data-testid="adjust-error">{error}</p> : null}

        <div className="btnrow">
          <button
            type="button"
            className="btn btn--primary"
            data-testid="adjust-save"
            disabled={pendingKm === null || (check !== null && !check.ok)}
            onClick={() => void onSave()}
          >
            Save adjustment
          </button>
          {shipped ? (
            <button type="button" className="btn" data-testid="adjust-remove" onClick={() => void onRemove()}>
              Remove adjustment
            </button>
          ) : null}
        </div>
      </section>

      {shipped ? (
        <section className="card">
          <h2>Current adjustment</h2>
          <table className="kv">
            <tbody>
              <tr>
                <th>Moved</th>
                <td className="mono">{Math.round(shipped.movedKm * 1000)} m</td>
              </tr>
              <tr>
                <th>Why</th>
                <td>{shipped.note}</td>
              </tr>
              <tr>
                <th>Saved</th>
                <td className="mono">{shipped.savedAt}</td>
              </tr>
            </tbody>
          </table>
          <p className="small muted">
            The shipped anchor is untouched. Removing this restores exactly what the source
            published.
          </p>
          <p className="small">
            Still to do: export this section and retrace it. The boundary is now clear of the stray
            point, so the traced line can bypass it — which is the step that takes it out of the
            route.
          </p>
        </section>
      ) : null}
    </>
  );
}
