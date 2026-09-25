import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useAppState } from '../state/AppState';
import { BASEMAPS, MapView } from '../components/MapView';
import { DemoBanner } from '../components/DemoBanner';
import { useGeolocation } from '../state/useGeolocation';
import { currentOrNextDay } from '../data/load';
import { formatKmMi } from '../lib/time';
import { href } from '../router';

export function MapScreen({ focusId }: { focusId: string | null }): ReactNode {
  const { dataset, effectiveDate, userPoints } = useAppState();
  const geo = useGeolocation();
  const [dayOnly, setDayOnly] = useState(false);
  const [showAnchors, setShowAnchors] = useState(true);
  const [basemapId, setBasemapId] = useState('osm');
  const [showLabels, setShowLabels] = useState(true);

  const day = dataset ? currentOrNextDay(dataset.days, effectiveDate) : null;

  const waypoints = useMemo(() => {
    if (!dataset) return [];
    if (!dayOnly || !day) return dataset.waypoints;
    return dataset.waypoints.filter((w) => w.properties.dayIds.includes(day.id));
  }, [dataset, dayOnly, day]);

  const focus = useMemo(() => {
    if (!dataset || !focusId) return null;
    const w = dataset.waypoints.find((x) => x.properties.id === focusId);
    if (w) return [w.geometry.coordinates[0], w.geometry.coordinates[1]] as [number, number];
    const a = dataset.anchors.find((x) => x.properties.id === focusId);
    if (a) return [a.geometry.coordinates[0], a.geometry.coordinates[1]] as [number, number];
    const u = userPoints.byId(focusId);
    return u ? ([u.lon, u.lat] as [number, number]) : null;
  }, [dataset, focusId, userPoints]);

  if (!dataset) return <p>Loading…</p>;

  const { routeMeta, stretches, breaks, activeLengthKm } = dataset;

  return (
    <>
      <DemoBanner inline />
      <h1>Map</h1>

      <MapView
        stretches={stretches}
        routeFeatures={dataset.routeFeatures}
        anchors={showAnchors ? dataset.anchors : []}
        showAnchors={showAnchors}
        showLabels={showLabels}
        basemapId={basemapId}
        waypoints={waypoints}
        userPoints={userPoints.points}
        position={geo.lat !== null && geo.lon !== null ? { lat: geo.lat, lon: geo.lon, accuracyM: geo.accuracyM } : null}
        focus={focus}
      />

      <div className="basemap-row" role="group" aria-label="Basemap">
        {BASEMAPS.map((b) => (
          <button
            key={b.id}
            type="button"
            className={b.id === basemapId ? 'btn btn--primary' : 'btn'}
            data-testid={`basemap-${b.id}`}
            aria-pressed={b.id === basemapId}
            onClick={() => setBasemapId(b.id)}
          >
            {b.label}
          </button>
        ))}
      </div>
      {BASEMAPS.find((b) => b.id === basemapId)?.note ? (
        <p className="small muted" style={{ marginTop: 6 }}>
          {BASEMAPS.find((b) => b.id === basemapId)!.note}
        </p>
      ) : null}

      <div className="btnrow" style={{ marginTop: 12 }}>
        {geo.status === 'watching' ? (
          <button type="button" className="btn" onClick={geo.stop}>
            Stop location
          </button>
        ) : (
          <button type="button" className="btn btn--primary" onClick={geo.start}>
            Show my location
          </button>
        )}
        <button type="button" className="btn" onClick={() => setDayOnly((v) => !v)}>
          {dayOnly ? 'All waypoints' : "Today's waypoints only"}
        </button>
        <button type="button" className="btn" onClick={() => setShowAnchors((v) => !v)}>
          {showAnchors ? 'Hide anchors' : 'Show anchors'}
        </button>
        <a className="btn" href={href('/add')} data-testid="map-add-place">
          Add a place
        </a>
        <button
          type="button"
          className="btn"
          data-testid="toggle-labels"
          onClick={() => setShowLabels((v) => !v)}
        >
          {showLabels ? 'Hide names' : 'Show names'}
        </button>
      </div>

      {geo.error ? <p className="small">{geo.error}</p> : null}

      <section className="card">
        <div className="card__label">The route</div>
        <p style={{ margin: '4px 0 10px' }}>
          <strong>{formatKmMi(activeLengthKm)}</strong> of walking across{' '}
          {stretches.length === 1 ? 'one continuous stretch' : `${stretches.length} continuous stretches`}.
        </p>
        <ul className="notes small">
          {stretches.map((s) => (
            <li key={s.id}>
              {s.title} — {formatKmMi(s.lengthKm)}
            </li>
          ))}
        </ul>
        {breaks.length > 0 ? (
          <>
            <div className="card__label" style={{ marginTop: 10 }}>
              Breaks in the route
            </div>
            <ul className="notes small" data-testid="route-breaks">
              {breaks.map((b) => (
                <li key={b.pathId}>
                  <strong>{b.title}</strong>
                  {b.note ? ` — ${b.note}` : ''}
                </li>
              ))}
            </ul>
            <p className="small muted">
              Nothing is drawn across a break. That is deliberate: a line across a gap you have not
              chosen is worse than no line.
            </p>
          </>
        ) : null}
      </section>

      <section className="card">
        <div className="card__label">Where this route came from</div>
        <p className="small">
          {routeMeta.source.represents}, from{' '}
          <a href={routeMeta.source.url} target="_blank" rel="noreferrer noopener">
            {routeMeta.source.name}
          </a>{' '}
          ({routeMeta.source.licence}), retrieved {routeMeta.source.retrieved}. Modified.
        </p>
        <p className="small muted">{routeMeta.notice}</p>
        <div className="card__label" style={{ marginTop: 10 }}>
          Known work outstanding
        </div>
        <ul className="notes small">
          {routeMeta.knownWork.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      </section>

      <section className="card">
        <div className="card__label">Also on this map</div>
        <ul className="notes small">
          <li>
            {showAnchors ? dataset.anchors.length : 0} anchors — post stations, bridges, passes and
            checkpoints, imported with the route.
          </li>
          <li>
            {waypoints.length} operational waypoints. Ten now sit on real route positions; the rest,
            including every rail station and all lodging, are still hand-placed estimates.
          </li>
          <li>
            The magenta line is the route. It is magenta because nothing in the OSM palette is,
            and the amber it used to be was the same colour as the highways it runs beside.
          </li>
          <li>
            <strong>Place names are ours, not the basemap&rsquo;s.</strong> OSM renders Japanese
            names in Japan, and every keyless basemap does the same — an English one needs an API
            key. So the romanised names come from the route&rsquo;s own anchors, which also means
            they still work with no network. Post stations label from zoom 11, everything else
            from 13.
          </li>
          <li>
            Tiles are best-effort only. With no signal the route, names and markers stay; the
            background does not. &ldquo;No basemap&rdquo; shows you that view on purpose.
          </li>
          <li>
            Your position dot is foreground geolocation. It stops when the phone locks. Use a
            dedicated tracker for the actual walked track.
          </li>
        </ul>
      </section>
    </>
  );
}
