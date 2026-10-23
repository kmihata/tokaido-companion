import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useAppState } from '../state/AppState';
import { href } from '../router';
import {
  ROUTE_CHANGE_HORIZON_DAYS,
  buildLodgingViews,
  splitForTrip,
  stakesOfRouteChange,
} from '../lib/lodging';
import { readCutoff } from '../lib/leaveBy';
import type { LodgingView } from '../lib/lodging';
import type { Position } from '../lib/geo';

/**
 * Where you are sleeping, and what it costs to change your mind.
 *
 * This screen shows PRIVATE data only. Nothing here is in the repository: the
 * records come from the file Kevin imports in Settings and live in IndexedDB
 * on one device. The public build renders an empty state and an explanation.
 *
 * Order, since 2026-10-23: tonight's bed first, because on the road this is
 * where Kevin looks up the hotel he is walking to. Then the deadline summary,
 * then every later stay in trip order, then stays already done. Deadlines are
 * still on every card; the summary card is where they are ranked.
 */
function Field({ label, value }: { label: string; value: string }): ReactNode {
  if (!value) return null;
  return (
    <div style={{ marginTop: 4 }}>
      <span className="muted">{label}: </span>
      {value}
    </div>
  );
}

function Copyable({ label, value }: { label: string; value: string }): ReactNode {
  const [said, setSaid] = useState(false);
  if (!value) return null;
  return (
    <div style={{ marginTop: 4, display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
      <span className="muted">{label}: </span>
      {/* Shown as text, never as a tel: link. A mis-tap that dials a Japanese
          hotel at 3 a.m. from a pocket is a worse failure than one more tap. */}
      <span style={{ userSelect: 'all', fontVariantNumeric: 'tabular-nums' }}>{value}</span>
      <button
        type="button"
        className="btn btn--small"
        onClick={() => {
          void navigator.clipboard
            ?.writeText(value)
            .then(() => setSaid(true))
            .catch(() => setSaid(false));
        }}
      >
        {said ? 'Copied' : 'Copy'}
      </button>
    </div>
  );
}

function Card({ view, tonight = false }: { view: LodgingView; tonight?: boolean }): ReactNode {
  const { lodging: l, deadline, urgency, countdown, distanceKm } = view;
  const cls =
    urgency === 'passed' || urgency === 'today'
      ? 'card card--warn'
      : urgency === 'soon'
        ? 'card card--warn'
        : 'card';

  return (
    <section className={cls} data-testid={`lodging-${l.id}`}>
      <h3 style={{ marginBottom: 2 }}>{l.name}</h3>
      <p className="muted" style={{ marginTop: 0 }}>
        {l.checkIn ?? '—'} → {l.checkOut ?? '—'}
      </p>

      {tonight ? (
        <>
          <Field label="Address" value={l.address} />
          <Copyable label="Phone" value={l.phone} />
          <Field label="Check-in closes" value={l.arrivalCutoff ? readCutoff(l.arrivalCutoff).label : ''} />
        </>
      ) : null}

      <p style={{ margin: '8px 0 0', fontWeight: 600 }} data-testid={`countdown-${l.id}`}>
        Free cancellation: {countdown}
        {deadline.precision === 'date-only' ? (
          <span className="muted" style={{ fontWeight: 400 }}>
            {' '}
            — date only, exact time unknown
          </span>
        ) : null}
      </p>
      {deadline.at ? (
        <p className="small muted" style={{ margin: 0 }}>
          {deadline.at.toISOString().replace('T', ' ').slice(0, 16)} UTC
        </p>
      ) : null}

      {!tonight ? (
        <>
          <Field label="Address" value={l.address} />
          <Copyable label="Phone" value={l.phone} />
          <Field label="Check-in closes" value={l.arrivalCutoff ? readCutoff(l.arrivalCutoff).label : ''} />
        </>
      ) : null}
      <Field label="After the window" value={l.laterExposure} />
      <Field label="Payment" value={l.paymentState} />
      <Field label="Manage at" value={l.bookingSource} />
      <Field label="Rail / return" value={l.railNotes} />
      {distanceKm !== null ? (
        <div style={{ marginTop: 4 }}>
          <span className="muted">From the route: </span>
          {distanceKm < 1
            ? `${Math.round(distanceKm * 1000)} m`
            : `${distanceKm.toFixed(2)} km`}{' '}
          <span className="muted">straight line, not the walk</span>
        </div>
      ) : null}
      <Field label="Notes" value={l.notes} />
    </section>
  );
}

export function LodgingScreen(): ReactNode {
  const { privateData, dataset, effectiveDate } = useAppState();

  // Ticks the countdowns without re-rendering the world. A minute is fine:
  // nothing here is decided in seconds.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  const routePoints = useMemo<Position[]>(() => {
    const out: Position[] = [];
    for (const s of dataset?.stretches ?? []) for (const p of s.positions) out.push(p);
    return out;
  }, [dataset]);

  const lodging = useMemo(() => privateData?.lodging ?? [], [privateData]);
  const views = useMemo(
    () => buildLodgingViews(lodging, now, routePoints),
    [lodging, now, routePoints],
  );
  const stakes = useMemo(() => stakesOfRouteChange(views), [views]);
  const trip = useMemo(() => splitForTrip(views, effectiveDate), [views, effectiveDate]);

  return (
    <>
      <a className="backlink" href={href('/more')}>
        ← More
      </a>

      <header className="pagehead">
        <h1>Stays</h1>
        <p className="muted">
          Private. On this device only, from the file you imported — never in the repository.
        </p>
      </header>

      {lodging.length === 0 ? (
        <section className="card">
          <h2>Nothing imported</h2>
          <p>
            This screen reads the <strong>lodging</strong> records from your private file. Import one
            in <a href={href('/settings')}>Settings</a> and they appear here, tonight’s bed first.
          </p>
          <p className="small muted">
            The hotels in the public demonstration data are invented, and this screen deliberately
            does not show them.
          </p>
        </section>
      ) : (
        <>
          {trip.tonight ? (
            <div data-testid="lodging-tonight">
              <h2 style={{ margin: '4px 0 8px' }}>{trip.tonightIsNext ? 'Next stay' : 'Tonight'}</h2>
              <Card view={trip.tonight} tonight />
            </div>
          ) : null}

          <section className="card">
            <h2>If you changed the route today</h2>
            {stakes.closingFirst.length === 0 && stakes.alreadyLocked.length === 0 ? (
              <p>
                Every free-cancellation window is more than {ROUTE_CHANGE_HORIZON_DAYS} days away.
                A change decided now costs nothing.
              </p>
            ) : (
              <>
                {stakes.closingFirst.length > 0 ? (
                  <p data-testid="closing-first">
                    <strong>
                      {stakes.closingFirst.length} window
                      {stakes.closingFirst.length === 1 ? '' : 's'} close
                      {stakes.closingFirst.length === 1 ? 's' : ''} within{' '}
                      {ROUTE_CHANGE_HORIZON_DAYS} days:
                    </strong>{' '}
                    {stakes.closingFirst.map((v) => v.lodging.name).join(', ')}. Decide these before
                    anything else.
                  </p>
                ) : null}
                {stakes.alreadyLocked.length > 0 ? (
                  <p data-testid="already-locked">
                    <strong>Already past free cancellation:</strong>{' '}
                    {stakes.alreadyLocked.map((v) => v.lodging.name).join(', ')}. Changing these
                    costs money, so they are no longer free options.
                  </p>
                ) : null}
              </>
            )}
            <p className="small muted">
              Based only on what is in your private file. A deadline you have not recorded cannot
              be counted.
            </p>
          </section>

          {trip.upcoming.length > 0 ? (
            <>
              <h2 style={{ margin: '16px 0 8px' }}>Coming up</h2>
              <ul className="list" data-testid="lodging-list" style={{ listStyle: 'none', padding: 0 }}>
                {trip.upcoming.map((v) => (
                  <li key={v.lodging.id}>
                    <Card view={v} />
                  </li>
                ))}
              </ul>
            </>
          ) : null}

          {trip.past.length > 0 ? (
            <details data-testid="lodging-past" style={{ marginTop: 12 }}>
              <summary className="muted">Already stayed ({trip.past.length})</summary>
              <ul className="list" style={{ listStyle: 'none', padding: 0 }}>
                {trip.past.map((v) => (
                  <li key={v.lodging.id}>
                    <Card view={v} />
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </>
      )}
    </>
  );
}
