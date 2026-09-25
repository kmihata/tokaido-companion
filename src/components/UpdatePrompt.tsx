import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { applyPendingUpdate, subscribeSW } from '../pwa/register';
import type { SWState } from '../pwa/register';

/**
 * The controlled update gate.
 *
 * A new build never takes over on its own. It sits and waits until this is
 * tapped. Replacing a working field version without asking is the one failure
 * that could leave Kevin on a mountainside with a broken app and no way back.
 */
export function UpdatePrompt(): ReactNode {
  const [sw, setSw] = useState<SWState>({
    needRefresh: false,
    offlineReady: false,
    registered: false,
    error: null,
  });
  const [busy, setBusy] = useState(false);

  useEffect(() => subscribeSW(setSw), []);

  if (!sw.needRefresh) return null;

  return (
    <div className="card card--warn" role="alert" data-testid="update-prompt">
      <div className="card__label">Update available</div>
      <p>
        A newer version has downloaded and is waiting. The version you are running now is
        untouched until you tap below. If you are mid-walk, this can wait until tonight.
      </p>
      <button
        type="button"
        className="btn btn--primary btn--wide"
        disabled={busy}
        onClick={() => {
          setBusy(true);
          void applyPendingUpdate();
        }}
      >
        {busy ? 'Applying…' : 'Install update and reload'}
      </button>
    </div>
  );
}
