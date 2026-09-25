import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useAppState } from '../state/AppState';
import { MapView } from '../components/MapView';
import { Metric } from '../components/Metric';
import { useGeolocation } from '../state/useGeolocation';
import { projectOntoRoute } from '../lib/dayContext';
import {
  USER_POINT_TYPES,
  makeUserPoint,
  parseCoordinates,
  typeSpec,
  validateUserPoint,
} from '../lib/userPoints';
import type { UserPointType } from '../lib/userPoints';
import { formatKmMi } from '../lib/time';
import { href, navigate } from '../router';
import type { Position } from '../lib/geo';

/**
 * Add a place.
 *
 * Placement is a fixed crosshair with the map moving under it, not a tap on a
 * target. That is the one-handed pattern: a stray pan cannot misfire it, and
 * the point being chosen is never under a thumb. "Use my location" and a
 * coordinate field cover the other two ways a place gets known.
 */
export function AddPlaceScreen({ editId }: { editId: string | null }): ReactNode {
  const { dataset, userPoints } = useAppState();
  const geo = useGeolocation();

  const existing = editId ? userPoints.byId(editId) : null;

  const [centre, setCentre] = useState<{ lat: number; lon: number } | null>(null);
  const [type, setType] = useState<UserPointType>(existing?.type ?? 'day-end');
  const [title, setTitle] = useState(existing?.title ?? '');
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [onLine, setOnLine] = useState((existing?.role ?? 'anchor') === 'anchor');
  const [isPrivate, setIsPrivate] = useState(existing?.classification === 'private');
  const [coordText, setCoordText] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const [touchedPrivacy, setTouchedPrivacy] = useState(Boolean(existing));

  // Changing the type moves the privacy default, until Kevin sets it himself.
  useEffect(() => {
    if (!touchedPrivacy) setIsPrivate(typeSpec(type).privateByDefault);
  }, [type, touchedPrivacy]);

  const focus = useMemo<Position | null>(
    () => (existing ? [existing.lon, existing.lat] : null),
    [existing],
  );

  const projection = useMemo(() => {
    if (!dataset || !centre) return null;
    return projectOntoRoute(dataset.stretches, [centre.lon, centre.lat] as Position);
  }, [dataset, centre]);

  if (!dataset) return <p>Loading…</p>;

  const spec = typeSpec(type);
  const role = onLine ? 'anchor' : 'waypoint';
  const tooFarToSnap = onLine && projection !== null && projection.offRouteKm > 1;

  const save = (): void => {
    if (!centre) {
      setErrors(['Move the map so the crosshair is where you want the point, or use your location.']);
      return;
    }
    const input = {
      role: role as 'anchor' | 'waypoint',
      type,
      title,
      notes,
      lat: centre.lat,
      lon: centre.lon,
      classification: (isPrivate ? 'private' : 'public') as 'private' | 'public',
      ...(existing ? { id: existing.id, createdAt: existing.createdAt } : {}),
    };
    const v = validateUserPoint(input);
    if (!v.ok) {
      setErrors(v.errors);
      return;
    }
    const point = makeUserPoint(input, dataset.stretches);
    void userPoints.save(point).then(() => navigate(`/place/${point.id}`));
  };

  return (
    <>
      <a className="backlink" href={href('/places')}>
        ← Places
      </a>
      <h1>{existing ? 'Edit place' : 'Add a place'}</h1>

      <p className="muted small">
        Move the map so the crosshair sits where you want it. The map moves, the crosshair does
        not — so a stray pan cannot drop a point by accident.
      </p>

      <MapView
        stretches={dataset.stretches}
        routeFeatures={dataset.routeFeatures}
        anchors={dataset.anchors}
        waypoints={dataset.waypoints}
        userPoints={userPoints.points}
        position={geo.lat !== null && geo.lon !== null ? { lat: geo.lat, lon: geo.lon, accuracyM: geo.accuracyM } : null}
        focus={focus}
        crosshair
        onCenterChange={(lat, lon) => setCentre({ lat, lon })}
      />

      <div className="metrics" style={{ marginTop: 12 }}>
        <Metric
          label="Under the crosshair"
          value={centre ? `${centre.lat.toFixed(5)}, ${centre.lon.toFixed(5)}` : '—'}
          testId="crosshair-coords"
        />
        <Metric
          label="Off the route"
          value={projection ? formatKmMi(projection.offRouteKm) : '—'}
          note={projection ? `${projection.alongKm.toFixed(1)} km along it` : undefined}
          testId="crosshair-offroute"
        />
      </div>

      <div className="btnrow" style={{ marginTop: 12 }}>
        <button
          type="button"
          className="btn"
          data-testid="use-my-location"
          onClick={() => {
            if (geo.lat === null) {
              geo.start();
              return;
            }
            setCentre({ lat: geo.lat, lon: geo.lon! });
          }}
        >
          {geo.lat === null ? 'Use my location' : 'Snap crosshair to me'}
        </button>
      </div>
      {geo.error ? <p className="small">{geo.error}</p> : null}

      <section className="card">
        <div className="field">
          <label htmlFor="ap-type">What is it</label>
          <select
            id="ap-type"
            data-testid="place-type"
            value={type}
            onChange={(e) => {
              const t = e.target.value as UserPointType;
              setType(t);
              setOnLine(typeSpec(t).role === 'anchor');
            }}
          >
            {USER_POINT_TYPES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor="ap-title">Name</label>
          <input
            id="ap-title"
            type="text"
            data-testid="place-title"
            value={title}
            placeholder={spec.role === 'anchor' ? 'Stop before the pass' : 'Business hotel, Kakegawa'}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>

        <div className="field">
          <label htmlFor="ap-notes">Notes</label>
          <textarea
            id="ap-notes"
            value={notes}
            placeholder="Anything you will want to know standing here."
            onChange={(e) => setNotes(e.target.value)}
            style={{ minHeight: 80 }}
          />
        </div>

        <div className="checkline">
          <input
            id="ap-online"
            type="checkbox"
            data-testid="place-online"
            checked={onLine}
            onChange={(e) => setOnLine(e.target.checked)}
          />
          <label htmlFor="ap-online">
            Put this exactly on the route. Needed to use it as a day finish — the point is moved
            onto the line, so it cannot quietly add distance to two days.
          </label>
        </div>

        {tooFarToSnap ? (
          <p className="small">
            <strong>This is {projection!.offRouteKm.toFixed(1)} km from the route.</strong> Saving it
            on the line would move it a long way from where you put it. Untick the box above, or move
            the crosshair closer.
          </p>
        ) : null}

        <div className="checkline">
          <input
            id="ap-private"
            type="checkbox"
            data-testid="place-private"
            checked={isPrivate}
            onChange={(e) => {
              setIsPrivate(e.target.checked);
              setTouchedPrivacy(true);
            }}
          />
          <label htmlFor="ap-private">
            Private — stays on this device, never exported, never in the repository.
            {spec.privateByDefault ? ' Lodging is private by default.' : ''}
          </label>
        </div>

        <details>
          <summary style={{ minHeight: 44, display: 'flex', alignItems: 'center', fontWeight: 600 }}>
            Or paste coordinates
          </summary>
          <div className="field" style={{ marginTop: 10 }}>
            <label htmlFor="ap-coords">Latitude, longitude</label>
            <input
              id="ap-coords"
              type="text"
              data-testid="place-coords"
              value={coordText}
              placeholder="35.25600, 139.15500"
              onChange={(e) => setCoordText(e.target.value)}
            />
            <button
              type="button"
              className="btn"
              style={{ marginTop: 8 }}
              onClick={() => {
                const c = parseCoordinates(coordText);
                if (!c) {
                  setErrors(['Could not read those coordinates. Try "35.25600, 139.15500".']);
                  return;
                }
                setErrors([]);
                setCentre(c);
              }}
            >
              Move crosshair there
            </button>
          </div>
        </details>

        {errors.length > 0 ? (
          <div className="card card--stop" data-testid="place-errors">
            <ul className="notes small">
              {errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <button
          type="button"
          className="btn btn--primary btn--wide"
          data-testid="place-save"
          onClick={save}
        >
          {existing ? 'Save changes' : 'Add this place'}
        </button>
      </section>
    </>
  );
}
