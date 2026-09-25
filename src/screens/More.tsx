import type { ReactNode } from 'react';
import { href } from '../router';
import { useAppState } from '../state/AppState';

export function More(): ReactNode {
  const { dataset, privateData, sync } = useAppState();
  return (
    <>
      <h1>More</h1>
      <ul className="list">
        <li>
          <a className="list__item" href={href('/route')} data-testid="more-route">
            <h3>Route</h3>
            <div className="list__meta">
              {dataset ? `${dataset.activeLengthKm.toFixed(0)} km · ${dataset.stretches.length} stretch${dataset.stretches.length === 1 ? '' : 'es'} · ${dataset.breaks.length} break${dataset.breaks.length === 1 ? '' : 's'}` : '—'}
            </div>
          </a>
        </li>
        <li>
          <a className="list__item" href={href('/plan')} data-testid="more-plan">
            <h3>Plan the days</h3>
            <div className="list__meta">Where each walking day ends, measured on the route</div>
          </a>
        </li>
        <li>
          <a className="list__item" href={href('/days')}>
            <h3>All days</h3>
            <div className="list__meta">{dataset?.days.length ?? 0} calendar days</div>
          </a>
        </li>
        <li>
          <a className="list__item" href={href('/places')}>
            <h3>Places</h3>
            <div className="list__meta">
              {dataset?.waypoints.length ?? 0} waypoints, {dataset?.stations.length ?? 0} stations
            </div>
          </a>
        </li>
        <li>
          <a className="list__item" href={href('/offline')} data-testid="more-offline">
            <h3>Offline readiness</h3>
            <div className="list__meta">Data {sync.dataVersion ?? '—'}</div>
          </a>
        </li>
        <li>
          <a className="list__item" href={href('/settings')} data-testid="more-settings">
            <h3>Settings</h3>
            <div className="list__meta">
              Pace, daylight buffer, preview date, private data{privateData ? ' (loaded)' : ''}
            </div>
          </a>
        </li>
        <li>
          <a className="list__item" href={href('/about')}>
            <h3>About and privacy</h3>
            <div className="list__meta">What this is, what it cannot do</div>
          </a>
        </li>
      </ul>
    </>
  );
}
