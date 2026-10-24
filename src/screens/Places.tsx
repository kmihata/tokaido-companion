import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useAppState } from '../state/AppState';
import { href } from '../router';
import { DemoBanner } from '../components/DemoBanner';
import { guessPlaceType, isDuplicate, parseGpxPlaces } from '../lib/gpxPlaces';
import { makeUserPoint } from '../lib/userPoints';

const GROUPS: { label: string; types: string[] }[] = [
  { label: 'All', types: [] },
  { label: 'Bailouts', types: ['rail-bailout'] },
  { label: 'Hazards', types: ['hazard'] },
  { label: 'Crossings', types: ['river-crossing', 'ferry-gap', 'bridge', 'tunnel', 'pass', 'category-change'] },
  { label: 'Research', types: ['research', 'hiroshige-viewpoint'] },
  { label: 'Supplies', types: ['water', 'food', 'resupply'] },
  { label: 'Sleep', types: ['hotel'] },
  { label: 'Medical', types: ['medical', 'pharmacy'] },
];

export function Places(): ReactNode {
  const { dataset, userPoints } = useAppState();
  const [group, setGroup] = useState('All');
  const [q, setQ] = useState('');
  const [importNote, setImportNote] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  // Waypoints from a GPX file become your own public places, so they ride
  // along in every day file whose stretch they fall on. See lib/gpxPlaces.ts.
  const importGpx = async (file: File): Promise<void> => {
    if (!dataset) return;
    setImporting(true);
    try {
      const parsed = parseGpxPlaces(await file.text());
      let added = 0;
      let dup = 0;
      let far = 0;
      const existing = [...userPoints.points];
      for (const w of parsed.waypoints) {
        if (isDuplicate(w, existing)) {
          dup++;
          continue;
        }
        const point = makeUserPoint(
          {
            role: 'waypoint',
            type: guessPlaceType(w),
            title: w.name.slice(0, 80),
            notes: [w.description, `Imported from ${file.name}`].filter(Boolean).join(' · '),
            lat: w.lat,
            lon: w.lon,
            classification: 'public',
          },
          dataset.stretches,
        );
        if (!point.onRoute || point.onRoute.offRouteKm > 3) far++;
        await userPoints.save(point);
        existing.push(point);
        added++;
      }
      const bits = [
        `Added ${added} place${added === 1 ? '' : 's'} from ${file.name}.`,
        dup ? `${dup} were already here.` : '',
        far ? `${far} are more than 3 km from the route and will not appear in day files.` : '',
        parsed.trackCount ? `The file's ${parsed.trackCount} track${parsed.trackCount === 1 ? '' : 's'} were not imported; only waypoints are.` : '',
        added ? 'They will be in the day file for the day each one falls on.' : '',
        ...parsed.errors,
      ];
      setImportNote(bits.filter(Boolean).join(' '));
    } catch {
      setImportNote('Could not read that file.');
    } finally {
      setImporting(false);
    }
  };

  const filtered = useMemo(() => {
    if (!dataset) return [];
    const types = GROUPS.find((g) => g.label === group)?.types ?? [];
    const needle = q.trim().toLowerCase();
    const match = (id: string, type: string, title: string): boolean => {
      if (types.length > 0 && !types.includes(type)) return false;
      if (needle && !`${title} ${type}`.toLowerCase().includes(needle)) return false;
      return Boolean(id);
    };
    // Kevin's own points first — they are the ones he went looking for.
    const mine = userPoints.points
      .filter((p) => match(p.id, p.type, p.title))
      .map((p) => ({
        id: p.id,
        title: p.title,
        type: p.type,
        meta: `yours${p.classification === 'private' ? ' · private' : ''}${p.onRoute ? ` · ${p.onRoute.alongKm.toFixed(1)} km along` : ''}`,
        mine: true,
      }));
    const shipped = dataset.waypoints
      .filter((w) => match(w.properties.id, w.properties.type, w.properties.title))
      .map((w) => ({
        id: w.properties.id,
        title: w.properties.title,
        type: w.properties.type,
        meta: `${w.properties.confidence} · ${w.properties.verification}`,
        mine: false,
      }));
    return [...mine, ...shipped];
  }, [dataset, userPoints.points, group, q]);

  if (!dataset) return <p>Loading…</p>;

  return (
    <>
      <a className="backlink" href={href('/more')}>
        ← More
      </a>
      <DemoBanner inline />
      <h1>Places</h1>

      <div className="field">
        <label htmlFor="places-q">Search</label>
        <input id="places-q" type="text" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      <div className="btnrow">
        {GROUPS.map((g) => (
          <button
            key={g.label}
            type="button"
            className={g.label === group ? 'btn btn--primary' : 'btn'}
            onClick={() => setGroup(g.label)}
          >
            {g.label}
          </button>
        ))}
      </div>

      <div className="btnrow">
        <a className="btn btn--primary" href={href('/add')} data-testid="add-place">
          Add a place
        </a>
        <label className="btn" style={{ cursor: 'pointer' }}>
          {importing ? 'Importing…' : 'Import places from GPX'}
          <input
            type="file"
            accept=".gpx,application/gpx+xml,application/xml,text/xml"
            data-testid="import-gpx-places"
            style={{ display: 'none' }}
            disabled={importing}
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) void importGpx(f);
            }}
          />
        </label>
      </div>
      {importNote ? (
        <p className="small" role="status" data-testid="import-gpx-result">
          {importNote}
        </p>
      ) : null}

      <p className="muted small">
        {filtered.length} places
        {userPoints.points.length > 0 ? ` · ${userPoints.points.length} yours` : ''}
      </p>

      <ul className="list" data-testid="places-list">
        {filtered.map((w) => (
          <li key={w.id}>
            <a
              className="list__item"
              href={href(`/place/${w.id}`)}
              style={w.mine ? { borderColor: 'var(--accent)' } : undefined}
            >
              <h3>{w.title}</h3>
              <div className="list__meta">
                {w.type} · {w.meta}
              </div>
            </a>
          </li>
        ))}
      </ul>
    </>
  );
}
