import type { ReactNode } from 'react';
import { useAppState } from '../state/AppState';
import { href } from '../router';
import { formatKmMi } from '../lib/time';
import { DemoBanner } from '../components/DemoBanner';

export function Days(): ReactNode {
  const { dataset, effectiveDate } = useAppState();
  if (!dataset) return <p>Loading…</p>;
  return (
    <>
      <a className="backlink" href={href('/more')}>
        ← More
      </a>
      <DemoBanner inline />
      <h1>All days</h1>
      <p className="muted small">
        Seeded from DAILY-SCHEDULE-DRAFT.md, which is a balancing draft. Every distance is
        provisional.
      </p>
      <ul className="list">
        {dataset.days.map((d) => (
          <li key={d.id}>
            <a
              className="list__item"
              href={href(`/day/${d.id}`)}
              style={d.date === effectiveDate ? { borderColor: 'var(--accent)', borderWidth: 2 } : undefined}
            >
              <h3>
                {d.date} — {d.label}
              </h3>
              <div className="list__meta">
                {d.kind}
                {d.nominalDistanceKm ? ` · ${formatKmMi(d.nominalDistanceKm)}` : ''}
                {d.railRedundancy ? ` · rail ${d.railRedundancy}` : ''}
              </div>
            </a>
          </li>
        ))}
      </ul>
    </>
  );
}
