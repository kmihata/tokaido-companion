import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { Dataset } from '../data/load';
import { buildStretches } from '../data/load';
import type { PlanningLine } from '../lib/planningLine';
import { buildPlanningLine } from '../lib/planningLine';
import { downloadText } from '../lib/download';
import { sectionFilename, sectionGpx, sectionStats } from '../lib/sectionExport';
import { parseRouteFile } from '../lib/routeImport';
import { applyRouteEdits, makeRouteEdit, validateRouteEdit } from '../lib/routeEdits';
import { deleteRouteEdit, loadRouteEdits } from '../state/routeEditStore';
import { formatKmMi } from '../lib/time';
import { checkTrace } from '../lib/traceChecks';
import type { TraceCheck } from '../lib/traceChecks';
import { dayImpact } from './dayImpact';
import { acceptAsCorrect, nextStep } from './sectionWork';
import type { SectionWork, WorklistRow } from './sectionWork';

const STEPS = ['Export', 'Trace', 'Import', 'Adopt', 'Bake'] as const;

function stepIndex(w: SectionWork): number {
  switch (w.status) {
    case 'untouched':
      return 0;
    case 'exported':
      return 1;
    case 'imported':
      return 3;
    case 'adopted':
      return 4;
    default:
      return 5;
  }
}

/**
 * One section, start to finish.
 *
 * The whole loop in one place, in order, with the numbers that decide whether
 * to adopt shown *before* adopting — including what it does to the day
 * boundaries, because those are what hotels get booked against.
 */
export function SectionPanel({
  row,
  dataset,
  line,
  onChange,
}: {
  row: WorklistRow;
  dataset: Dataset;
  line: PlanningLine;
  onChange: (w: SectionWork) => Promise<void>;
}): ReactNode {
  const [imported, setImported] = useState<{
    filename: string;
    positions: [number, number][];
    lengthKm: number;
    spacingM: number;
    check: TraceCheck;
  } | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [acceptReason, setAcceptReason] = useState('');

  const { section, work } = row;
  const at = stepIndex(work);

  const stats = useMemo(
    () => sectionStats(line, dataset.anchors, section.fromAnchorId, section.toAnchorId),
    [line, dataset.anchors, section],
  );

  // What adopting would do, computed against a throwaway edit so the numbers
  // are the real ones rather than an estimate.
  const preview = useMemo(() => {
    if (!imported || !stats) return null;
    const input = {
      kind: 'replace-section' as const,
      label: `${section.fromTitle} to ${section.toTitle}, retraced`,
      origin: {
        filename: imported.filename,
        trackName: null,
        format: 'gpx',
        importedAt: new Date().toISOString(),
      },
      divergeAnchorId: section.fromAnchorId,
      rejoinAnchorId: section.toAnchorId,
      geometry: imported.positions,
    };
    const check = validateRouteEdit(input, dataset.anchors);
    if (!check.ok) return { error: check.errors.join(' ') };
    const edit = makeRouteEdit(input);
    const applied = applyRouteEdits(dataset.routeMeta, dataset.routeFeatures, [edit], dataset.anchors);
    const built = buildStretches(applied.meta, applied.features, dataset.anchors);
    const nextLine = buildPlanningLine(built.stretches, built.breaks);
    const impact = dayImpact(
      { line, anchors: dataset.anchors },
      { line: nextLine, anchors: dataset.anchors },
      dataset.days,
      null,
    );
    return { edit, nextLine, impact, routeDelta: nextLine.lengthKm - line.lengthKm };
  }, [imported, stats, section, line, dataset]);

  if (!stats) return <section className="card"><p>This section no longer resolves on the route.</p></section>;

  const onExport = (): void => {
    const name = sectionFilename(stats);
    downloadText(
      sectionGpx(line, dataset.anchors, dataset.waypoints, stats, [], 2, new Date()),
      name,
      'application/gpx+xml',
    );
    void onChange({
      ...work,
      status: 'exported',
      exportedFilename: name,
      exportedAt: new Date().toISOString(),
      spacingBeforeM: stats.meanSpacingM,
      updatedAt: new Date().toISOString(),
    });
  };

  const onFile = async (file: File): Promise<void> => {
    setProblem(null);
    setImported(null);
    try {
      const parsed = parseRouteFile(file.name, await file.text());
      if (!parsed.ok) {
        setProblem(parsed.errors.join(' '));
        return;
      }
      if (parsed.tracks.length !== 1) {
        // Multiple tracks is the Footpath-shaped failure: an editor that split
        // the line leaves pieces that must never be silently joined.
        setProblem(
          `That file holds ${parsed.tracks.length} separate tracks. A section is one track — check what the editor exported.`,
        );
        return;
      }
      const pts = parsed.tracks[0]!.positions.map((p) => [p[0], p[1]] as [number, number]);
      const check = checkTrace(pts);
      setImported({
        filename: file.name,
        positions: pts,
        lengthKm: check.lengthKm,
        spacingM: check.meanSpacingM,
        check,
      });
    } catch (e) {
      setProblem(e instanceof Error ? e.message : String(e));
    }
  };

  // Name the actual file. A placeholder is one more thing to work out at the
  // point where the work is otherwise finished, and this is the step that gets
  // skipped — five adopted retraces were lost on 2026-09-13 because they never
  // got past it.
  const traced = work.importedFilename ?? imported?.filename ?? null;
  const suggestedName = `${sectionFilename(stats).replace(/\.gpx$/, '')}-traced.gpx`;

  return (
    <section className="card" data-testid="section-panel">
      <h2>
        {section.fromTitle} → {section.toTitle}
      </h2>
      <p className="small muted">
        {stats.lengthKm.toFixed(2)} km · {stats.pointCount} points ·{' '}
        {stats.meanSpacingM.toFixed(0)} m spacing · worst gap {stats.maxGapM.toFixed(0)} m · starts{' '}
        {formatKmMi(stats.fromKm)}
      </p>

      <div data-testid="steps">
        {STEPS.map((s, i) => (
          <div
            key={s}
            className={`step${i === at ? ' step--now' : ''}${i < at ? ' step--done' : ''}`}
          >
            <span className="step__n">{i + 1}</span>
            <span>{s}</span>
          </div>
        ))}
      </div>

      <p className="small" data-testid="next-step">
        <strong>Next:</strong> {nextStep(work)}
      </p>

      {row.stale ? (
        <p className="small warn" data-testid="panel-stale">
          Exported {work.exportedAt?.slice(0, 10)} and nothing has come back. Either the traced file
          is sitting in Downloads, or this was abandoned — mark it skipped if so.
        </p>
      ) : null}

      <div className="btnrow">
        <button type="button" className="btn btn--primary" onClick={onExport} data-testid="desk-export">
          {work.status === 'untouched' ? 'Export for tracing' : 'Export again'}
        </button>
        <button
          type="button"
          className="btn"
          onClick={() =>
            void onChange({ ...work, status: 'skipped', updatedAt: new Date().toISOString() })
          }
        >
          Skip this one
        </button>
      </div>

      {/*
        Accepting a section overrides the measurement, so it has to say why.
        The spacing figure is the only other evidence the desk has, and a bare
        status that outranks it — with no note, as `skipped` has always been —
        is unreadable a month later. Required, not optional, for that reason.
      */}
      <div className="field" data-testid="accept-as-correct">
        <label className="field__label" htmlFor="accept-reason">
          Or accept it as correct — say why
        </label>
        <input
          id="accept-reason"
          type="text"
          data-testid="accept-reason"
          placeholder="e.g. straight road, line sits on it to 0.4 m — OSM has no nodes to snap to"
          value={acceptReason}
          onChange={(e) => setAcceptReason(e.target.value)}
        />
        <button
          type="button"
          className="btn"
          data-testid="accept-submit"
          disabled={acceptReason.trim().length === 0}
          onClick={() => {
            const reason = acceptReason.trim();
            setAcceptReason('');
            void (async () => {
              // The desk never writes to this store — its adopt is bookkeeping,
              // and the throwaway edit above exists only to price the day
              // boundaries. But the field app's import screen does write here,
              // against the same anchors, so a section can carry an edit the
              // desk did not make. Accepting rejects it either way.
              for (const e of await loadRouteEdits()) {
                if (e.divergeAnchorId === section.fromAnchorId && e.rejoinAnchorId === section.toAnchorId) {
                  await deleteRouteEdit(e.id);
                }
              }
              await onChange(acceptAsCorrect(work, reason));
            })();
          }}
        >
          Accept as correct
        </button>
      </div>

      <label className="field">
        <span className="field__label">Bring the traced file back</span>
        <input
          type="file"
          accept=".gpx,.geojson,.json"
          data-testid="desk-import"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void onFile(f);
          }}
        />
      </label>

      {problem ? (
        <p className="small warn" data-testid="desk-problem">
          {problem}
        </p>
      ) : null}

      {imported && imported.check.problems.length > 0 ? (
        <section className="card card--stop" data-testid="trace-problems">
          <h3>Check this before adopting</h3>
          <ul className="notes">
            {imported.check.problems.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
          <p className="small muted">
            Three files came back like this on 2026-09-13 and two of them looked right on the map.
            One would have put nearly nine kilometres of walking into the route that nobody does.
          </p>
          <p className="small muted">
            This is about the file itself, so it is shown before anything about how the edit joins
            the route — a join that fails is usually the symptom rather than the fault.
          </p>
        </section>
      ) : null}

      {imported && preview ? (
        'error' in preview ? (
          <p className="small warn" data-testid="desk-problem">
            {preview.error}
          </p>
        ) : (
          <>
            <h3>What this changes</h3>
            <table className="shift" data-testid="desk-preview">
              <tbody>
                <tr>
                  <th>Point spacing</th>
                  <td className="num">
                    {stats.meanSpacingM.toFixed(0)} m → {imported.spacingM.toFixed(0)} m
                  </td>
                </tr>
                <tr>
                  <th>This section</th>
                  <td className="num">
                    {stats.lengthKm.toFixed(2)} → {imported.lengthKm.toFixed(2)} km
                  </td>
                </tr>
                <tr>
                  <th>Out and back?</th>
                  <td className="num" data-testid="trace-sinuosity">
                    {imported.check.sinuosity.toFixed(2)}× the straight line
                  </td>
                </tr>
                <tr>
                  <th>Whole route</th>
                  <td className="num">
                    {preview.routeDelta >= 0 ? '+' : ''}
                    {(preview.routeDelta * 1000).toFixed(0)} m → {preview.nextLine.lengthKm.toFixed(2)} km
                  </td>
                </tr>
              </tbody>
            </table>

            <h3>What it does to the days</h3>
            {preview.impact.changedEnds.length > 0 ? (
              <p className="small warn" data-testid="day-end-changed">
                {preview.impact.changedEnds.length} day
                {preview.impact.changedEnds.length === 1 ? '' : 's'} would finish at a different
                anchor. Check this against anything already booked.
              </p>
            ) : (
              <p className="small muted" data-testid="day-end-same">
                No day changes where it finishes. {preview.impact.movedKm} day
                {preview.impact.movedKm === 1 ? '' : 's'} move by more than 50 m.
              </p>
            )}
            <table className="shift">
              <tbody>
                {preview.impact.shifts
                  .filter((s) => Math.abs(s.afterKm - s.beforeKm) >= 0.05)
                  .slice(0, 8)
                  .map((s) => (
                    <tr key={s.dayId}>
                      <th>{s.label}</th>
                      <td className="num">
                        {s.beforeKm.toFixed(1)} → {s.afterKm.toFixed(1)} km
                      </td>
                      <td className="num">
                        {s.afterKm - s.beforeKm >= 0 ? '+' : ''}
                        {((s.afterKm - s.beforeKm) * 1000).toFixed(0)} m
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>

            <div className="btnrow">
              <button
                type="button"
                className={imported.check.problems.length > 0 ? 'btn' : 'btn btn--primary'}
                data-testid="desk-adopt"
                onClick={() =>
                  void onChange({
                    ...work,
                    status: 'adopted',
                    importedFilename: imported.filename,
                    importedAt: new Date().toISOString(),
                    spacingAfterM: imported.spacingM,
                    updatedAt: new Date().toISOString(),
                  })
                }
              >
                {imported.check.problems.length > 0 ? 'Adopt anyway' : 'Adopt'}
              </button>
            </div>
          </>
        )
      ) : null}

      {work.status === 'adopted' ? (
        <section className="card card--warn" data-testid="bake-reminder">
          <h3>Not safe yet</h3>
          <p className="small">
            Adopted on this machine only, which is not a safe home: a cleared cache took five
            adopted retraces on 2026-09-13. Move the traced file out of Downloads and bake it.
          </p>
          <p className="small mono" data-testid="bake-move">
            {traced ? `mv ~/Downloads/"${traced}" route-sources/working/${suggestedName}` : null}
          </p>
          <p className="small muted">
            Then bake it into the shipped data — ask for it by name, or run{' '}
            <code>npm run route:apply-edits</code> with an exported edits file.
          </p>
          <p className="small muted" data-testid="bake-no-button">
            There is no button for this. Baking writes the shipped route, which the browser cannot
            do, so a button here could only have marked it done — and that is exactly how this
            section would leave the worklist without the route ever changing. It clears itself when
            the geometry proves it: run the bake and reload.
          </p>
        </section>
      ) : null}
    </section>
  );
}
