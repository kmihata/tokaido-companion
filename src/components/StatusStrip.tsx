import type { ReactNode } from 'react';
import { useOnline } from '../state/useOnline';
import { useAppState } from '../state/AppState';
import { href } from '../router';

/**
 * The persistent status line: connectivity, data version, and whether the
 * displayed date is real. All three are things that, if wrong and invisible,
 * would make every other screen quietly misleading.
 */
export function StatusStrip(): ReactNode {
  const online = useOnline();
  const { sync, dataset, dateIsOverridden, effectiveDate } = useAppState();

  return (
    <div className="statusstrip" role="status" aria-live="polite">
      <span
        className={online ? 'chip chip--ok' : 'chip chip--warn'}
        data-testid="online-chip"
        title={
          online
            ? 'The device reports a network interface. That is not the same as usable signal.'
            : 'No network. Everything precached still works.'
        }
      >
        {online ? '◉ Device online' : '◍ Offline'}
      </span>

      <a className="chip chip--info" href={href('/offline')} data-testid="data-version-chip">
        Data {sync.dataVersion ?? dataset?.index.dataVersion ?? '—'}
      </a>

      {dateIsOverridden ? (
        <span className="chip chip--warn" data-testid="date-override-chip">
          ⚠ Previewing {effectiveDate}
        </span>
      ) : null}
    </div>
  );
}
