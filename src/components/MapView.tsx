import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { AnchorFeature, PointFeature, RouteFeature } from '../data/schemas';
import type { RouteStretch } from '../data/load';
import type { Position } from '../lib/geo';
import { href } from '../router';

/**
 * Leaflet map.
 *
 * WHY LEAFLET rather than a vector-tile renderer: its offline failure mode is
 * the one wanted here. When the tiles cannot load, the base layer simply does
 * not paint and the route, anchors, waypoints and current-position dot stay on
 * screen against a plain background. That degraded view is most of the value.
 *
 * All markers are circleMarkers, i.e. vectors. Leaflet's default pin needs
 * image files from inside the package, which bundlers routinely break and
 * which would be one more thing to get into the offline precache.
 *
 * TILES ARE NOT PART OF THE OFFLINE GUARANTEE. They are runtime-cached
 * best-effort only. See OFFLINE-AND-RECOVERY.md.
 *
 * The route is drawn as SEPARATE STRETCHES with nothing between them. Where a
 * gap is unresolved, the map shows a gap. It never draws a line across water
 * it has not been told about — which is precisely the mistake Footpath makes
 * on import, and the reason exports emit one track per stretch.
 */

const TYPE_COLOUR: Record<string, string> = {
  'rail-bailout': '#7fb8d8',
  hazard: '#ef7a6a',
  water: '#6fbf73',
  food: '#6fbf73',
  resupply: '#6fbf73',
  research: '#c79ae0',
  'hiroshige-viewpoint': '#c79ae0',
  hotel: '#e8b84b',
  'river-crossing': '#7fb8d8',
  'ferry-gap': '#7fb8d8',
  'category-change': '#c79ae0',
  'day-start': '#f4f0e8',
  'day-end': '#f4f0e8',
};

/**
 * Orienteering magenta. The amber this used to be collided with OSM's own
 * highway casings, which is exactly the road the route runs alongside for
 * hundreds of kilometres. Magenta appears nowhere in the OSM palette, and it is
 * the colour Kevin already reads as "this is the course".
 *
 * The casing underneath is the standard cartographic trick: a wider pale line
 * below the coloured one, so the route survives a dark forest tile and a pale
 * urban one without changing colour.
 */
const ROUTE_COLOUR = '#e5007d';
const ROUTE_CASING = '#ffffff';
const VARIANT_COLOUR = '#e5007d';

/** Post-station labels appear from this zoom; everything else two levels in. */
const LABEL_ZOOM = 11;
const LABEL_ZOOM_ALL = 13;

export interface BasemapSpec {
  id: string;
  label: string;
  url: string | null;
  attribution: string;
  maxZoom: number;
  note?: string;
}

/**
 * Keyless raster basemaps only. Everything with English labels for Japan needs
 * an API key, which would mean an account and a secret in the build — see
 * PRIVACY-AND-THREAT-MODEL.md. English comes from our own anchors instead,
 * drawn on top, which also means it survives with no network.
 */
export const BASEMAPS: BasemapSpec[] = [
  {
    id: 'osm',
    label: 'Standard',
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '\u00a9 OpenStreetMap contributors',
    maxZoom: 18,
  },
  {
    id: 'topo',
    label: 'Terrain',
    url: 'https://a.tile.opentopomap.org/{z}/{x}/{y}.png',
    attribution: '\u00a9 OpenTopoMap (CC-BY-SA), \u00a9 OpenStreetMap contributors',
    maxZoom: 17,
    note: 'Contours and relief. Worth it for Hakone and Suzuka, slower to load.',
  },
  {
    id: 'none',
    label: 'No basemap',
    url: null,
    attribution: '',
    maxZoom: 18,
    note: 'What you get with no signal. Route, anchors and waypoints only.',
  },
];

export interface MapViewProps {
  stretches: readonly RouteStretch[];
  /** All route features, so inactive variants can be shown for comparison. */
  routeFeatures?: readonly RouteFeature[];
  anchors?: readonly AnchorFeature[];
  waypoints: readonly PointFeature[];
  position: { lat: number; lon: number; accuracyM: number | null } | null;
  focus?: Position | null;
  showAnchors?: boolean;
  showInactiveVariants?: boolean;
  basemapId?: string;
  /** Draw romanised anchor names on the map, not only in popups. */
  showLabels?: boolean;
  /** Extra points to draw — Kevin's own, on top of the shipped ones. */
  userPoints?: readonly { id: string; lat: number; lon: number; title: string; type: string; classification: string }[];
  /**
   * Fixed crosshair at the centre, reporting the coordinate under it.
   *
   * The map moves under a stationary crosshair rather than the user tapping a
   * target. That is the standard solution for precise placement with a thumb:
   * it cannot be triggered by a stray pan, it works one-handed, and the point
   * being chosen is never hidden under a finger.
   */
  crosshair?: boolean;
  onCenterChange?: (lat: number, lon: number) => void;
}

export function MapView({
  stretches,
  routeFeatures = [],
  anchors = [],
  waypoints,
  position,
  focus = null,
  showAnchors = true,
  showInactiveVariants = true,
  basemapId = 'osm',
  showLabels = true,
  userPoints = [],
  crosshair = false,
  onCenterChange,
}: MapViewProps): ReactNode {
  const container = useRef<HTMLDivElement | null>(null);
  const map = useRef<L.Map | null>(null);
  const markerLayer = useRef<L.LayerGroup | null>(null);
  const routeLayer = useRef<L.LayerGroup | null>(null);
  const posLayer = useRef<L.LayerGroup | null>(null);
  const tileLayer = useRef<L.TileLayer | null>(null);
  // Held in a ref so the map is created once and the callback can still change.
  const centreRef = useRef<((lat: number, lon: number) => void) | undefined>(undefined);
  centreRef.current = onCenterChange;
  const [tilesFailed, setTilesFailed] = useState(false);
  // Marker size is driven by zoom. At the whole-route zoom, full-size markers
  // merge into one blob that hides the route line entirely.
  const [zoom, setZoom] = useState(7);
  // Bumped on pan so label collision is recomputed for the new view.
  const [viewTick, setViewTick] = useState(0);

  useEffect(() => {
    if (!container.current || map.current) return;
    const m = L.map(container.current, { zoomControl: true, attributionControl: true, preferCanvas: true });
    m.setView([35.0, 137.5], 7);

    // Order matters: the canvas renderer paints in add order, and the route
    // has to stay legible when markers bunch up at low zoom.
    markerLayer.current = L.layerGroup().addTo(m);
    routeLayer.current = L.layerGroup().addTo(m);
    posLayer.current = L.layerGroup().addTo(m);
    m.on('zoomend', () => setZoom(m.getZoom()));
    m.on('moveend', () => setViewTick((t) => t + 1));
    m.on('move', () => {
      const c = m.getCenter();
      centreRef.current?.(c.lat, c.lng);
    });
    setZoom(m.getZoom());
    map.current = m;

    return () => {
      m.remove();
      map.current = null;
      markerLayer.current = null;
      routeLayer.current = null;
      posLayer.current = null;
      tileLayer.current = null;
    };
  }, []);

  // Basemap, swappable. A null url means draw nothing, which is what no signal
  // looks like and is worth being able to see deliberately.
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    if (tileLayer.current) {
      m.removeLayer(tileLayer.current);
      tileLayer.current = null;
    }
    const spec = BASEMAPS.find((b) => b.id === basemapId) ?? BASEMAPS[0]!;
    setTilesFailed(false);
    if (!spec.url) return;
    const tiles = L.tileLayer(spec.url, {
      maxZoom: spec.maxZoom,
      // Request tiles with CORS so the service worker can see the real status.
      //
      // Without this, Leaflet loads tiles as ordinary <img> elements, the
      // responses are opaque, and every one of them reports status 0 — a
      // blocked tile and a real tile are indistinguishable. In September 2026
      // OpenStreetMap served its "Access blocked" image with a 403 and the
      // service worker cached it like any other tile, for thirty days. The map
      // stayed broken long after the block had lifted, and no refresh could
      // fix it, because CacheFirst was serving the failure from disk.
      //
      // Both tile servers send `access-control-allow-origin: *`, so this costs
      // nothing and makes a failure visible as a failure.
      crossOrigin: 'anonymous',
      attribution: spec.attribution + ' \u00b7 route \u00a9 \u65e7\u8857\u9053\u8db3\u8de1\u30de\u30c3\u30d7 CC BY-SA 4.0',
    });
    tiles.on('tileerror', () => setTilesFailed(true));
    tiles.on('tileload', () => setTilesFailed(false));
    tiles.addTo(m);
    tileLayer.current = tiles;
  }, [basemapId]);

  useEffect(() => {
    const m = map.current;
    const markers = markerLayer.current;
    const route = routeLayer.current;
    if (!m || !markers || !route) return;
    markers.clearLayers();
    route.clearLayers();

    const scale = zoom <= 8 ? 0.42 : zoom <= 10 ? 0.7 : 1;
    const r = (base: number): number => Math.max(2, Math.round(base * scale));

    if (showAnchors && scale > 0.5) {
      // Leaflet has no label collision handling, so do it here: walk the
      // anchors with post stations first, and drop any label that would land on
      // top of one already placed. Three anchors within a few hundred metres on
      // the Hakone climb is normal, and unreadable if they all shout at once.
      const placed: { x: number; y: number }[] = [];
      const LABEL_W = 96;
      const LABEL_H = 16;
      const fits = (pt: { x: number; y: number }): boolean =>
        !placed.some((q) => Math.abs(q.x - pt.x) < LABEL_W && Math.abs(q.y - pt.y) < LABEL_H);

      const ordered = [...anchors].sort(
        (x, y) => Number(y.properties.stationNumber !== null) - Number(x.properties.stationNumber !== null),
      );

      for (const a of ordered) {
        const p = a.properties;
        const isStation = p.stationNumber !== null;
        const marker = L.circleMarker([a.geometry.coordinates[1], a.geometry.coordinates[0]], {
          radius: r(isStation ? 5 : 3.5),
          color: isStation ? '#f4f0e8' : '#b9b1a4',
          weight: isStation ? 2 : 1.5,
          fillColor: '#12100e',
          fillOpacity: 0.9,
        }).bindPopup(
          `<strong>${escapeHtml(p.title)}</strong><br>${escapeHtml(p.titleJa)}` +
            (isStation ? `<br>Tokaido station #${p.stationNumber}` : '') +
            `<br><span class="muted">${escapeHtml(p.kind)} · ${escapeHtml(p.verification)}</span>`,
        );

        // The basemap renders Japanese names, because that is what OSM stores
        // and every keyless raster source does the same. Our own anchors are
        // romanised, so draw those instead of hoping for an English basemap —
        // and unlike tiles, these survive with no network.
        if (showLabels && zoom >= LABEL_ZOOM && (isStation || zoom >= LABEL_ZOOM_ALL)) {
          const pt = m.latLngToLayerPoint([
            a.geometry.coordinates[1],
            a.geometry.coordinates[0],
          ]);
          if (fits(pt)) {
            placed.push({ x: pt.x, y: pt.y });
            marker.bindTooltip(p.title, {
              permanent: true,
              direction: 'right',
              offset: [6, 0],
              className: isStation ? 'maplabel maplabel--station' : 'maplabel',
            });
          }
        }
        marker.addTo(markers);
      }
    }

    for (const u of userPoints) {
      const colour = TYPE_COLOUR[u.type] ?? '#f4f0e8';
      L.circleMarker([u.lat, u.lon], {
        radius: r(8),
        color: colour,
        weight: scale < 1 ? 2 : 3,
        fillColor: colour,
        fillOpacity: 0.55,
        dashArray: '3 3',
      })
        .bindPopup(
          `<strong>${escapeHtml(u.title)}</strong><br><span class="muted">${escapeHtml(u.type)} · yours${u.classification === 'private' ? ' · private' : ''}</span><br><a href="${href(`/place/${u.id}`)}">Open detail</a>`,
        )
        .addTo(markers);
    }

    for (const w of waypoints) {
      const [lon, lat] = w.geometry.coordinates;
      const p = w.properties;
      const colour = TYPE_COLOUR[p.type] ?? '#f4f0e8';
      L.circleMarker([lat, lon], {
        radius: r(p.type === 'hazard' ? 9 : 7),
        color: colour,
        weight: scale < 1 ? 2 : 3,
        fillColor: colour,
        fillOpacity: 0.35,
      })
        .bindPopup(
          `<strong>${escapeHtml(p.title)}</strong><br><span class="muted">${escapeHtml(p.type)} · ${escapeHtml(p.confidence)} · ${escapeHtml(p.verification)}</span><br><a href="${href(`/place/${p.id}`)}">Open detail</a>`,
        )
        .addTo(markers);
    }

    if (showInactiveVariants) {
      for (const f of routeFeatures) {
        if (f.properties.featureRole !== 'variant' || f.properties.active) continue;
        L.polyline(
          f.geometry.coordinates.map(([lon, lat]) => L.latLng(lat, lon)),
          { color: VARIANT_COLOUR, weight: 3, opacity: 0.55, dashArray: '3 8', lineCap: 'round' },
        )
          .bindPopup(
            `<strong>${escapeHtml(f.properties.title)}</strong><br><span class="muted">Prepared alternative, not active</span>`,
          )
          .addTo(route);
      }
    }

    for (const s of stretches) {
      const latlngs = s.positions.map(([lon, lat]) => L.latLng(lat, lon));
      // Casing first, so the route reads on a pale urban tile and a dark
      // forest one without changing colour.
      L.polyline(latlngs, {
        color: ROUTE_CASING,
        weight: scale < 1 ? 5 : 8,
        opacity: 0.75,
        lineJoin: 'round',
        lineCap: 'round',
      }).addTo(route);
      L.polyline(latlngs, {
        color: ROUTE_COLOUR,
        weight: scale < 1 ? 3 : 4.5,
        opacity: 1,
        lineJoin: 'round',
        lineCap: 'round',
      })
        .bindPopup(
          `<strong>${escapeHtml(s.title)}</strong><br>${s.lengthKm.toFixed(1)} km<br><span class="muted">Imported source route, unverified. Not checked on the ground.</span>`,
        )
        .addTo(route);
    }
  }, [stretches, routeFeatures, anchors, waypoints, userPoints, showAnchors, showInactiveVariants, showLabels, zoom, viewTick]);

  // Fit the view once the data is in, unless a specific point was requested.
  useEffect(() => {
    const m = map.current;
    if (!m || focus) return;
    const bounds = L.latLngBounds([]);
    for (const s of stretches) for (const [lon, lat] of s.positions) bounds.extend([lat, lon]);
    for (const w of waypoints) bounds.extend([w.geometry.coordinates[1], w.geometry.coordinates[0]]);
    if (bounds.isValid()) m.fitBounds(bounds, { padding: [20, 20] });
  }, [stretches, waypoints, focus]);

  useEffect(() => {
    const m = map.current;
    if (!m || !focus) return;
    m.setView([focus[1], focus[0]], 13);
  }, [focus]);

  useEffect(() => {
    const layer = posLayer.current;
    if (!layer) return;
    layer.clearLayers();
    if (!position) return;
    if (position.accuracyM !== null && position.accuracyM > 0) {
      L.circle([position.lat, position.lon], {
        radius: position.accuracyM,
        color: '#7fb8d8',
        weight: 1,
        fillColor: '#7fb8d8',
        fillOpacity: 0.12,
      }).addTo(layer);
    }
    L.circleMarker([position.lat, position.lon], {
      radius: 8,
      color: '#ffffff',
      weight: 3,
      fillColor: '#7fb8d8',
      fillOpacity: 1,
    })
      .bindPopup('Device position (foreground only)')
      .addTo(layer);
  }, [position]);

  return (
    <>
      <div className="mapwrap">
        <div ref={container} style={{ height: '100%' }} role="application" aria-label="Route map" />
        {crosshair ? (
          <div className="crosshair" aria-hidden="true" data-testid="map-crosshair">
            <span className="crosshair__v" />
            <span className="crosshair__h" />
            <span className="crosshair__dot" />
          </div>
        ) : null}
      </div>
      {tilesFailed ? (
        <p className="small muted" style={{ marginTop: 8 }} data-testid="tiles-failed">
          Map tiles are unavailable. The route, anchors, waypoints and your position are still shown
          against a blank background — that part does not need the network.
        </p>
      ) : null}
    </>
  );
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : '&#39;',
  );
}
