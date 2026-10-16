import type { ReactNode } from 'react';
import { useOnline } from '../state/useOnline';
import { useAppState } from '../state/AppState';
import { href } from '../router';

/**
 * The persistent status line: connectivity, data version, and whether the
 * displayed date is real. All three are things that, if wrong and invisible,
 * would make every other screen quietly misleading.
 *
 * The two override chips clear their own override when tapped. They are
 * buttons rather than labels because on 2026-10-16 the preview date could not
 * be cleared at all from an iPhone: the only control was an
 * `<input type="date">`, and iOS Safari's date picker has no way to return the
 * field to empty. The warning said "clear it before you leave" and the app
 * provided no way to obey it. Whatever announces a wrong state should also be
 * able to end it, and an accidental tap here fails safe — back to the real
 * date and the real GPS.
 */
export function StatusStrip(): ReactNode {
  const online = useOnline();
  const { sync, dataset, dateIsOverridden, effectiveDate, settings, updateSettings, privateData } =
    useAppState();

  // The route's own version, not the fixture bundle's. They differ by a
  // '-demo' suffix that the generator adds to the public dataset, and which
  // stays in the data because `demonstration: true` is what stops the private
  // importer accepting a public fixture by mistake. What changes when the
  // route changes is this, so this is what a version chip should show.
  const routeVersion =
    dataset?.routeMeta.dataVersion ?? sync.dataVersion ?? dataset?.index.dataVersion ?? '—';

  // Which private file is on this device. The app has no backend and cannot
  // know whether a newer one exists somewhere else, so it does not pretend to:
  // it states the date of the file it is holding, and Kevin compares.
  const privateStamp = privateData ? privateData.generated.slice(0, 10) : null;

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
        Route {routeVersion}
      </a>

      <a
        className={privateStamp ? 'chip chip--ok' : 'chip chip--warn'}
        href={href('/settings')}
        data-testid="private-version-chip"
        title={
          privateData
            ? `${privateData.label}. Generated ${privateData.generated}.`
            : 'No private file on this device: no lodging, transport or arrival notes.'
        }
      >
        {privateStamp ? `Private ${privateStamp}` : '⚠ No private data'}
      </a>

      {dateIsOverridden ? (
        <button
          type="button"
          className="chip chip--warn chip--clear"
          data-testid="date-override-chip"
          onClick={() => updateSettings({ dateOverride: null })}
          title="Stop previewing and go back to the real date."
        >
          ⚠ Previewing {effectiveDate} <span aria-hidden="true">✕</span>
          <span className="sr-only"> — tap to clear</span>
        </button>
      ) : null}

      {settings.positionOverride ? (
        <button
          type="button"
          className="chip chip--warn chip--clear"
          data-testid="position-override-chip"
          onClick={() => updateSettings({ positionOverride: null })}
          title="Stop pretending and go back to the real GPS."
        >
          ⚠ Pretend position {settings.positionOverride.lat.toFixed(4)},{' '}
          {settings.positionOverride.lon.toFixed(4)} <span aria-hidden="true">✕</span>
          <span className="sr-only"> — tap to clear</span>
        </button>
      ) : null}
    </div>
  );
}
