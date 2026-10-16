import { useCallback, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { checkOfflineReadiness, warmCaches } from '../lib/offlineCheck';
import type { ReadinessReport } from '../lib/offlineCheck';
import { requestPersistence, storageEstimate } from '../lib/idb';
import { useAppState } from '../state/AppState';
import { useOnline } from '../state/useOnline';
import { checkForUpdate, subscribeSW } from '../pwa/register';
import type { SWCheck, SWState } from '../pwa/register';
import { UpdatePrompt } from '../components/UpdatePrompt';
import { href } from '../router';
import { formatDateTime } from '../lib/time';

export function Offline(): ReactNode {
  const { sync, dataset, reloadDataset, privateData } = useAppState();
  const online = useOnline();
  const [report, setReport] = useState<ReadinessReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [storage, setStorage] = useState<{ usage: number | null; quota: number | null; persisted: boolean | null }>({
    usage: null,
    quota: null,
    persisted: null,
  });
  const [sw, setSw] = useState<SWState>({ needRefresh: false, offlineReady: false, registered: false, error: null });
  const [checking, setChecking] = useState(false);
  const [checkResult, setCheckResult] = useState<SWCheck | null>(null);

  useEffect(() => subscribeSW(setSw), []);

  const run = useCallback(() => {
    setBusy(true);
    void Promise.all([checkOfflineReadiness(), storageEstimate()])
      .then(([r, s]) => {
        setReport(r);
        setStorage(s);
      })
      .finally(() => setBusy(false));
  }, []);

  useEffect(run, [run]);

  const ready = report !== null && report.criticalMissing === 0 && report.serviceWorkerControlling;

  return (
    <>
      <a className="backlink" href={href('/more')}>
        ← More
      </a>
      <h1>Offline readiness</h1>
      <UpdatePrompt />

      <section className={ready ? 'card card--ok' : 'card card--warn'} data-testid="readiness-card">
        <div className="card__label">Status</div>
        <div className="card__big">
          {report === null ? 'Checking…' : ready ? 'Ready for offline use' : 'Not fully ready'}
        </div>
        {report !== null && !ready ? (
          <p className="small">
            {report.criticalMissing} critical item{report.criticalMissing === 1 ? '' : 's'} not in
            the cache
            {report.serviceWorkerControlling ? '' : ', and no service worker is controlling this page'}.
            Connect to a network and run the preparation below.
          </p>
        ) : null}
        <div className="btnrow" style={{ marginTop: 12 }}>
          <button
            type="button"
            className="btn btn--primary"
            data-testid="prepare-offline"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              setNote(null);
              void warmCaches()
                .then((r) => {
                  setNote(
                    r.failed.length === 0
                      ? `Fetched ${r.ok} items. Re-checking.`
                      : `Fetched ${r.ok}; ${r.failed.length} failed: ${r.failed.join('; ')}`,
                  );
                  return reloadDataset();
                })
                .finally(() => run());
            }}
          >
            Prepare for offline use
          </button>
          <button type="button" className="btn" onClick={run} disabled={busy}>
            Re-check
          </button>
        </div>
        {note ? <p className="small">{note}</p> : null}
      </section>

      <section className="card">
        <h2>App version</h2>
        <p className="small">
          A home-screen app is resumed, not reloaded, so it can run for days without ever asking
          whether a newer build exists. This asks. It downloads a newer build if there is one but
          does not install it — the prompt above still waits for a tap.
        </p>
        <div className="btnrow">
          <button
            type="button"
            className="btn btn--primary"
            data-testid="check-update"
            disabled={checking}
            onClick={() => {
              setChecking(true);
              setCheckResult(null);
              void checkForUpdate()
                .then(setCheckResult)
                .finally(() => setChecking(false));
            }}
          >
            {checking ? 'Checking…' : 'Check for an update'}
          </button>
        </div>
        {checkResult !== null ? (
          <p className="small" role="status" data-testid="check-update-result">
            {checkResult === 'update-waiting'
              ? 'A newer build has downloaded and is waiting. The prompt to install it is at the top of this screen and on Today.'
              : checkResult === 'up-to-date'
                ? 'This is the newest build. Nothing to install.'
                : checkResult === 'offline'
                  ? 'No network, so there is nothing to ask. Try again on signal.'
                  : checkResult === 'unsupported'
                    ? 'No service worker is registered on this device, so there is nothing to update.'
                    : 'The check failed. See the service-worker error below.'}
          </p>
        ) : null}
      </section>

      <section className="card">
        <h2>Data version</h2>
        <table className="kv">
          <tbody>
            <tr>
              <th>Route version</th>
              <td>{dataset?.routeMeta.dataVersion ?? '—'}</td>
            </tr>
            <tr>
              <th>Fixture bundle</th>
              <td>
                {sync.dataVersion ?? dataset?.index.dataVersion ?? '—'}
                <div className="small muted">
                  The <span className="mono">-demo</span> suffix marks the public dataset, where
                  the lodging is invented placeholders. It is also the flag that stops this public
                  file being imported as your private one by mistake. Your real stays come from
                  the private file below.
                </div>
              </td>
            </tr>
            <tr>
              <th>Private file</th>
              <td data-testid="offline-private-file">
                {privateData ? `${privateData.generated} — ${privateData.label}` : 'none on this device'}
              </td>
            </tr>
            <tr>
              <th>Last synchronised</th>
              <td>{sync.lastSyncedAt ? formatDateTime(new Date(sync.lastSyncedAt)) : 'never'}</td>
            </tr>
            <tr>
              <th>Fixtures generated</th>
              <td>{dataset?.index.generated ?? '—'}</td>
            </tr>
            <tr>
              <th>Device network</th>
              <td>{online ? 'reports online' : 'offline'}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section className="card">
        <h2>Service worker</h2>
        <table className="kv">
          <tbody>
            <tr>
              <th>Supported</th>
              <td>{report?.serviceWorkerSupported ? 'yes' : 'no'}</td>
            </tr>
            <tr>
              <th>Controlling this page</th>
              <td>{report?.serviceWorkerControlling ? 'yes' : 'no'}</td>
            </tr>
            <tr>
              <th>Registered</th>
              <td>{sw.registered ? 'yes' : 'not yet'}</td>
            </tr>
            <tr>
              <th>Update waiting</th>
              <td>{sw.needRefresh ? 'yes — see the prompt above' : 'no'}</td>
            </tr>
            <tr>
              <th>Caches</th>
              <td className="mono small">{report?.cacheNames.join(', ') || '—'}</td>
            </tr>
          </tbody>
        </table>
        {sw.error ? <p className="small">{sw.error}</p> : null}
      </section>

      <section className="card">
        <h2>Critical assets</h2>
        <ul className="notes small" data-testid="asset-list">
          {(report?.assets ?? []).map((a) => (
            <li key={a.url}>
              {a.cached ? '✓' : '✗'} {a.label}
              {a.critical ? '' : ' (optional)'}
            </li>
          ))}
        </ul>
      </section>

      <section className="card card--warn">
        <h2>What offline actually guarantees</h2>
        <p className="small">
          <strong>Works with no network</strong> once cached: the app shell, every day card, the
          route line and its metadata, station and waypoint data, safety and bailout information,
          prompts, anything already imported, and all the calculations.
        </p>
        <p className="small">
          <strong>Does not work offline:</strong> map tiles, every external link, and the AI
          assistants themselves. The map still draws the route and the markers on a blank
          background.
        </p>
        <p className="small">
          <strong>Browser caching is not permanent.</strong> iOS Safari evicts storage from sites it
          judges unused — historically after around seven days without a visit, and at any time
          under storage pressure. Adding to the Home Screen and opening it regularly reduces the
          risk; nothing removes it. Export your captures before you rely on them, and carry the
          paper backup. OFFLINE-AND-RECOVERY.md has the reinstall procedure.
        </p>
      </section>

      <section className="card">
        <h2>Device storage</h2>
        <table className="kv">
          <tbody>
            <tr>
              <th>Used</th>
              <td>{storage.usage !== null ? `${(storage.usage / 1024 / 1024).toFixed(1)} MB` : 'not reported'}</td>
            </tr>
            <tr>
              <th>Quota</th>
              <td>{storage.quota !== null ? `${(storage.quota / 1024 / 1024).toFixed(0)} MB` : 'not reported'}</td>
            </tr>
            <tr>
              <th>Marked persistent</th>
              <td>{storage.persisted === null ? 'unknown' : storage.persisted ? 'yes' : 'no'}</td>
            </tr>
          </tbody>
        </table>
        <button
          type="button"
          className="btn"
          onClick={() => {
            void requestPersistence().then((r) => {
              setNote(
                r === null
                  ? 'This browser does not implement persistent storage requests.'
                  : r
                    ? 'Granted. This makes eviction less likely, not impossible.'
                    : 'Declined by the browser. Safari commonly declines.',
              );
              void storageEstimate().then(setStorage);
            });
          }}
        >
          Request persistent storage
        </button>
      </section>

      <p className="small muted">
        Checked {report ? formatDateTime(new Date(report.checkedAt)) : '—'}.
      </p>
    </>
  );
}
