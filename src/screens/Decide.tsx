import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useAppState } from '../state/AppState';
import { currentOrNextDay } from '../data/load';
import { buildDayContext, measureBailouts, projectOntoRoute } from '../lib/dayContext';
import { DemoBanner } from '../components/DemoBanner';
import { Metric } from '../components/Metric';
import { evaluateDecision, POSTURE_LABEL } from '../lib/decision';
import type { DecisionInput } from '../lib/decision';
import { formatDuration, paceKmh as computePace } from '../lib/pace';
import { formatClock, formatKmMi, parseLocalTime } from '../lib/time';
import { useGeolocation } from '../state/useGeolocation';
import { waypointPosition } from '../data/load';
import { AiHandoff } from '../components/AiHandoff';

/**
 * Decision support.
 *
 * Shows inputs, arithmetic, and uncertainty. The posture line is a summary of
 * the arithmetic, not a recommendation — the copy says so, and it must keep
 * saying so.
 */
export function Decide(): ReactNode {
  const { dataset, effectiveDate, settings, updateSettings } = useAppState();
  const geo = useGeolocation();

  const [completedKm, setCompletedKm] = useState('');
  const [paceInput, setPaceInput] = useState(
    settings.paceKmh !== null ? String(settings.paceKmh) : '',
  );
  const [elapsedMin, setElapsedMin] = useState('');
  const [deadlineText, setDeadlineText] = useState('');
  const [bailoutId, setBailoutId] = useState('');
  const [hotelKm, setHotelKm] = useState('');

  const day = dataset ? currentOrNextDay(dataset.days, effectiveDate) : null;
  const ctx = dataset && day ? buildDayContext(dataset, day) : null;

  const position = useMemo(
    () =>
      geo.lat !== null && geo.lon !== null
        ? { lat: geo.lat, lon: geo.lon, accuracyM: geo.accuracyM }
        : null,
    [geo.lat, geo.lon, geo.accuracyM],
  );

  // Where am I on the route? Falls back to the day's planned start when there
  // is no fix, so the screen is still usable indoors the night before.
  const fromPos = useMemo(
    () => (position ? ([position.lon, position.lat] as [number, number]) : (ctx?.startPos ?? null)),
    [position, ctx?.startPos],
  );

  const projection = useMemo(
    () => (dataset && fromPos ? projectOntoRoute(dataset.stretches, fromPos) : null),
    [dataset, fromPos],
  );

  const nearBailouts = useMemo(() => {
    if (!ctx || !dataset) return [];
    return measureBailouts(dataset.stretches, ctx.bailouts, projection, fromPos);
  }, [ctx, dataset, projection, fromPos]);

  const derivedPace = useMemo(() => {
    const d = Number(completedKm);
    const m = Number(elapsedMin);
    if (!completedKm || !elapsedMin || Number.isNaN(d) || Number.isNaN(m)) return null;
    return computePace(d, m);
  }, [completedKm, elapsedMin]);

  const effectivePace = paceInput.trim() !== '' ? Number(paceInput) : derivedPace;

  const chosenBailout =
    nearBailouts.find((b) => b.feature.properties.id === bailoutId) ?? nearBailouts[0] ?? null;

  const deadline = useMemo(() => {
    if (!day) return null;
    if (deadlineText.trim()) return parseLocalTime(day.date, deadlineText);
    return ctx?.sunset ?? null;
  }, [day, deadlineText, ctx?.sunset]);

  if (!dataset || !day || !ctx) return <p>Loading…</p>;

  const input: DecisionInput = {
    now: new Date(),
    plannedDistanceKm: day.nominalDistanceKm ?? 0,
    completedKm: Number(completedKm) || 0,
    paceKmh: effectivePace !== null && Number.isFinite(effectivePace) ? effectivePace : null,
    daylightDeadline: deadline,
    nextBailout:
      chosenBailout && chosenBailout.totalKm !== null
        ? {
            id: chosenBailout.feature.properties.id,
            title: chosenBailout.feature.properties.title,
            distanceKm: chosenBailout.totalKm,
          }
        : null,
    hotelDistanceKm: hotelKm.trim() ? Number(hotelKm) : null,
    tomorrowBaselineKm: ctx.tomorrow?.nominalDistanceKm ?? null,
    safetyBufferMinutes: settings.safetyBufferMinutes,
  };

  const r = evaluateDecision(input);
  const postureClass =
    r.posture === 'stop' ? 'card card--stop' : r.posture === 'continue' ? 'card card--ok' : 'card card--warn';

  return (
    <>
      <DemoBanner />

      <header className="pagehead">
        <h1>Continue or stop?</h1>
        <p className="muted">
          {day.date} — {day.label}
        </p>
      </header>

      <section className={postureClass} data-testid="posture-card" aria-live="polite">
        <div className="card__label">What the numbers say</div>
        <div className="card__big" data-testid="posture-label">
          {POSTURE_LABEL[r.posture]}
        </div>
        <p className="small" style={{ marginTop: 8 }}>
          This is arithmetic on what you entered, not advice, and not a safety decision. Read the
          inputs and the working below and decide yourself.
        </p>
        <ul className="notes small" data-testid="posture-reasons">
          {r.reasons.map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>
        {r.warnings.length > 0 ? (
          <>
            <div className="card__label" style={{ marginTop: 10 }}>
              Missing or doubtful inputs
            </div>
            <ul className="notes small" data-testid="posture-warnings">
              {r.warnings.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          </>
        ) : null}
      </section>

      <section className="card">
        <h2>Where things stand</h2>
        <div className="metrics">
          <Metric label="Planned today" value={formatKmMi(day.nominalDistanceKm)} note="provisional" />
          <Metric label="Completed" value={formatKmMi(Number(completedKm) || 0)} note="as entered" />
          <Metric label="Remaining" value={formatKmMi(r.remainingKm)} testId="remaining" />
          <Metric
            label="Time to finish"
            value={formatDuration(r.minutesToFinish)}
            note={r.etaFinish ? `arrive ${formatClock(r.etaFinish)}` : 'needs a pace'}
            testId="time-to-finish"
          />
          <Metric
            label="Daylight left"
            value={formatDuration(r.daylightRemainingMinutes)}
            note={deadline ? `deadline ${formatClock(deadline)}` : 'no deadline set'}
          />
          <Metric
            label="Margin at finish"
            value={formatDuration(r.finishMarginMinutes)}
            note={`after a ${settings.safetyBufferMinutes} min buffer`}
            testId="finish-margin"
          />
        </div>
      </section>

      <section className="card">
        <h2>If you stop here</h2>
        <div className="metrics">
          <Metric label="Moves to tomorrow" value={formatKmMi(r.deferredKm)} />
          <Metric
            label="Tomorrow baseline"
            value={formatKmMi(ctx.tomorrow?.nominalDistanceKm ?? null)}
            note={ctx.tomorrow ? ctx.tomorrow.label : 'no next walking day'}
          />
          <Metric
            label="Tomorrow becomes"
            value={formatKmMi(r.tomorrowIfStopNowKm)}
            note="if nothing else changes"
            testId="tomorrow-becomes"
          />
        </div>
        <p className="small muted" style={{ marginTop: 10 }}>
          There is a third option this arithmetic cannot see: stop here, take a train to the sleep
          base, and return to this exact point in the morning. That preserves continuous walking
          and moves nothing to tomorrow. It is the working method for this route.
        </p>
      </section>

      <section className="card">
        <h2>Next rail bailout</h2>
        {r.bailout && chosenBailout ? (
          <>
            <h3>{r.bailout.title}</h3>
            <div className="metrics">
              <Metric
                label="Along the route"
                value={formatKmMi(chosenBailout.alongRouteKm)}
                note={chosenBailout.ahead === false ? 'BEHIND you' : 'ahead'}
                testId="bailout-along"
              />
              <Metric
                label="Off the route"
                value={formatKmMi(chosenBailout.offRouteKm)}
                note="straight line to the station"
                testId="bailout-off"
              />
              <Metric
                label="Total to reach it"
                value={formatKmMi(chosenBailout.totalKm)}
                testId="bailout-distance"
              />
              <Metric
                label="Time at pace"
                value={formatDuration(r.bailout.minutes)}
                note={r.bailout.eta ? `arrive ${formatClock(r.bailout.eta)}` : undefined}
              />
              <Metric label="Margin" value={formatDuration(r.bailout.marginMinutes)} />
            </div>
            <p className="small muted" style={{ marginTop: 10 }}>
              Measured along the imported route, which is unverified and samples at roughly 100 m,
              so it cuts corners — the real walk is a little longer. The hop off the route to the
              station itself is still a straight line.
            </p>
            {chosenBailout.ahead === false ? (
              <p className="small">
                <strong>This exit is behind you.</strong> Reaching it means walking back.
              </p>
            ) : null}
          </>
        ) : (
          <p>
            No bailout could be measured against the route for this position.
            {nearBailouts.length > 0 ? ' Pick one below and check it on the map.' : ''}
          </p>
        )}
        {day.railRedundancy === 'low' ? (
          <p className="small">
            <strong>This day is marked low rail redundancy.</strong> Exits are sparse; the decision
            point comes earlier than the arithmetic suggests.
          </p>
        ) : null}
        {projection ? (
          <p className="small muted" data-testid="route-projection">
            Measuring from {projection.offRouteKm < 0.15
              ? 'a point on the route'
              : `${projection.offRouteKm.toFixed(1)} km off the route`}
            , {projection.alongKm.toFixed(1)} km along it.
          </p>
        ) : null}
      </section>

      <section className="card">
        <h2>Inputs</h2>

        <div className="field">
          <label htmlFor="in-completed">Distance walked so far today (km)</label>
          <input
            id="in-completed"
            type="number"
            inputMode="decimal"
            step="0.1"
            min="0"
            value={completedKm}
            data-testid="input-completed"
            onChange={(e) => setCompletedKm(e.target.value)}
          />
        </div>

        <div className="field">
          <label htmlFor="in-pace">Pace including stops (km/h)</label>
          <input
            id="in-pace"
            type="number"
            inputMode="decimal"
            step="0.1"
            min="0"
            value={paceInput}
            data-testid="input-pace"
            onChange={(e) => {
              setPaceInput(e.target.value);
              const n = Number(e.target.value);
              updateSettings({ paceKmh: e.target.value.trim() === '' || Number.isNaN(n) ? null : n });
            }}
          />
          <p className="field__hint">
            Including stops, not moving pace. A moving pace promises daylight that is not there.
            {derivedPace !== null
              ? ` From the elapsed time below, that works out at ${derivedPace.toFixed(1)} km/h.`
              : ''}
          </p>
        </div>

        <div className="field">
          <label htmlFor="in-elapsed">Elapsed since starting (minutes, optional)</label>
          <input
            id="in-elapsed"
            type="number"
            inputMode="numeric"
            step="1"
            min="0"
            value={elapsedMin}
            onChange={(e) => setElapsedMin(e.target.value)}
          />
          <p className="field__hint">Fill this and the distance above to derive a pace instead of typing one.</p>
        </div>

        <div className="field">
          <label htmlFor="in-deadline">Daylight deadline (HH:MM, Japan time)</label>
          <input
            id="in-deadline"
            type="time"
            value={deadlineText}
            data-testid="input-deadline"
            onChange={(e) => setDeadlineText(e.target.value)}
          />
          <p className="field__hint">
            Blank uses the computed sunset, {formatClock(ctx.sunset)}. That is astronomical sunset
            and ignores terrain — in a valley the light goes well before it. Entering your own
            earlier deadline is the more honest input.
          </p>
        </div>

        <div className="field">
          <label htmlFor="in-bailout">Bailout to measure against</label>
          <select
            id="in-bailout"
            value={chosenBailout?.feature.properties.id ?? ''}
            onChange={(e) => setBailoutId(e.target.value)}
          >
            {nearBailouts.map((b) => (
              <option key={b.feature.properties.id} value={b.feature.properties.id}>
                {b.feature.properties.title}
                {b.totalKm !== null
                  ? ` — ${b.totalKm.toFixed(1)} km ${b.ahead ? 'ahead' : 'back'}`
                  : ' — not on this stretch'}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor="in-hotel">Extra distance from finish to sleep base (km)</label>
          <input
            id="in-hotel"
            type="number"
            inputMode="decimal"
            step="0.1"
            min="0"
            value={hotelKm}
            onChange={(e) => setHotelKm(e.target.value)}
          />
        </div>

        <div className="btnrow">
          {geo.status === 'watching' ? (
            <button type="button" className="btn" onClick={geo.stop}>
              Stop using location
            </button>
          ) : (
            <button type="button" className="btn" onClick={geo.start}>
              Use my location for bailout distances
            </button>
          )}
        </div>
        {geo.error ? <p className="small">{geo.error}</p> : null}
        {position ? (
          <p className="small muted">
            Position {position.lat.toFixed(5)}, {position.lon.toFixed(5)}
            {position.accuracyM !== null ? ` (±${Math.round(position.accuracyM)} m)` : ''}. Foreground
            only — this stops when the phone locks.
          </p>
        ) : null}
      </section>

      <AiHandoff
        heading="Ask an AI about this decision"
        base={{
          day,
          waypoint: chosenBailout
            ? {
                ...chosenBailout.feature.properties,
                lon: waypointPosition(chosenBailout.feature)[0],
                lat: waypointPosition(chosenBailout.feature)[1],
              }
            : null,
          stations: ctx.stations,
          position,
          completedKm: completedKm.trim() ? Number(completedKm) : null,
          paceKmh: input.paceKmh,
          sunset: ctx.sunset,
        }}
      />
    </>
  );
}
