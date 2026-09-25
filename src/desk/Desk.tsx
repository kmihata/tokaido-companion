import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { loadDataset } from '../data/load';
import type { Dataset } from '../data/load';
import { buildPlanningLine } from '../lib/planningLine';
import { sectionsByCoarseness } from '../lib/sectionExport';
import { formatKmMi } from '../lib/time';
import { buildWorklist, worklistTotals, workKey } from './sectionWork';
import type { WorklistRow } from './sectionWork';
import { loadSectionWork, saveSectionWork } from './deskStore';
import type { SectionWork } from './sectionWork';
import { SectionPanel } from './SectionPanel';

/**
 * The desk.
 *
 * One list, one panel. The list answers "what should I do next" and the panel
 * answers "what do I do about this one" — which between them are the two
 * questions that were previously answered by remembering.
 */
export function Desk(): ReactNode {
  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [works, setWorks] = useState<SectionWork[]>([]);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  useEffect(() => {
    // `fresh` bypasses the service worker's precache. The desk has no offline
    // promise and must never show a route the repository has moved past; the
    // field app relies on the opposite and does not pass it.
    loadDataset({ fresh: true }).then(setDataset, (e: unknown) =>
      setError(e instanceof Error ? e.message : String(e)),
    );
    void loadSectionWork().then(setWorks);
  }, []);

  const line = useMemo(
    () => (dataset ? buildPlanningLine(dataset.stretches, dataset.breaks) : null),
    [dataset],
  );

  const sections = useMemo(
    () => (line && dataset ? sectionsByCoarseness(line, dataset.anchors) : []),
    [line, dataset],
  );

  const rows = useMemo(() => buildWorklist(sections, works), [sections, works]);
  const totals = useMemo(() => worklistTotals(rows), [rows]);

  // `skipped` and `accepted` are both decisions rather than states of the
  // geometry, and both mean the section is off the list for good.
  const settled = (r: WorklistRow): boolean =>
    r.work.status === 'baked' || r.work.status === 'skipped' || r.work.status === 'accepted';
  const outstanding = useMemo(() => rows.filter((r) => !settled(r)), [rows]);
  const done = useMemo(() => rows.filter(settled), [rows]);

  const selected = useMemo(
    () => rows.find((r) => r.key === selectedKey) ?? outstanding[0] ?? rows[0] ?? null,
    [rows, outstanding, selectedKey],
  );

  const update = useCallback(async (next: SectionWork) => {
    setWorks(await saveSectionWork(next));
  }, []);

  if (error) {
    return (
      <div className="desk">
        <h1>Route data would not load</h1>
        <p className="mono">{error}</p>
        <p>The desk reads the same shipped data as the field app. Run the dev server from the project root.</p>
      </div>
    );
  }
  if (!dataset || !line) return <div className="desk"><p>Loading…</p></div>;

  return (
    <div className="desk">
      <header className="desk__head">
        <h1>Samwise Desk</h1>
        <p className="muted">
          Route work. Not the field app — nothing here is meant to be opened on the road.
        </p>
        <p className="small mono">
          {dataset.routeMeta.dataVersion} · {formatKmMi(line.lengthKm)} · {totals.baked} baked ·{' '}
          {totals.remaining} still to do
          {totals.outstanding > 0 ? ` · ${totals.outstanding} out for tracing` : ''}
        </p>
      </header>

      {totals.stale > 0 ? (
        <section className="card card--stop" data-testid="stale-warning">
          <h2>
            {totals.stale} export{totals.stale === 1 ? '' : 's'} never came back
          </h2>
          <p>
            A section was exported for tracing and nothing has been imported since. That is how a
            finished retrace of Yoshida-juku to Goyu-juku sat in Downloads for three weeks while the
            route kept the coarse line. Check the top of the list.
          </p>
        </section>
      ) : null}

      <div className="desk__grid">
        <section>
          <h2>What to do next</h2>
          <ul className="wl" data-testid="worklist">
            {outstanding.map((r) => (
              <li key={r.key}>
                <Row row={r} selected={selected?.key === r.key} onPick={setSelectedKey} />
              </li>
            ))}
          </ul>
          {outstanding.length === 0 ? (
            <p className="muted" data-testid="worklist-empty">
              Nothing left to trace.
            </p>
          ) : null}

          {/* Done work is collapsed rather than cut off. The list used to be
              capped at forty rows and finished sections sank below it, so the
              header could say "43 baked" while the list showed none of them —
              there was no way to confirm a section had actually landed. */}
          {done.length > 0 ? (
            <details data-testid="worklist-done">
              <summary>
                Done — {done.length} of {rows.length} sections
              </summary>
              <ul className="wl">
                {done.map((r) => (
                  <li key={r.key}>
                    <Row row={r} selected={selected?.key === r.key} onPick={setSelectedKey} />
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </section>

        <div>
          {selected ? (
            <SectionPanel
              key={selected.key}
              row={selected}
              dataset={dataset}
              line={line}
              onChange={update}
            />
          ) : (
            <p className="muted">Nothing left on the list.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({
  row,
  selected,
  onPick,
}: {
  row: WorklistRow;
  selected: boolean;
  onPick: (key: string) => void;
}): ReactNode {
  return (
    <button
      type="button"
      className={`wl__item${row.stale ? ' wl__item--stale' : ''}`}
      aria-current={selected}
      onClick={() => onPick(row.key)}
    >
      <span className="wl__title">
        {row.section.fromTitle} → {row.section.toTitle}
      </span>
      <Badge row={row} />
      <span className="wl__meta">
        {row.section.meanSpacingM.toFixed(0)} m spacing · {row.section.lengthKm.toFixed(1)} km ·
        starts {formatKmMi(row.section.fromKm)}
      </span>
    </button>
  );
}

function Badge({ row }: { row: WorklistRow }): ReactNode {
  if (row.stale) return <span className="wl__badge wl__badge--stale">not back</span>;
  const s = row.work.status;
  if (s === 'untouched') return <span className="wl__badge">to do</span>;
  if (s === 'baked') return <span className="wl__badge wl__badge--baked">baked</span>;
  return <span className="wl__badge">{s}</span>;
}

export { workKey };
