import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useAppState } from '../state/AppState';
import { href } from '../router';
import { DemoBanner } from '../components/DemoBanner';

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
      </div>

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
