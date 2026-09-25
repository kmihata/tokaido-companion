import type { ReactNode } from 'react';
import { useAppState } from '../state/AppState';
import { waypointById, waypointPosition, dayById } from '../data/load';
import { href, navigate } from '../router';
import { typeSpec, usableAsDayEnd } from '../lib/userPoints';
import { formatKmMi } from '../lib/time';
import { DemoBanner } from '../components/DemoBanner';
import { AiHandoff } from '../components/AiHandoff';
import { buildDayContext } from '../lib/dayContext';

export function PlaceDetail({ placeId }: { placeId: string }): ReactNode {
  const { dataset, userPoints } = useAppState();
  if (!dataset) return <p>Loading…</p>;

  const mine = userPoints.byId(placeId);
  if (mine) return <UserPlaceDetail id={placeId} />;

  const w = waypointById(dataset.waypoints, placeId);
  if (!w) {
    return (
      <>
        <a className="backlink" href={href('/places')}>
          ← Places
        </a>
        <h1>Place not found</h1>
        <p className="mono">{placeId}</p>
      </>
    );
  }

  const p = w.properties;
  const [lon, lat] = waypointPosition(w);
  const firstDayId = p.dayIds[0];
  const day = firstDayId ? dayById(dataset.days, firstDayId) : null;
  const ctx = day ? buildDayContext(dataset, day) : null;

  return (
    <>
      <a className="backlink" href={href('/places')}>
        ← Places
      </a>
      <DemoBanner inline />

      <header className="pagehead">
        <h1>{p.title}</h1>
        <p className="muted">{p.type}</p>
      </header>

      <section className="card">
        <h2>Provenance</h2>
        <table className="kv">
          <tbody>
            <tr>
              <th>Coordinates</th>
              <td className="mono">
                {lat.toFixed(5)}, {lon.toFixed(5)}
                <div className="small muted">Approximate placemark. Not surveyed.</div>
              </td>
            </tr>
            <tr>
              <th>Confidence</th>
              <td>{p.confidence}</td>
            </tr>
            <tr>
              <th>Verification</th>
              <td>{p.verification}</td>
            </tr>
            <tr>
              <th>Source</th>
              <td className="small">{p.source}</td>
            </tr>
            <tr>
              <th>Last checked</th>
              <td>{p.lastChecked ?? 'never'}</td>
            </tr>
            <tr>
              <th>Classification</th>
              <td>{p.classification}</td>
            </tr>
          </tbody>
        </table>
      </section>

      {p.safetyNotes ? (
        <section className="card card--stop">
          <h2>Safety</h2>
          <p>{p.safetyNotes}</p>
        </section>
      ) : null}

      {p.operationalNotes ? (
        <section className="card">
          <h2>Operational</h2>
          <p>{p.operationalNotes}</p>
        </section>
      ) : null}

      {p.historicalNotes ? (
        <section className="card">
          <h2>Historical</h2>
          <p>{p.historicalNotes}</p>
        </section>
      ) : null}

      {p.links.length > 0 ? (
        <section className="card">
          <h2>Links</h2>
          <p className="small muted">These need a network. Nothing else on this screen does.</p>
          <ul className="notes small">
            {p.links.map((l) => (
              <li key={l.url}>
                <a href={l.url} target="_blank" rel="noreferrer noopener">
                  {l.label} ↗
                </a>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="btnrow">
        <a className="btn" href={href(`/map/${p.id}`)}>
          Show on map
        </a>
        {day ? (
          <a className="btn" href={href(`/day/${day.id}`)}>
            {day.label}
          </a>
        ) : null}
        <a className="btn" href={href('/capture')}>
          Capture a note here
        </a>
      </div>

      <AiHandoff
        base={{
          day,
          waypoint: { ...p, lat, lon },
          stations: ctx?.stations ?? [],
          position: null,
          completedKm: null,
          paceKmh: null,
          sunset: ctx?.sunset ?? null,
        }}
      />
    </>
  );
}

/** A place Kevin added himself: editable, deletable, and possibly private. */
function UserPlaceDetail({ id }: { id: string }): ReactNode {
  const { dataset, userPoints, plan } = useAppState();
  const p = userPoints.byId(id);
  if (!dataset || !p) return null;

  const usable = usableAsDayEnd(p);

  return (
    <>
      <a className="backlink" href={href('/places')}>
        ← Places
      </a>

      <header className="pagehead">
        <h1>{p.title}</h1>
        <p className="muted">
          {typeSpec(p.type).label} · yours
          {p.classification === 'private' ? ' · private' : ''}
        </p>
      </header>

      {p.classification === 'private' ? (
        <div className="card card--warn" data-testid="private-notice">
          <div className="card__label">Private</div>
          <p className="small" style={{ margin: 0 }}>
            This stays on this device. It is never written to the repository and never appears in
            an export or an AI context packet. Export your places before clearing site data — see
            Settings.
          </p>
        </div>
      ) : null}

      {p.notes ? (
        <section className="card">
          <h2>Notes</h2>
          <p>{p.notes}</p>
        </section>
      ) : null}

      <section className="card">
        <h2>Position</h2>
        <table className="kv">
          <tbody>
            <tr>
              <th>Coordinates</th>
              <td className="mono">
                {p.lat.toFixed(5)}, {p.lon.toFixed(5)}
              </td>
            </tr>
            <tr>
              <th>On the route</th>
              <td>
                {p.onRoute
                  ? `${p.onRoute.alongKm.toFixed(1)} km along${p.onRoute.offRouteKm > 0.001 ? `, ${formatKmMi(p.onRoute.offRouteKm)} off it` : ', exactly on the line'}`
                  : 'not near the route'}
              </td>
            </tr>
            <tr>
              <th>Usable as a day finish</th>
              <td data-testid="usable-as-day-end">
                {usable ? 'yes' : 'no — it is not on the line'}
              </td>
            </tr>
            <tr>
              <th>Added</th>
              <td>{p.createdAt.slice(0, 16).replace('T', ' ')}</td>
            </tr>
            <tr>
              <th>Verification</th>
              <td>{p.verification}</td>
            </tr>
          </tbody>
        </table>
      </section>

      {usable ? (
        <section className="card">
          <h2>Use as a day finish</h2>
          <p className="small muted">
            Pick the day this should end at. Both affected days are recalculated.
          </p>
          <div className="field">
            <label htmlFor="use-as-end">Finish this day here</label>
            <select
              id="use-as-end"
              data-testid="use-as-day-end"
              defaultValue=""
              onChange={(e) => {
                const dayId = e.target.value;
                if (!dayId || !p.onRoute) return;
                void plan.moveEnd(dayId, p.onRoute.alongKm, p.id);
              }}
            >
              <option value="">Choose a day…</option>
              {plan.legs.slice(0, -1).map((l) => (
                <option key={l.plan.dayId} value={l.plan.dayId}>
                  Day {l.plan.walkingDayNumber} — currently {l.distanceKm.toFixed(1)} km
                </option>
              ))}
            </select>
          </div>
        </section>
      ) : null}

      <div className="btnrow">
        <a className="btn" href={href(`/map/${p.id}`)}>
          Show on map
        </a>
        <a className="btn" href={href(`/add/${p.id}`)} data-testid="edit-place">
          Edit
        </a>
        <button
          type="button"
          className="btn btn--danger"
          data-testid="delete-place"
          onClick={() => {
            if (!window.confirm(`Delete "${p.title}"?`)) return;
            void userPoints.remove(p.id).then(() => navigate('/places'));
          }}
        >
          Delete
        </button>
      </div>
    </>
  );
}
