import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useAppState } from '../state/AppState';
import { DemoBanner } from '../components/DemoBanner';
import { Metric } from '../components/Metric';
import { buildDayContext } from '../lib/dayContext';
import { downloadText } from '../lib/download';
import { dayGpx, dayGpxFilename, daySummaryText } from '../lib/routeExport';
import { formatClock, formatDayLabel, formatKmMi } from '../lib/time';
import { formatDuration } from '../lib/pace';
import { href, navigate } from '../router';
import {
  CHECKLIST_ITEMS,
  checklistComplete,
  loadPrepared,
  savePrepared,
} from '../state/dayPlanStore';
import type { ChecklistId, PreparedRecord } from '../state/dayPlanStore';
import { OVER_LONG_KM } from '../lib/dayPlan';
import type { DayLeg } from '../lib/dayPlan';

/**
 * Prepare Tomorrow — the hotel-night workflow.
 *
 * Phone-first and deliberately small. This is not the route workbench shrunk
 * down; it is the eight things that actually have to happen at 10 p.m.: check
 * the day, adjust the finish if needed, set the continuation, look at the
 * daylight, export one file, work the checklist.
 *
 * The export is ONE file per day carrying several tracks, because Footpath
 * saves multiple tracks as a named list in a single action — three sequential
 * save-or-lose imports is the wrong thing to ask of a tired person.
 */
export function PrepareScreen({ dayId }: { dayId: string | null }): ReactNode {
  const { dataset, plan, effectiveDate, userPoints } = useAppState();
  const [prepared, setPrepared] = useState<Record<string, PreparedRecord>>({});
  const [note, setNote] = useState<string | null>(null);
  // A mirror of `prepared` for the tick handler, so several rapid taps compose
  // instead of racing the IndexedDB round trip and losing one another.
  const preparedRef = useRef(prepared);
  preparedRef.current = prepared;

  useEffect(() => {
    void loadPrepared().then(setPrepared);
  }, []);

  // Default to tomorrow's walking day, else the next one on or after today.
  const leg: DayLeg | null = useMemo(() => {
    if (plan.legs.length === 0) return null;
    if (dayId) return plan.legs.find((l) => l.plan.dayId === dayId) ?? null;
    const upcoming = plan.legs
      .filter((l) => l.day && l.day.date > effectiveDate)
      .sort((a, b) => (a.day!.date < b.day!.date ? -1 : 1));
    return upcoming[0] ?? plan.legs[0] ?? null;
  }, [plan.legs, dayId, effectiveDate]);

  const record = leg ? prepared[leg.plan.dayId] : undefined;

  const toggle = useCallback(
    (id: ChecklistId, value: boolean) => {
      if (!leg || !dataset) return;
      const existing = preparedRef.current[leg.plan.dayId];
      const next: PreparedRecord = {
        dayId: leg.plan.dayId,
        preparedAt: existing?.preparedAt ?? null,
        checklist: { ...existing?.checklist, [id]: value },
        routeDataVersion: dataset.routeMeta.dataVersion,
        activeKm: leg.distanceKm,
        continueKm: leg.continuation?.extraKm ?? null,
      };
      // Update the box immediately; persist behind it. A tired tap should not
      // wait on storage.
      setPrepared((p) => ({ ...p, [leg.plan.dayId]: next }));
      void savePrepared(next);
    },
    [leg, dataset],
  );

  if (!dataset || !leg) return <p>Loading…</p>;

  const day = leg.day;
  const ctx = day ? buildDayContext(dataset, day) : null;
  const n = String(leg.plan.walkingDayNumber).padStart(2, '0');
  const endName =
    dataset.anchors.find((a) => a.properties.id === leg.endAnchorId)?.properties.title ??
    `${leg.endAlongKm.toFixed(1)} km along the route`;
  const complete = checklistComplete(record);

  return (
    <>
      <a className="backlink" href={href('/')}>
        ← Today
      </a>
      <DemoBanner inline />

      <header className="pagehead">
        <h1>Prepare day {leg.plan.walkingDayNumber}</h1>
        <p className="muted">
          {day ? `${day.date} · ${formatDayLabel(new Date(`${day.date}T12:00:00+09:00`))}` : ''}
          {day ? ` · ${day.label}` : ''}
        </p>
      </header>

      <div className="field">
        <label htmlFor="prep-day">Preparing</label>
        <select
          id="prep-day"
          data-testid="prepare-day-select"
          value={leg.plan.dayId}
          onChange={(e) => navigate(`/prepare/${e.target.value}`)}
        >
          {plan.legs.map((l) => (
            <option key={l.plan.dayId} value={l.plan.dayId}>
              Day {l.plan.walkingDayNumber}
              {l.day ? ` — ${l.day.date}` : ''} — {l.distanceKm.toFixed(1)} km
            </option>
          ))}
        </select>
      </div>

      <section className={leg.distanceKm > OVER_LONG_KM ? 'card card--stop' : 'card card--ok'}>
        <div className="card__label">The day</div>
        <div className="card__big" data-testid="prepare-active-km">
          {formatKmMi(leg.distanceKm)}
        </div>
        <p className="small muted" style={{ marginTop: 4 }}>
          finishing at {endName}
        </p>
        {leg.distanceKm > OVER_LONG_KM ? (
          <p className="small">
            <strong>Over {OVER_LONG_KM} km.</strong> This is longer than a day you can plan around. Move the
            finish on the <a href={href('/plan')}>plan screen</a> before you commit to it.
          </p>
        ) : null}

        <div className="metrics" style={{ marginTop: 12 }}>
          <Metric
            label="Continuation"
            value={leg.continuation ? `+${formatKmMi(leg.continuation.extraKm)}` : 'none set'}
            note={leg.continuation ? `overlaps ${leg.continuation.overlapKm.toFixed(1)} km back` : undefined}
            testId="prepare-continue"
          />
          <Metric
            label="If you continue"
            value={formatKmMi(leg.distanceKm + (leg.continuation?.extraKm ?? 0))}
          />
          <Metric label="Cumulative" value={formatKmMi(leg.cumulativeKm)} />
          <Metric label="Sunrise" value={formatClock(ctx?.sunrise ?? null)} />
          <Metric
            label="Sunset"
            value={formatClock(ctx?.sunset ?? null)}
            note="astronomical; ignores terrain"
          />
          <Metric
            label="Daylight"
            value={formatDuration(ctx?.dayLengthMinutes ?? null)}
            note={day?.railRedundancy ? `rail ${day.railRedundancy}` : undefined}
          />
        </div>

        {leg.draftKm !== null ? (
          <p className="small muted" style={{ marginTop: 10 }}>
            The draft schedule said {leg.draftKm.toFixed(1)} km. Measured on the route it is{' '}
            {leg.distanceKm.toFixed(1)} km, {(leg.deltaKm ?? 0) >= 0 ? '+' : ''}
            {(leg.deltaKm ?? 0).toFixed(1)} km.
          </p>
        ) : null}
      </section>

      {day && (day.safetyNotes.length > 0 || day.weatherSensitive.length > 0) ? (
        <section className="card card--warn">
          <h2>Read before you start</h2>
          <ul className="notes small">
            {day.safetyNotes.map((s) => (
              <li key={s}>{s}</li>
            ))}
            {day.weatherSensitive.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {ctx && ctx.bailouts.length > 0 ? (
        <section className="card">
          <h2>Bailouts on this day</h2>
          <ul className="notes small">
            {ctx.bailouts.map((b) => (
              <li key={b.properties.id}>{b.properties.title}</li>
            ))}
          </ul>
          {day?.railRedundancy === 'low' ? (
            <p className="small">
              <strong>Low rail redundancy.</strong> The decision point comes earlier than the
              arithmetic suggests.
            </p>
          ) : null}
        </section>
      ) : null}

      <section className="card">
        <h2>Export for tomorrow</h2>
        <p className="small">
          One file, {leg.continuation ? 'two tracks' : 'one track'}. Footpath will offer to save
          them into a list called <span className="mono">Tokaido D{n}</span>.
        </p>
        <div className="btnrow">
          <button
            type="button"
            className="btn btn--primary"
            data-testid="export-day-gpx"
            onClick={() => {
              try {
                downloadText(
                  dayGpx(dataset, leg, new Date(), userPoints.points),
                  dayGpxFilename(leg),
                  'application/gpx+xml',
                );
                setNote(
                  'Saved. On iOS this opens the share sheet — Save to Files, then open it from Footpath and choose Save to list.',
                );
              } catch (e) {
                setNote(`Export failed: ${e instanceof Error ? e.message : String(e)}`);
              }
            }}
          >
            Day {leg.plan.walkingDayNumber} → GPX
          </button>
          <button
            type="button"
            className="btn"
            data-testid="export-day-summary"
            onClick={() => {
              downloadText(
                daySummaryText(dataset, leg),
                `Tokaido-D${n}-${day?.date ?? 'undated'}.txt`,
                'text/plain',
              );
              setNote('Summary saved. Worth keeping on paper for the days that matter.');
            }}
          >
            Summary → text
          </button>
        </div>
        {note ? (
          <p className="small" role="status" data-testid="prepare-note">
            {note}
          </p>
        ) : null}
      </section>

      <section className={complete ? 'card card--ok' : 'card'}>
        <h2>Readiness</h2>
        <p className="small muted">
          Samwise cannot see whether Footpath imported the file, whether the Watch got the route, or
          whether Apple Maps has the region. There is no integration that would let it. These are
          your own checks, recorded.
        </p>
        {CHECKLIST_ITEMS.map((item) => (
          <div className="checkline" key={item.id}>
            <input
              id={`chk-${item.id}`}
              type="checkbox"
              data-testid={`chk-${item.id}`}
              checked={record?.checklist[item.id] === true}
              onChange={(e) => toggle(item.id, e.target.checked)}
            />
            <label htmlFor={`chk-${item.id}`}>{item.label}</label>
          </div>
        ))}

        <button
          type="button"
          className="btn btn--primary btn--wide"
          disabled={!complete}
          data-testid="mark-prepared"
          onClick={() => {
            const next: PreparedRecord = {
              dayId: leg.plan.dayId,
              preparedAt: new Date().toISOString(),
              checklist: preparedRef.current[leg.plan.dayId]?.checklist ?? {},
              routeDataVersion: dataset.routeMeta.dataVersion,
              activeKm: leg.distanceKm,
              continueKm: leg.continuation?.extraKm ?? null,
            };
            // Marking prepared is a deliberate commit, so wait for the write
            // to land before confirming it. Closing the app immediately after
            // must not lose it. The checkboxes above stay optimistic.
            void savePrepared(next).then((all) => {
              setPrepared(all);
              setNote(`Day ${leg.plan.walkingDayNumber} marked prepared.`);
            });
          }}
        >
          {complete ? 'Mark this day prepared' : 'Tick every item to mark prepared'}
        </button>

        {record?.preparedAt ? (
          <p className="small" data-testid="prepared-at">
            Marked prepared {record.preparedAt.slice(0, 16).replace('T', ' ')} against route data{' '}
            {record.routeDataVersion}.
            {record.activeKm.toFixed(1) !== leg.distanceKm.toFixed(1) ? (
              <>
                {' '}
                <strong>The day has changed since then</strong> — it was{' '}
                {record.activeKm.toFixed(1)} km, now {leg.distanceKm.toFixed(1)} km. Export again.
              </>
            ) : null}
          </p>
        ) : null}
      </section>

      <div className="btnrow">
        <a className="btn" href={href('/plan')}>
          Adjust the days
        </a>
        <a className="btn" href={href('/offline')}>
          Offline readiness
        </a>
        {day ? (
          <a className="btn" href={href(`/day/${day.id}`)}>
            Full day card
          </a>
        ) : null}
      </div>
    </>
  );
}
