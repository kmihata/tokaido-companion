import { useState } from 'react';
import type { ReactNode } from 'react';
import { useAppState } from '../state/AppState';
import { DemoBanner } from '../components/DemoBanner';
import { Metric } from '../components/Metric';
import { downloadText } from '../lib/download';
import { activeRouteGeoJson, masterRouteGpx, referenceLayerGeoJson } from '../lib/routeExport';
import { routeEditsExport } from '../state/routeEditStore';
import { anchorAdjustmentsExport } from '../state/anchorAdjustStore';
import { formatKmMi } from '../lib/time';
import { href } from '../router';

/**
 * The route workbench, read-only for now.
 *
 * Phase 1 shows what the canonical route is, where it breaks, what is still
 * wrong with it, and hands it to the two places it needs to go: Footpath, and
 * whatever external editor is used to repair sections.
 */
export function RouteScreen(): ReactNode {
  const { dataset, userPoints, routeEdits, anchorAdjustments } = useAppState();
  const [note, setNote] = useState<string | null>(null);

  if (!dataset) return <p>Loading…</p>;
  const { routeMeta, stretches, breaks, activeLengthKm, anchors } = dataset;
  const today = new Date().toISOString().slice(0, 10);

  const save = (fn: () => string, filename: string, mime: string, label: string): void => {
    try {
      downloadText(fn(), filename, mime);
      setNote(
        `${label} saved. On iOS this opens the share sheet — choose Save to Files, then open it from Footpath or your editor.`,
      );
    } catch (e) {
      setNote(`Export failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  return (
    <>
      <a className="backlink" href={href('/more')}>
        ← More
      </a>
      <DemoBanner inline />
      <h1>Route</h1>

      <section className="card">
        <div className="card__label">Canonical route</div>
        <div className="card__big">{formatKmMi(activeLengthKm)}</div>
        <p className="small muted" style={{ marginTop: 4 }}>
          plus roughly {routeMeta.totals.missingKyotoApproachKmEstimate} km still missing into Kyoto
        </p>
        <div className="metrics" style={{ marginTop: 12 }}>
          <Metric label="Continuous stretches" value={stretches.length} />
          <Metric label="Breaks" value={breaks.length} testId="route-break-count" />
          <Metric label="Anchors" value={anchors.length} />
          <Metric label="East leg" value={formatKmMi(routeMeta.totals.eastKm)} />
          <Metric label="Saya Kaido" value={formatKmMi(routeMeta.totals.sayaKm)} note="active variant" />
          <Metric label="West leg" value={formatKmMi(routeMeta.totals.westKm)} />
        </div>
        <p className="small muted" style={{ marginTop: 10 }}>
          {routeMeta.totals.note}
        </p>
      </section>

      {breaks.length > 0 ? (
        <section className="card card--warn">
          <h2>Breaks</h2>
          <ul className="notes small">
            {breaks.map((b) => (
              <li key={b.pathId}>
                <strong>{b.title}</strong>
                {b.note ? ` — ${b.note}` : ''}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="card">
        <h2>Prepared alternatives</h2>
        <ul className="list">
          {routeMeta.variants.map((v) => (
            <li key={v.id} className="list__item">
              <h3>
                {v.title} {v.active ? '· active' : '· not active'}
              </h3>
              <div className="list__meta">
                {formatKmMi(v.lengthKm)} · {v.confidence} · {v.verification}
              </div>
              <p className="small" style={{ marginTop: 6 }}>
                {v.rationale}
              </p>
            </li>
          ))}
        </ul>
        <p className="small muted">
          Choosing between alternatives comes next. For now the Saya Kaido is active, which is what
          makes the route continuous from Nihonbashi to Yamashina.
        </p>
      </section>

      <section className="card">
        <h2>Export</h2>
        <p className="small">
          Exports carry no private data. Everything here is derived from cached geometry and works
          with no network.
        </p>

        <div className="btnrow">
          <button
            type="button"
            className="btn btn--primary"
            data-testid="export-master-gpx"
            onClick={() =>
              save(
                () => masterRouteGpx(dataset),
                `TOKAIDO-MASTER-${today}.gpx`,
                'application/gpx+xml',
                'Master route GPX',
              )
            }
          >
            Master route → GPX
          </button>
          <button
            type="button"
            className="btn"
            data-testid="export-reference-layer"
            onClick={() =>
              save(
                () => referenceLayerGeoJson(dataset, userPoints.points),
                `samwise-reference-layer-${today}.geojson`,
                'application/geo+json',
                'Reference layer',
              )
            }
          >
            Reference layer → GeoJSON
          </button>
          <button
            type="button"
            className="btn"
            onClick={() =>
              save(
                () => activeRouteGeoJson(dataset),
                `samwise-active-route-${today}.geojson`,
                'application/geo+json',
                'Active route',
              )
            }
          >
            Active route → GeoJSON
          </button>
        </div>

        {note ? (
          <p className="small" role="status" data-testid="export-note">
            {note}
          </p>
        ) : null}

        <div className="card__label" style={{ marginTop: 12 }}>
          What each one is for
        </div>
        <ul className="notes small">
          <li>
            <strong>Master route GPX</strong> — one track per continuous stretch, so Footpath saves
            them as separate routes in a list and never draws a line across a break.
          </li>
          <li>
            <strong>Reference layer</strong> — post stations, passes, bridges and known hazards, to
            load underneath while tracing in an external editor so you are not working over bare
            OSM.
          </li>
          <li>
            <strong>Active route</strong> — the alignment itself, for opening in an editor to repair
            a section.
          </li>
        </ul>
      </section>

      <section className="card">
        <h2>Changes you have made</h2>
        <p className="small muted">
          Every change is a variant layered on the imported route. Nothing overwrites the source, so
          switching one off puts the original back with no restore step.
        </p>

        <div className="btnrow">
          <a className="btn btn--primary" href={href('/section')} data-testid="export-section-link">
            Export a section
          </a>
          <a className="btn btn--primary" href={href('/import')} data-testid="import-route">
            Import geometry
          </a>
          <a className="btn" href={href('/adjust')} data-testid="adjust-anchor-link">
            Adjust an anchor
          </a>
          {anchorAdjustments.adjustments.length > 0 ? (
            <button
              type="button"
              className="btn"
              data-testid="export-adjustments"
              onClick={() =>
                save(
                  () =>
                    anchorAdjustmentsExport(anchorAdjustments.adjustments, routeMeta.dataVersion),
                  `samwise-anchor-adjustments-${today}.json`,
                  'application/json',
                  'Anchor adjustments',
                )
              }
            >
              Export anchor moves
            </button>
          ) : null}
          {routeEdits.edits.length > 0 ? (
            <button
              type="button"
              className="btn"
              data-testid="export-edits"
              onClick={() =>
                save(
                  () => routeEditsExport(routeEdits.edits, routeMeta.dataVersion),
                  `samwise-route-edits-${today}.json`,
                  'application/json',
                  'Route edits',
                )
              }
            >
              Export changes
            </button>
          ) : null}
        </div>

        {routeEdits.edits.length === 0 ? (
          <p className="muted small">
            None yet. Export the reference layer, trace the section in gpx.studio, then bring it
            back.
          </p>
        ) : (
          <ul className="list" data-testid="route-edits">
            {routeEdits.edits.map((e) => (
              <li key={e.id} className="list__item">
                <h3>
                  {e.label}{' '}
                  {routeEdits.superseded.includes(e.id)
                    ? '· superseded'
                    : e.active
                      ? '· active'
                      : '· off'}
                </h3>
                <div className="list__meta">
                  {e.kind} · {formatKmMi(e.lengthKm)} · {e.verification} · from {e.origin.filename}
                </div>
                {routeEdits.superseded.includes(e.id) ? (
                  <p className="small" style={{ marginTop: 6 }}>
                    <strong>Replaced by a newer change covering the same stretch.</strong> It is not
                    part of the route. Delete it once you are sure the newer one is right.
                  </p>
                ) : null}
                {e.reason ? (
                  <p className="small" style={{ marginTop: 6 }}>
                    {e.reason}
                  </p>
                ) : null}
                <div className="btnrow" style={{ marginTop: 8 }}>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => void routeEdits.setActive(e.id, !e.active)}
                  >
                    {e.active ? 'Switch off' : 'Switch on'}
                  </button>
                  <button
                    type="button"
                    className="btn btn--danger"
                    onClick={() => {
                      if (!window.confirm(`Delete "${e.label}"? Export your changes first if you want to keep it.`)) return;
                      void routeEdits.remove(e.id);
                    }}
                  >
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

        <p className="small muted">
          Changes live on this device. Export them and bake them into the shipped data with{' '}
          <span className="mono">npm run route:apply-edits</span> to make them permanent — the
          shipped route survives a storage eviction; a change on the device does not.
        </p>
      </section>

      <section className="card">
        <h2>Still to do on this route</h2>
        <ul className="notes">
          {routeMeta.knownWork.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      </section>

      <section className="card">
        <h2>Source and licence</h2>
        <table className="kv">
          <tbody>
            <tr>
              <th>Source</th>
              <td>
                <a href={routeMeta.source.url} target="_blank" rel="noreferrer noopener">
                  {routeMeta.source.name}
                </a>
              </td>
            </tr>
            <tr>
              <th>Represents</th>
              <td>{routeMeta.source.represents}</td>
            </tr>
            <tr>
              <th>Licence</th>
              <td>{routeMeta.source.licence}</td>
            </tr>
            <tr>
              <th>Attribution</th>
              <td>{routeMeta.source.attribution}</td>
            </tr>
            <tr>
              <th>Retrieved</th>
              <td>{routeMeta.source.retrieved}</td>
            </tr>
            <tr>
              <th>Data version</th>
              <td>{routeMeta.dataVersion}</td>
            </tr>
          </tbody>
        </table>
        <p className="small muted">
          Share-alike: anything derived from this route and published has to carry the same licence
          and this attribution.
        </p>
      </section>
    </>
  );
}
