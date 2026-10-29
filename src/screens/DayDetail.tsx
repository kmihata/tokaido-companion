import { useState } from 'react';
import type { ReactNode } from 'react';
import { useAppState } from '../state/AppState';
import { dayById } from '../data/load';
import { buildDayContext } from '../lib/dayContext';
import { hiroshigeForStations, stationsForDay } from '../lib/stationsForDay';
import { DemoBanner } from '../components/DemoBanner';
import { Metric } from '../components/Metric';
import { AiHandoff } from '../components/AiHandoff';
import { formatClock, formatKmMi } from '../lib/time';
import { formatDuration } from '../lib/pace';
import { href } from '../router';
import { assetUrl } from '../lib/base';
import { readCutoff } from '../lib/leaveBy';
import { useDayLocation } from '../state/useDayLocation';
import { measureWhereAmI } from '../lib/whereAmI';
import type { PacketInput } from '../lib/contextPacket';

/**
 * The full day card, with a tired-day view first.
 *
 * The tired view is the default on purpose. Late in a long walking day the
 * thing that gets read is whatever is at the top, and the full card is a lot
 * of text to wade through to find out whether to keep going.
 */
export function DayDetail({ dayId }: { dayId: string }): ReactNode {
  const { dataset, privateData, plan, effectiveDate } = useAppState();
  const [full, setFull] = useState(false);
  // Location for the AI packet, only on today's card: a fix means nothing on
  // another day's card.
  const isToday = (dataset ? dayById(dataset.days, dayId)?.date : null) === effectiveDate;
  const loc = useDayLocation(isToday ? dayId : null);

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
  // One list, measured on the planning line, for both the station section and
  // the prints — see lib/stationsForDay.ts for the two rulers that disagreed.
  const leg = plan.legs.find((l) => l.plan.dayId === day.id) ?? null;
  const stationsToday = stationsForDay(dataset, day, leg, plan.line);
  const prints = hiroshigeForStations(dataset, stationsToday, day);
  const lodging = (privateData?.lodging ?? []).filter((l) => l.dayId === day.id);
  const privateNotes = (privateData?.notes ?? []).filter((n) => n.dayId === day.id);

  // Transport reached NO screen before 2026-10-11: it was in the private file
  // and counted in Settings, and that was all. So the pocket-WiFi order number
  // Kevin has to show at the counter, and the train he is aiming for, lived in
  // a file the app never displayed.
  const transport = (privateData?.transport ?? []).filter((x) => x.dayId === day.id);

  const lodgingLines = lodging.map(
    (l) =>
      `Lodging: ${l.name}${l.address ? `, ${l.address}` : ''}` +
      (l.arrivalCutoff ? ` — check-in closes ${readCutoff(l.arrivalCutoff).label}` : '') +
      (l.phone ? ` — ${l.phone}` : ''),
  );
  const hasPrivate = lodgingLines.length + transport.length + privateNotes.length > 0;

  // Flattened for the AI packet, which is one block of text and cannot carry
  // structure. Still off by default on every screen that offers it.
  const privateLines = [
    ...lodgingLines,
    ...transport.map((x) => `Transport: ${x.description}${x.notes ? ` — ${x.notes}` : ''}`),
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

          {stationsToday.length > 0 ? (
            <section className="card">
              <h2>Traditional stations on this stage</h2>
              <ul className="notes small">
                {stationsToday.map((s) => (
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

          {prints.length > 0 ? (
            <section className="card">
              <h2>Hiroshige</h2>
              <p className="small muted">
                Public-domain scans via Wikimedia Commons, bundled for offline use. Where the artist
                stood is <em>not</em> established — the prints are compressed and dramatised, and no
                viewpoint here has been located on the ground.
              </p>
              {prints.map((id) => {
                const h = dataset.hiroshige.find((x) => x.id === id);
                if (!h) return <p key={id} className="small">{id} (not found)</p>;
                return (
                  <figure key={id} style={{ margin: '12px 0 0' }} data-testid="hiroshige-figure">
                    {h.imagePath ? (
                      <img
                        src={assetUrl(h.imagePath)}
                        alt={`Hiroshige, plate ${h.number}: ${h.title}`}
                        loading="lazy"
                        style={{ width: '100%', height: 'auto', borderRadius: 6, display: 'block' }}
                      />
                    ) : null}
                    <figcaption className="small muted" style={{ marginTop: 6 }}>
                      Plate {h.number} of 55 — {h.title}. {h.series}.{' '}
                      {h.viewpointConfidence === 'unknown'
                        ? 'Viewpoint not located.'
                        : `Viewpoint ${h.viewpointConfidence}.`}
                    </figcaption>
                  </figure>
                );
              })}
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

          {hasPrivate ? (
            <section className="card">
              <h2>Private data for this day</h2>
              <p className="small muted">
                From your imported private file. Stored only on this device.
              </p>
              <ul className="notes small">
                {lodgingLines.map((l) => (
                  <li key={l}>{l}</li>
                ))}
                {transport.map((x) => (
                  <li key={x.id}>
                    <strong>{x.description}</strong>
                    {x.notes ? <div className="body">{x.notes}</div> : null}
                  </li>
                ))}
                {privateNotes.map((n) => (
                  <li key={n.id}>
                    <strong>{n.title}</strong>
                    {n.body ? <div className="body">{n.body}</div> : null}
                  </li>
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
          // The same list the card shows, so the packet cannot disagree with it.
          stations: stationsToday,
          position: loc.fix ? { lat: loc.fix.lat, lon: loc.fix.lon, accuracyM: loc.fix.accuracyM } : null,
          positionAt: loc.fix ? new Date(loc.fix.at) : null,
          progress: progressFor(plan.line, leg, loc.fix),
          completedKm: null,
          paceKmh: null,
          sunset: ctx.sunset,
        }}
        privateLines={privateLines}
        onQuestionFocus={isToday ? loc.refresh : undefined}
        locationNote={
          !isToday
            ? 'No location in the packet: this is not today’s card.'
            : loc.locating
              ? 'Finding your location for the AI…'
              : loc.fix
                ? `Location for the AI: fix at ${formatClock(new Date(loc.fix.at))}${loc.fix.accuracyM != null ? `, ±${Math.round(loc.fix.accuracyM)} m` : ''}${loc.fix.pretend ? ' (pretend position)' : ''}.`
                : loc.error
                  ? `No location: ${loc.error}`
                  : 'Start typing and Samwise will add your location.'
        }
      />
    </>
  );
}

function progressFor(
  line: Parameters<typeof measureWhereAmI>[0] | null,
  leg: { startAlongKm: number; endAlongKm: number; distanceKm: number } | null,
  fix: { lat: number; lon: number } | null,
): PacketInput['progress'] {
  if (!line || !leg || !fix) return null;
  const r = measureWhereAmI(line, leg, [fix.lon, fix.lat]);
  if (!r) return null;
  return {
    kmIn: r.walkedKm,
    kmLeft: r.left.remainingKm,
    dayKm: leg.distanceKm,
    offRouteKm: r.position.offRouteKm,
    status: r.position.status,
  };
}
