import { useState } from 'react';
import type { ReactNode } from 'react';
import { useAppState } from '../state/AppState';
import { dayById } from '../data/load';
import { buildDayContext } from '../lib/dayContext';
import { DemoBanner } from '../components/DemoBanner';
import { Metric } from '../components/Metric';
import { AiHandoff } from '../components/AiHandoff';
import { formatClock, formatKmMi } from '../lib/time';
import { formatDuration } from '../lib/pace';
import { href } from '../router';

/**
 * The full day card, with a tired-day view first.
 *
 * The tired view is the default on purpose. Late in a long walking day the
 * thing that gets read is whatever is at the top, and the full card is a lot
 * of text to wade through to find out whether to keep going.
 */
export function DayDetail({ dayId }: { dayId: string }): ReactNode {
  const { dataset, privateData } = useAppState();
  const [full, setFull] = useState(false);

  if (!dataset) return <p>Loading…</p>;
  const day = dayById(dataset.days, dayId);
  if (!day) {
    return (
      <>
        <a className="backlink" href={href('/days')}>
          ← All days
        </a>
        <h1>Day not found</h1>
        <p className="mono">{dayId}</p>
      </>
    );
  }

  const ctx = buildDayContext(dataset, day);
  const lodging = (privateData?.lodging ?? []).filter((l) => l.dayId === day.id);
  const privateNotes = (privateData?.notes ?? []).filter((n) => n.dayId === day.id);

  const privateLines = [
    ...lodging.map((l) => `Lodging: ${l.name}${l.address ? `, ${l.address}` : ''}`),
    ...privateNotes.map((n) => `Private note: ${n.title}${n.body ? ` — ${n.body}` : ''}`),
  ];

  return (
    <>
      <a className="backlink" href={href('/days')}>
        ← All days
      </a>
      <DemoBanner inline />

      <header className="pagehead">
        <h1>{day.label}</h1>
        <p className="muted">
          {day.date} · {day.kind}
          {day.walkingDayNumber ? ` · walking day ${day.walkingDayNumber}` : ''} ·{' '}
          {day.provisional ? 'provisional' : 'confirmed'}
        </p>
      </header>

      <section className="card card--warn">
        <div className="card__label">Tired-day view</div>
        <p style={{ fontSize: '1.05rem', margin: 0 }}>{day.tiredDaySummary}</p>
        <div className="metrics" style={{ marginTop: 12 }}>
          <Metric label="Route" value={formatKmMi(day.nominalDistanceKm)} />
          <Metric label="Sunset" value={formatClock(ctx.sunset)} />
          <Metric label="Rail" value={day.railRedundancy ?? '—'} />
        </div>
        <div className="btnrow" style={{ marginTop: 12 }}>
          <a className="btn btn--primary" href={href('/decide')}>
            Decision calculator
          </a>
          <button type="button" className="btn" onClick={() => setFull((v) => !v)} data-testid="toggle-full-card">
            {full ? 'Hide the rest' : 'Show the full card'}
          </button>
        </div>
      </section>

      {!full ? null : (
        <>
          <section className="card">
            <h2>Plan</h2>
            <p>{day.plan}</p>
            <table className="kv">
              <tbody>
                <tr>
                  <th>From / to</th>
                  <td>
                    {day.from ?? '—'} → {day.to ?? '—'}
                  </td>
                </tr>
                <tr>
                  <th>Nominal route distance</th>
                  <td>{formatKmMi(day.nominalDistanceKm)} (provisional)</td>
                </tr>
                <tr>
                  <th>Likely door-to-door</th>
                  <td>{formatKmMi(day.likelyDoorToDoorKm)} (estimate)</td>
                </tr>
                <tr>
                  <th>Terrain</th>
                  <td>{day.terrain ?? '—'}</td>
                </tr>
                <tr>
                  <th>Elevation warning</th>
                  <td>{day.elevationWarning ?? '—'}</td>
                </tr>
                <tr>
                  <th>Start-light guidance</th>
                  <td>{day.startLightGuidance ?? '—'}</td>
                </tr>
                <tr>
                  <th>Daylight</th>
                  <td>
                    {formatClock(ctx.sunrise)} – {formatClock(ctx.sunset)} (
                    {formatDuration(ctx.dayLengthMinutes)}); astronomical, ignores terrain
                  </td>
                </tr>
                <tr>
                  <th>Rail redundancy</th>
                  <td>{day.railRedundancy ?? '—'}</td>
                </tr>
                <tr>
                  <th>Sleep base</th>
                  <td>
                    {day.sleepBase ?? '—'}
                    {day.sleepBaseNote ? <div className="small muted">{day.sleepBaseNote}</div> : null}
                  </td>
                </tr>
                <tr>
                  <th>Source</th>
                  <td className="small">{day.source}</td>
                </tr>
              </tbody>
            </table>
          </section>

          {day.safetyNotes.length > 0 ? (
            <section className="card card--stop">
              <h2>Safety</h2>
              <ul className="notes">
                {day.safetyNotes.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            </section>
          ) : null}

          {day.weatherSensitive.length > 0 ? (
            <section className="card card--warn">
              <h2>Weather-sensitive sections</h2>
              <ul className="notes">
                {day.weatherSensitive.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            </section>
          ) : null}

          {ctx.bailouts.length > 0 ? (
            <section className="card">
              <h2>Bailouts</h2>
              <ul className="list">
                {ctx.bailouts.map((b) => (
                  <li key={b.properties.id}>
                    <a className="list__item" href={href(`/place/${b.properties.id}`)}>
                      <h3>{b.properties.title}</h3>
                      <div className="list__meta">
                        {b.properties.type} · {b.properties.confidence}
                      </div>
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {ctx.hazards.length > 0 ? (
            <section className="card">
              <h2>Hazards and category-change sites</h2>
              <ul className="list">
                {ctx.hazards.map((b) => (
                  <li key={b.properties.id}>
                    <a className="list__item" href={href(`/place/${b.properties.id}`)}>
                      <h3>{b.properties.title}</h3>
                      <div className="list__meta">{b.properties.type}</div>
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {ctx.stations.length > 0 ? (
            <section className="card">
              <h2>Traditional stations on this stage</h2>
              <ul className="notes small">
                {ctx.stations.map((s) => (
                  <li key={s.id}>
                    {s.name}
                    {s.number !== null ? ` (#${s.number})` : ''} — {s.modern}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {day.editorialPrompts.length > 0 ? (
            <section className="card">
              <h2>Prompts</h2>
              <p className="small muted">
                Things to look at, not conclusions to reach. Ignore any that are not interesting on
                the day.
              </p>
              <ul className="notes">
                {day.editorialPrompts.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            </section>
          ) : null}

          {day.hiroshigeRefIds.length > 0 ? (
            <section className="card">
              <h2>Hiroshige references</h2>
              <p className="small muted">
                Metadata only. No images are bundled and none may be displayed until rights are
                verified for that specific reproduction.
              </p>
              <ul className="notes small">
                {day.hiroshigeRefIds.map((id) => {
                  const h = dataset.hiroshige.find((x) => x.id === id);
                  if (!h) return <li key={id}>{id} (not found)</li>;
                  return (
                    <li key={id}>
                      {h.title} — rights: {h.rightsStatus}; viewpoint confidence:{' '}
                      {h.viewpointConfidence}
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}

          {day.verificationTasks.length > 0 ? (
            <section className="card">
              <h2>Still to verify</h2>
              <ul className="notes">
                {day.verificationTasks.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            </section>
          ) : null}

          {privateLines.length > 0 ? (
            <section className="card">
              <h2>Private data for this day</h2>
              <p className="small muted">
                From your imported private file. Stored only on this device.
              </p>
              <ul className="notes small">
                {privateLines.map((l) => (
                  <li key={l}>{l}</li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      )}

      <AiHandoff
        base={{
          day,
          waypoint: null,
          stations: ctx.stations,
          position: null,
          completedKm: null,
          paceKmh: null,
          sunset: ctx.sunset,
        }}
        privateLines={privateLines}
      />
    </>
  );
}
