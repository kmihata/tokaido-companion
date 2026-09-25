import type { ReactNode } from 'react';
import { useAppState } from '../state/AppState';
import { currentOrNextDay } from '../data/load';
import { buildDayContext } from '../lib/dayContext';
import { DemoBanner } from '../components/DemoBanner';
import { Metric } from '../components/Metric';
import { UpdatePrompt } from '../components/UpdatePrompt';
import { formatClock, formatDayLabel, formatKmMi, daysBetweenIso } from '../lib/time';
import { formatDuration } from '../lib/pace';
import { href } from '../router';
import { useOnline } from '../state/useOnline';

/**
 * The launch view. It has to answer, in one screen and without scrolling past
 * the fold on a phone:
 *   - where am I in the trip
 *   - what is today's plan
 *   - what is the next consequential point
 *   - how much daylight and distance remain
 *   - is the information available offline
 */
export function Today(): ReactNode {
  const { dataset, datasetError, effectiveDate, dateIsOverridden, settings, reloadDataset } =
    useAppState();
  const online = useOnline();

  if (datasetError) {
    return (
      <div className="card card--stop">
        <h1>Data did not load</h1>
        <p className="mono">{datasetError}</p>
        <p>
          If this is the first launch and there is no network, the app has not been able to cache
          anything yet. Connect once, then it works offline.
        </p>
        <button type="button" className="btn btn--primary" onClick={() => void reloadDataset()}>
          Try again
        </button>
      </div>
    );
  }

  if (!dataset) return <p>Loading…</p>;

  const { trip, days } = dataset;
  const day = currentOrNextDay(days, effectiveDate);
  const beforeTrip = effectiveDate < trip.routeStart;
  const daysToStart = daysBetweenIso(effectiveDate, trip.routeStart);

  return (
    <>
      <DemoBanner />
      <UpdatePrompt />

      <header className="pagehead">
        <h1>{formatDayLabel(new Date(`${effectiveDate}T12:00:00+09:00`))}</h1>
        <p className="muted">
          {trip.title} · {trip.direction}
          {dateIsOverridden ? ' · previewing a future date' : ''}
        </p>
      </header>

      {beforeTrip ? (
        <section className="card">
          <div className="card__label">Where I am in the trip</div>
          <div className="card__big">{daysToStart} days to the first walking day</div>
          <p className="muted small" style={{ marginTop: 8 }}>
            Route runs {trip.routeStart} to {trip.routeEnd}: {trip.walkingDayCount} walking days,{' '}
            {trip.recoveryDayCount} movable recovery days, {trip.flexDayCount} true flex day.
            Working route {trip.workingRouteKmMin}–{trip.workingRouteKmMax} km.
          </p>
          <p className="small">
            Nothing below is live yet. Set a preview date under{' '}
            <a href={href('/settings')}>More → Settings</a> to exercise a walking day.
          </p>
        </section>
      ) : null}

      {day ? <TodayDay dayId={day.id} /> : <p>No day found for {effectiveDate}.</p>}

      <section className="card">
        <div className="card__label">Offline readiness</div>
        <p style={{ margin: '4px 0 10px' }}>
          {online
            ? 'Device reports a network. Check that the offline copy is complete before you need it.'
            : 'No network. What you can see is what is cached.'}
        </p>
        <a className="btn btn--wide" href={href('/offline')}>
          Check offline readiness
        </a>
      </section>

      <p className="small muted">
        Pace in use: {settings.paceKmh !== null ? `${settings.paceKmh.toFixed(1)} km/h` : 'not set'}.
        Daylight buffer: {formatDuration(settings.safetyBufferMinutes)}.
      </p>
    </>
  );
}

function TodayDay({ dayId }: { dayId: string }): ReactNode {
  const { dataset, settings, plan } = useAppState();
  if (!dataset) return null;
  const day = dataset.days.find((d) => d.id === dayId);
  if (!day) return null;

  const ctx = buildDayContext(dataset, day);
  const nextPoint = ctx.hazards[0] ?? ctx.bailouts[0] ?? null;
  // The measured distance from the route beats the draft figure wherever it
  // exists, and the difference is worth showing rather than hiding.
  const leg = plan.legs.find((l) => l.plan.dayId === day.id) ?? null;

  return (
    <>
      <section className={day.kind === 'walk' ? 'card card--ok' : 'card'}>
        <div className="card__label">
          {day.kind === 'walk'
            ? `Walking day ${day.walkingDayNumber} of ${dataset.trip.walkingDayCount}`
            : day.kind}
        </div>
        <h2 style={{ marginTop: 4 }}>{day.label}</h2>
        <p>{day.plan}</p>

        <div className="metrics">
          <Metric
            label={leg ? 'Measured on the route' : 'Nominal route'}
            value={formatKmMi(leg ? leg.distanceKm : day.nominalDistanceKm)}
            note={
              leg && leg.deltaKm !== null
                ? `draft said ${leg.draftKm!.toFixed(1)} km`
                : 'provisional'
            }
            testId="today-nominal"
          />
          <Metric
            label="Cumulative"
            value={formatKmMi(leg ? leg.cumulativeKm : null)}
            note={leg ? `of ${dataset.routeMeta.totals.activeWalkingKm.toFixed(0)} km` : undefined}
          />
          <Metric label="Sunset" value={formatClock(ctx.sunset)} note="astronomical; ignores terrain" />
          <Metric
            label="Sunrise"
            value={formatClock(ctx.sunrise)}
            note={ctx.dayLengthMinutes ? `${formatDuration(ctx.dayLengthMinutes)} of light` : undefined}
          />
          <Metric
            label="Rail redundancy"
            value={day.railRedundancy ?? '—'}
            note={day.railRedundancy === 'low' ? 'few exits' : undefined}
          />
          <Metric label="Sleep base" value={day.sleepBase ?? '—'} />
        </div>

        {day.startLightGuidance ? (
          <p style={{ marginTop: 12 }}>
            <strong>Start:</strong> {day.startLightGuidance}
          </p>
        ) : null}

        <p className="small muted" style={{ marginTop: 10 }}>
          Tired-day view: {day.tiredDaySummary}
        </p>
      </section>

      {nextPoint ? (
        <section className="card card--warn">
          <div className="card__label">Next consequential point on file</div>
          <h3>{nextPoint.properties.title}</h3>
          <p className="small muted">
            {nextPoint.properties.type} · {nextPoint.properties.confidence} ·{' '}
            {nextPoint.properties.verification}
          </p>
          {nextPoint.properties.safetyNotes ? <p>{nextPoint.properties.safetyNotes}</p> : null}
          <a className="btn btn--wide" href={href(`/place/${nextPoint.properties.id}`)}>
            Open detail
          </a>
        </section>
      ) : null}

      <div className="btnrow">
        <a className="btn btn--primary" href={href('/decide')}>
          Continue or stop?
        </a>
        <a className="btn btn--primary" href={href('/prepare')} data-testid="prepare-tomorrow">
          Prepare tomorrow
        </a>
        <a className="btn" href={href(`/day/${day.id}`)}>
          Full day card
        </a>
        <a className="btn" href={href('/map')}>
          Map
        </a>
      </div>

      {settings.paceKmh === null ? (
        <p className="small muted">
          No pace set yet, so arrival times are unavailable. Enter one on the Decide screen.
        </p>
      ) : null}
    </>
  );
}
