import { useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useAppState } from '../state/AppState';
import { DemoBanner } from '../components/DemoBanner';
import { Metric } from '../components/Metric';
import { parseRouteFile } from '../lib/routeImport';
import type { ImportedTrack } from '../lib/routeImport';
import { makeRouteEdit, validateRouteEdit } from '../lib/routeEdits';
import type { MakeRouteEditInput, RouteEditKind } from '../lib/routeEdits';
import { applyRouteEdits } from '../lib/routeEdits';
import { buildStretches } from '../data/load';
import { buildPlanningLine } from '../lib/planningLine';
import {
  OVER_LONG_KM,
  applyOverrides,
  buildDefaultDayPlans,
  buildLegs,
  planTotals,
} from '../lib/dayPlan';
import { haversineKm } from '../lib/geo';
import type { Position } from '../lib/geo';
import { formatKmMi } from '../lib/time';
import { href, navigate } from '../router';
import type { AnchorFeature } from '../data/schemas';

/**
 * Bringing an edited section back from an external editor.
 *
 * The two halves of the round trip: Route → export the reference layer and the
 * active route; trace in gpx.studio or CalTopo; come back here.
 *
 * Nothing is adopted until the consequences are on screen. An edit that shortens
 * a day by nine kilometres is a schedule decision, not a file operation.
 */
export function ImportRouteScreen(): ReactNode {
  const { dataset, plan, routeEdits } = useAppState();
  const fileRef = useRef<HTMLInputElement | null>(null);

  const [filename, setFilename] = useState<string | null>(null);
  const [tracks, setTracks] = useState<ImportedTrack[]>([]);
  const [format, setFormat] = useState<string>('');
  const [warnings, setWarnings] = useState<string[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [selected, setSelected] = useState(0);

  const [kind, setKind] = useState<RouteEditKind>('replace-section');
  const [label, setLabel] = useState('');
  const [reason, setReason] = useState('');
  const [divergeId, setDivergeId] = useState('');
  const [rejoinId, setRejoinId] = useState('');
  const [gapPathId, setGapPathId] = useState('');

  const anchors = plan.anchors;
  const track = tracks[selected] ?? null;

  const onFile = async (file: File): Promise<void> => {
    setErrors([]);
    setWarnings([]);
    const text = await file.text();
    const r = parseRouteFile(file.name, text);
    if (!r.ok) {
      setTracks([]);
      setErrors(r.errors);
      return;
    }
    setFilename(file.name);
    setTracks(r.tracks);
    setFormat(r.format);
    setWarnings(r.warnings);
    setSelected(0);
    setLabel(r.tracks[0]?.name ?? file.name.replace(/\.[^.]+$/, ''));

    // Suggest the anchors the geometry actually meets. Usually right, always
    // overridable — this is the difference between one tap and hunting a list
    // of ninety-eight.
    const first = r.tracks[0];
    if (first) {
      const s = suggestEndpoints(anchors, first.positions[0]!, first.positions[first.positions.length - 1]!);
      if (s) {
        setDivergeId(s.fromId);
        setRejoinId(s.toId);
      }
    }
  };

  // A gap is a path with no geometry: the Seven-ri crossing, the missing
  // Kyoto approach, anything excluded for safety.
  const gaps = useMemo(
    () => dataset?.routeMeta.paths.filter((p) => p.lengthKm === null) ?? [],
    [dataset],
  );

  const candidate = useMemo<MakeRouteEditInput | null>(() => {
    if (!track || !filename) return null;
    const gap = gaps.find((g) => g.id === gapPathId);
    return {
      kind,
      label,
      reason,
      origin: { filename, trackName: track.name, format, importedAt: new Date().toISOString() },
      divergeAnchorId: kind === 'resolve-gap' ? (gap?.startAnchorId ?? divergeId) : divergeId,
      rejoinAnchorId:
        kind === 'resolve-gap' ? (gap?.endAnchorId ?? null) : rejoinId || null,
      replacesPathId: kind === 'resolve-gap' ? (gap?.id ?? null) : null,
      geometry: track.positions,
      active: kind !== 'add-variant',
    };
  }, [track, filename, format, kind, label, reason, divergeId, rejoinId, gapPathId, gaps]);

  const validation = useMemo(
    () => (candidate ? validateRouteEdit(candidate, anchors) : null),
    [candidate, anchors],
  );

  /** What adopting this would do to the route and to every day. */
  const consequence = useMemo(() => {
    if (!dataset || !candidate || !validation?.ok || candidate.active === false) return null;
    try {
      const edit = makeRouteEdit(candidate);
      const { meta, features } = applyRouteEdits(dataset.routeMeta, dataset.routeFeatures, [edit], dataset.anchors);
      const built = buildStretches(meta, features, dataset.anchors);
      const line = buildPlanningLine(built.stretches, built.breaks);
      const plans = applyOverrides(
        buildDefaultDayPlans(line, dataset.anchors, dataset.days),
        plan.document,
      );
      const legs = buildLegs(line, plans, dataset.days, dataset.anchors);
      return {
        lengthKm: line.lengthKm,
        breaks: built.breaks.length,
        totals: planTotals(legs),
        legs,
      };
    } catch {
      return null;
    }
  }, [dataset, candidate, validation, plan.document]);

  if (!dataset) return <p>Loading…</p>;

  const before = planTotals(plan.legs);

  // An edit already covering this stretch will be superseded, not stacked.
  const overlapping = routeEdits.edits.filter((e) => {
    if (!e.active || !candidate) return false;
    const a = anchors.find((x) => x.properties.id === e.divergeAnchorId);
    const b = e.rejoinAnchorId ? anchors.find((x) => x.properties.id === e.rejoinAnchorId) : null;
    const ca = anchors.find((x) => x.properties.id === candidate.divergeAnchorId);
    const cb = candidate.rejoinAnchorId
      ? anchors.find((x) => x.properties.id === candidate.rejoinAnchorId)
      : null;
    if (!a || !ca || a.properties.pathId !== ca.properties.pathId) return false;
    const [f1, t1] = [a.properties.indexOnPath, b?.properties.indexOnPath ?? Number.MAX_SAFE_INTEGER].sort((x, y) => x - y);
    const [f2, t2] = [ca.properties.indexOnPath, cb?.properties.indexOnPath ?? Number.MAX_SAFE_INTEGER].sort((x, y) => x - y);
    return f1! < t2! && f2! < t1!;
  });

  return (
    <>
      <a className="backlink" href={href('/route')}>
        ← Route
      </a>
      <DemoBanner inline />
      <h1>Import route geometry</h1>

      <section className="card">
        <p className="small">
          Trace the section in gpx.studio or CalTopo with road snapping on, export it, then bring it
          back here. Export the <a href={href('/route')}>reference layer</a> first so the post
          stations and hazards are visible while you draw.
        </p>
        <input
          ref={fileRef}
          type="file"
          accept=".gpx,.json,.geojson,application/gpx+xml,application/json,application/geo+json"
          data-testid="import-file"
          style={{ display: 'none' }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void onFile(f);
            e.target.value = '';
          }}
        />
        <button
          type="button"
          className="btn btn--primary btn--wide"
          onClick={() => fileRef.current?.click()}
        >
          Choose a GPX or GeoJSON file
        </button>
        <p className="small muted">
          GPX tracks, multi-track files, track segments and routes; GeoJSON LineString,
          MultiLineString and FeatureCollection. Separate pieces stay separate — nothing is joined
          for you.
        </p>
      </section>

      {errors.length > 0 ? (
        <div className="card card--stop" data-testid="import-errors">
          <div className="card__label">Could not read that file</div>
          <ul className="notes small">
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {tracks.length > 0 ? (
        <>
          <section className="card">
            <h2>What is in the file</h2>
            <p className="small muted">
              {filename} · {format} · {tracks.length} {tracks.length === 1 ? 'piece' : 'pieces'}
            </p>
            <div className="field">
              <label htmlFor="imp-track">Use this piece</label>
              <select
                id="imp-track"
                data-testid="import-track"
                value={selected}
                onChange={(e) => {
                  const i = Number(e.target.value);
                  setSelected(i);
                  const t = tracks[i];
                  if (!t) return;
                  setLabel(t.name ?? `Section ${i + 1}`);
                  const sug = suggestEndpoints(anchors, t.positions[0]!, t.positions[t.positions.length - 1]!);
                  if (sug) {
                    setDivergeId(sug.fromId);
                    setRejoinId(sug.toId);
                  }
                }}
              >
                {tracks.map((t, i) => (
                  <option key={i} value={i}>
                    {t.name ?? `Piece ${i + 1}`} — {t.lengthKm.toFixed(1)} km, {t.positions.length} points
                  </option>
                ))}
              </select>
            </div>
            {warnings.length > 0 ? (
              <ul className="notes small" data-testid="import-warnings">
                {warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            ) : null}
          </section>

          <section className="card">
            <h2>What this is</h2>
            <div className="field">
              <label htmlFor="imp-kind">Adopt it as</label>
              <select
                id="imp-kind"
                data-testid="import-kind"
                value={kind}
                onChange={(e) => setKind(e.target.value as RouteEditKind)}
              >
                <option value="replace-section">A replacement for a section of the route</option>
                <option value="resolve-gap">The missing piece that closes a gap</option>
                <option value="add-variant">A prepared alternative, not active yet</option>
              </select>
            </div>

            {kind === 'resolve-gap' ? (
              <div className="field">
                <label htmlFor="imp-gap">Which gap</label>
                <select
                  id="imp-gap"
                  data-testid="import-gap"
                  value={gapPathId}
                  onChange={(e) => setGapPathId(e.target.value)}
                >
                  <option value="">Choose…</option>
                  {gaps.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.title}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <>
                <AnchorPicker
                  id="imp-diverge"
                  label="Starts at"
                  anchors={anchors}
                  value={divergeId}
                  onChange={setDivergeId}
                  near={track?.positions[0] ?? null}
                />
                <AnchorPicker
                  id="imp-rejoin"
                  label="Rejoins at"
                  anchors={anchors}
                  value={rejoinId}
                  onChange={setRejoinId}
                  near={track ? track.positions[track.positions.length - 1]! : null}
                  allowNone
                  noneLabel="Runs on to the end — does not rejoin"
                />
              </>
            )}

            <div className="field">
              <label htmlFor="imp-label">Name</label>
              <input
                id="imp-label"
                type="text"
                data-testid="import-label"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
              />
            </div>

            <div className="field">
              <label htmlFor="imp-reason">Why</label>
              <textarea
                id="imp-reason"
                value={reason}
                placeholder="Hiryu Falls hybrid, avoids the switchbacks. Traced from the Kanagawa trail notice."
                onChange={(e) => setReason(e.target.value)}
                style={{ minHeight: 70 }}
              />
            </div>
          </section>

          {validation && !validation.ok ? (
            <div className="card card--stop" data-testid="import-validation">
              <div className="card__label">Will not adopt this</div>
              <ul className="notes small">
                {validation.errors.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {validation?.ok && validation.warnings.length > 0 ? (
            <div className="card card--warn">
              <ul className="notes small">
                {validation.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {overlapping.length > 0 ? (
            <div className="card card--warn" data-testid="import-overlap">
              <div className="card__label">This replaces a change you already made</div>
              <ul className="notes small">
                {overlapping.map((e) => (
                  <li key={e.id}>{e.label}</li>
                ))}
              </ul>
              <p className="small" style={{ margin: 0 }}>
                Adopting this supersedes it — the newer change is the one walked. The old one stays
                in the list, marked superseded, until you delete it.
              </p>
            </div>
          ) : null}

          {consequence ? (
            <section className="card card--warn" data-testid="import-consequence">
              <h2>What this changes</h2>
              <div className="metrics">
                <Metric
                  label="Route length"
                  value={formatKmMi(consequence.lengthKm)}
                  note={`was ${dataset.activeLengthKm.toFixed(1)} km`}
                  testId="consequence-length"
                />
                <Metric
                  label="Breaks"
                  value={consequence.breaks}
                  note={`was ${dataset.breaks.length}`}
                  testId="consequence-breaks"
                />
                <Metric
                  label={`Days over ${OVER_LONG_KM} km`}
                  value={consequence.totals.overLongCount}
                  note={`was ${before.overLongCount}`}
                />
              </div>
              <div className="card__label" style={{ marginTop: 12 }}>
                Days that change
              </div>
              <ul className="notes small" data-testid="consequence-days">
                {consequence.legs
                  .map((l, i) => ({ l, was: plan.legs[i]?.distanceKm ?? null }))
                  .filter(({ l, was }) => was !== null && Math.abs(l.distanceKm - was) > 0.05)
                  .map(({ l, was }) => (
                    <li key={l.plan.dayId}>
                      Day {l.plan.walkingDayNumber}: {was!.toFixed(1)} → {l.distanceKm.toFixed(1)} km
                      {l.distanceKm > OVER_LONG_KM ? ` ⚠ over ${OVER_LONG_KM} km` : ''}
                    </li>
                  ))}
                {consequence.legs.every(
                  (l, i) => Math.abs(l.distanceKm - (plan.legs[i]?.distanceKm ?? l.distanceKm)) <= 0.05,
                ) ? (
                  <li>No day changes length.</li>
                ) : null}
              </ul>
            </section>
          ) : null}

          <button
            type="button"
            className="btn btn--primary btn--wide"
            data-testid="import-adopt"
            disabled={!candidate || !validation?.ok}
            onClick={() => {
              if (!candidate || !validation?.ok) return;
              const edit = makeRouteEdit(candidate);
              void routeEdits.save(edit).then(() => navigate('/route'));
            }}
          >
            Adopt this change
          </button>
          <p className="small muted">
            Adopting adds it as a variant. Nothing overwrites the imported source route, so this can
            be switched off again without restoring anything.
          </p>
        </>
      ) : null}
    </>
  );
}

function AnchorPicker({
  id,
  label,
  anchors,
  value,
  onChange,
  near,
  allowNone = false,
  noneLabel = 'None',
}: {
  id: string;
  label: string;
  anchors: readonly AnchorFeature[];
  value: string;
  onChange: (v: string) => void;
  near: Position | null;
  allowNone?: boolean;
  noneLabel?: string;
}): ReactNode {
  // Nearest first: the anchor the geometry actually meets is almost always the
  // one wanted, and hunting ninety-eight names is not a phone task.
  const ordered = useMemo(() => {
    if (!near) return anchors.map((a) => ({ anchor: a, km: null as number | null }));
    return anchors
      .map((a) => ({
        anchor: a,
        km: haversineKm(near, [a.geometry.coordinates[0], a.geometry.coordinates[1]] as Position),
      }))
      .sort((x, y) => x.km - y.km);
  }, [anchors, near]);

  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <select id={id} data-testid={id} value={value} onChange={(e) => onChange(e.target.value)}>
        {allowNone ? <option value="">{noneLabel}</option> : null}
        {ordered.map(({ anchor, km }) => (
          <option key={anchor.properties.id} value={anchor.properties.id}>
            {anchor.properties.title}
            {km !== null ? ` — ${km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`} away` : ''}
          </option>
        ))}
      </select>
    </div>
  );
}

/**
 * Suggest both endpoints together, not separately.
 *
 * Junctions carry two anchors at the identical coordinate — the last point of
 * one alignment and the first of the next. Matching each end on its own picks
 * whichever comes first in the list, which put a section cut from the Saya
 * Kaido onto the Tokaido and made the route 45 km longer than it is. Resolving
 * the pair lets the ends agree about which alignment they are on.
 */
function suggestEndpoints(
  anchors: readonly AnchorFeature[],
  first: Position,
  last: Position,
): { fromId: string; toId: string } | null {
  const near = (p: Position): { anchor: AnchorFeature; km: number }[] => {
    const all = anchors
      .map((anchor) => ({
        anchor,
        km: haversineKm(p, [anchor.geometry.coordinates[0], anchor.geometry.coordinates[1]] as Position),
      }))
      .sort((a, b) => a.km - b.km);
    const best = all[0];
    if (!best) return [];
    // Everything effectively as close as the closest — that is the tie to break.
    return all.filter((x) => x.km <= best.km + 0.02);
  };

  const froms = near(first);
  const tos = near(last);
  if (froms.length === 0 || tos.length === 0) return null;

  let chosen: { fromId: string; toId: string; score: number } | null = null;
  for (const f of froms) {
    for (const t of tos) {
      const samePath = f.anchor.properties.pathId === t.anchor.properties.pathId;
      const forwards = t.anchor.properties.indexOnPath > f.anchor.properties.indexOnPath;
      // Same alignment first, then running the right way, then closeness.
      const score = (samePath ? 0 : 100) + (samePath && !forwards ? 10 : 0) + f.km + t.km;
      if (chosen === null || score < chosen.score) {
        chosen = { fromId: f.anchor.properties.id, toId: t.anchor.properties.id, score };
      }
    }
  }
  return chosen ? { fromId: chosen.fromId, toId: chosen.toId } : null;
}
