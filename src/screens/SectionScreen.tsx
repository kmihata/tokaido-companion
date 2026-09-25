import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useAppState } from '../state/AppState';
import { DemoBanner } from '../components/DemoBanner';
import { Metric } from '../components/Metric';
import { downloadText } from '../lib/download';
import {
  anchorsAlongRoute,
  sectionFilename,
  sectionGpx,
  sectionStats,
  sectionsByCoarseness,
} from '../lib/sectionExport';
import { formatKmMi } from '../lib/time';
import { href } from '../router';

/**
 * Cut one section out for editing elsewhere.
 *
 * Editing the whole route in a single browser document is how 49 km of
 * accidental backtrack got appended without anyone noticing. A section between
 * two anchors is small enough to see whole.
 *
 * The coarseness list is the useful part: it says where tracing would actually
 * change something, rather than leaving the choice to guesswork. Mean spacing
 * is a proxy for cutting corners, which is what makes a distance an
 * underestimate and a cue sheet say "Unknown path".
 */
export function SectionScreen(): ReactNode {
  const { dataset, plan, userPoints } = useAppState();
  const [fromId, setFromId] = useState('');
  const [toId, setToId] = useState('');
  const [note, setNote] = useState<string | null>(null);

  const line = plan.line;
  const anchors = plan.anchors;

  const ordered = useMemo(
    () => (line ? anchorsAlongRoute(line, anchors) : []),
    [line, anchors],
  );

  const coarse = useMemo(
    () => (line ? sectionsByCoarseness(line, anchors).slice(0, 12) : []),
    [line, anchors],
  );

  // Default to the coarsest section — the one most worth doing.
  const effectiveFrom = fromId || coarse[0]?.fromAnchorId || ordered[0]?.anchor.properties.id || '';
  const effectiveTo = toId || coarse[0]?.toAnchorId || ordered[1]?.anchor.properties.id || '';

  const stats = useMemo(
    () => (line && effectiveFrom && effectiveTo ? sectionStats(line, anchors, effectiveFrom, effectiveTo) : null),
    [line, anchors, effectiveFrom, effectiveTo],
  );

  if (!dataset || !line) return <p>Loading…</p>;

  const quality =
    stats === null
      ? null
      : stats.meanSpacingM > 120
        ? { cls: 'card card--stop', label: 'Coarse — worth tracing' }
        : stats.meanSpacingM > 60
          ? { cls: 'card card--warn', label: 'Moderate' }
          : { cls: 'card card--ok', label: 'Already fine' };

  return (
    <>
      <a className="backlink" href={href('/route')}>
        ← Route
      </a>
      <DemoBanner inline />
      <h1>Export a section</h1>
      <p className="muted small">
        Cut the route between two named points, trace it in gpx.studio with road snapping on, then
        bring it back through <a href={href('/import')}>Import geometry</a>. Work one section at a
        time — a 534 km document is too big to notice something going wrong in.
      </p>

      <section className="card">
        <h2>Where it still needs work</h2>
        <p className="small muted">
          Coarsest first. Mean spacing is a proxy for cutting corners. Rural stretches with few
          junctions can stay coarse; cities and river crossings are where it costs you.
        </p>
        <ul className="list" data-testid="coarse-sections">
          {coarse.map((s) => (
            <li key={`${s.fromAnchorId}-${s.toAnchorId}`}>
              <button
                type="button"
                className="list__item"
                style={{
                  cursor: 'pointer',
                  width: '100%',
                  textAlign: 'left',
                  ...(s.fromAnchorId === effectiveFrom && s.toAnchorId === effectiveTo
                    ? { borderColor: 'var(--accent)', borderWidth: 2 }
                    : {}),
                }}
                onClick={() => {
                  setFromId(s.fromAnchorId);
                  setToId(s.toAnchorId);
                  setNote(null);
                }}
              >
                <h3>
                  {s.fromTitle} → {s.toTitle}
                </h3>
                <div className="list__meta">
                  {Math.round(s.meanSpacingM)} m spacing · worst gap {Math.round(s.maxGapM)} m ·{' '}
                  {s.lengthKm.toFixed(1)} km · at km {s.fromKm.toFixed(0)}
                </div>
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="card">
        <h2>Or choose the ends yourself</h2>
        <div className="field">
          <label htmlFor="sec-from">From</label>
          <select
            id="sec-from"
            data-testid="section-from"
            value={effectiveFrom}
            onChange={(e) => {
              setFromId(e.target.value);
              setNote(null);
            }}
          >
            {ordered.map(({ anchor, alongKm }) => (
              <option key={anchor.properties.id} value={anchor.properties.id}>
                {alongKm.toFixed(1)} km — {anchor.properties.title}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="sec-to">To</label>
          <select
            id="sec-to"
            data-testid="section-to"
            value={effectiveTo}
            onChange={(e) => {
              setToId(e.target.value);
              setNote(null);
            }}
          >
            {ordered.map(({ anchor, alongKm }) => (
              <option key={anchor.properties.id} value={anchor.properties.id}>
                {alongKm.toFixed(1)} km — {anchor.properties.title}
              </option>
            ))}
          </select>
        </div>
      </section>

      {stats && quality ? (
        <section className={quality.cls} data-testid="section-stats">
          <div className="card__label">{quality.label}</div>
          <h2 style={{ marginTop: 4 }}>
            {stats.fromTitle} → {stats.toTitle}
          </h2>
          <div className="metrics">
            <Metric label="Length" value={formatKmMi(stats.lengthKm)} testId="section-length" />
            <Metric label="Points" value={stats.pointCount} />
            <Metric
              label="Mean spacing"
              value={`${Math.round(stats.meanSpacingM)} m`}
              testId="section-spacing"
            />
            <Metric label="Worst gap" value={`${Math.round(stats.maxGapM)} m`} />
            <Metric label="Starts at" value={`${stats.fromKm.toFixed(1)} km`} />
            <Metric label="Ends at" value={`${stats.toKm.toFixed(1)} km`} />
          </div>

          {stats.lengthKm > 25 ? (
            <p className="small">
              <strong>That is a big section.</strong> Five to fifteen kilometres is a comfortable
              editing document; much more and a stray click stops being obvious.
            </p>
          ) : null}

          <button
            type="button"
            className="btn btn--primary btn--wide"
            data-testid="export-section"
            style={{ marginTop: 12 }}
            onClick={() => {
              try {
                downloadText(
                  sectionGpx(line, anchors, dataset.waypoints, stats, userPoints.points),
                  sectionFilename(stats),
                  'application/gpx+xml',
                );
                setNote(
                  `Saved ${sectionFilename(stats)}. Open it in gpx.studio, trace with snapping on, export, then import it back as a replaced section.`,
                );
              } catch (e) {
                setNote(`Export failed: ${e instanceof Error ? e.message : String(e)}`);
              }
            }}
          >
            Export this section
          </button>
          {note ? (
            <p className="small" role="status" data-testid="section-note">
              {note}
            </p>
          ) : null}
          <p className="small muted">
            The file carries the nearby post stations and hazards as waypoints, so the Tokaido
            furniture is visible while you trace. They are context only — don&rsquo;t export them
            back.
          </p>
        </section>
      ) : (
        <p className="muted">Choose two different points on the route.</p>
      )}
    </>
  );
}
