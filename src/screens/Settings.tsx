import { useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useAppState } from '../state/AppState';
import { parsePrivateData } from '../data/privateSchema';
import { downloadText } from '../lib/download';
import { dayPlanExport } from '../state/dayPlanStore';
import { href } from '../router';
import { listCaptures, capturesToNdjson } from '../lib/capture';
import { assetUrl } from '../lib/base';

export function Settings(): ReactNode {
  const { settings, updateSettings, privateData, setPrivateData, dataset, userPoints, plan } =
    useAppState();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const [importWarnings, setImportWarnings] = useState<string[]>([]);
  const [note, setNote] = useState<string | null>(null);

  const onFile = async (file: File): Promise<void> => {
    setImportErrors([]);
    setImportWarnings([]);
    setNote(null);
    const text = await file.text();
    const result = parsePrivateData(text);
    if (!result.ok) {
      setImportErrors(result.errors);
      return;
    }
    await setPrivateData(result.data);
    setImportWarnings(result.warnings);
    setNote(`Imported "${result.data.label}". Stored on this device only.`);
  };

  return (
    <>
      <a className="backlink" href={href('/more')}>
        ← More
      </a>
      <h1>Settings</h1>

      <section className="card">
        <h2>Field</h2>

        <div className="field">
          <label htmlFor="set-pace">Default pace including stops (km/h)</label>
          <input
            id="set-pace"
            type="number"
            inputMode="decimal"
            step="0.1"
            min="0"
            value={settings.paceKmh ?? ''}
            onChange={(e) => {
              const n = Number(e.target.value);
              updateSettings({ paceKmh: e.target.value.trim() === '' || Number.isNaN(n) ? null : n });
            }}
          />
        </div>

        <div className="field">
          <label htmlFor="set-buffer">Daylight safety buffer (minutes)</label>
          <input
            id="set-buffer"
            type="number"
            inputMode="numeric"
            step="5"
            min="0"
            max="180"
            value={settings.safetyBufferMinutes}
            onChange={(e) => updateSettings({ safetyBufferMinutes: Number(e.target.value) || 0 })}
          />
          <p className="field__hint">
            Subtracted from the daylight deadline before any margin is judged. 45 minutes covers
            terrain shadow, one wrong turn, and the last kilometre always taking longer.
          </p>
        </div>

        <div className="field">
          <label htmlFor="set-date">Preview a date (YYYY-MM-DD)</label>
          <input
            id="set-date"
            type="date"
            data-testid="date-override"
            value={settings.dateOverride ?? ''}
            onChange={(e) => updateSettings({ dateOverride: e.target.value || null })}
          />
          <p className="field__hint">
            For reviewing walking days before the trip starts. While set, a warning chip stays at
            the top of every screen. Clear it before you leave.
          </p>
        </div>
      </section>

      <section className="card">
        <h2>AI links</h2>
        <p className="small muted">
          Optional shortcuts for the handoff screens. The app never calls an AI service; these are
          plain links you open yourself. Blank to hide.
        </p>
        {settings.aiLinks.map((l, i) => (
          <div className="field" key={i}>
            <label htmlFor={`ai-${i}`}>{l.label}</label>
            <input
              id={`ai-${i}`}
              type="url"
              value={l.url}
              onChange={(e) => {
                const next = settings.aiLinks.map((x, j) => (j === i ? { ...x, url: e.target.value } : x));
                updateSettings({ aiLinks: next });
              }}
            />
          </div>
        ))}
      </section>

      <section className="card">
        <h2>Private data</h2>
        <p className="small">
          Private data lives only in this browser's storage on this device. It is never committed
          to the repository, never uploaded, and never included in an AI packet unless you tick the
          box on that screen. See <a href={href('/about')}>Privacy</a>.
        </p>

        <table className="kv">
          <tbody>
            <tr>
              <th>Currently loaded</th>
              <td data-testid="private-status">{privateData ? privateData.label : 'none'}</td>
            </tr>
            <tr>
              <th>Records</th>
              <td>
                {privateData
                  ? `${privateData.lodging.length} lodging, ${privateData.transport.length} transport, ${privateData.contacts.length} contacts, ${privateData.health.length} health, ${privateData.notes.length} notes`
                  : '—'}
              </td>
            </tr>
          </tbody>
        </table>

        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          data-testid="private-file"
          style={{ display: 'none' }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void onFile(f);
            e.target.value = '';
          }}
        />

        <div className="btnrow">
          <button type="button" className="btn btn--primary" onClick={() => fileRef.current?.click()}>
            Import private file
          </button>
          <button
            type="button"
            className="btn"
            disabled={!privateData}
            onClick={() => {
              if (!privateData) return;
              downloadText(
                JSON.stringify(privateData, null, 2),
                `tokaido-private-${new Date().toISOString().slice(0, 10)}.json`,
              );
            }}
          >
            Export private data
          </button>
          <button
            type="button"
            className="btn btn--danger"
            disabled={!privateData}
            onClick={() => {
              if (!window.confirm('Remove private data from this device? Export first if you need it.')) return;
              void setPrivateData(null).then(() => setNote('Private data removed from this device.'));
            }}
          >
            Remove from device
          </button>
        </div>

        {importErrors.length > 0 ? (
          <div className="card card--stop" data-testid="import-errors">
            <div className="card__label">Import refused</div>
            <ul className="notes small">
              {importErrors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {importWarnings.length > 0 ? (
          <ul className="notes small">
            {importWarnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        ) : null}

        {note ? (
          <p className="small" role="status" data-testid="settings-note">
            {note}
          </p>
        ) : null}

        <p className="small muted">
          The file format is documented in DATA-SCHEMAS.md. A fictional example ships at{' '}
          <span className="mono">examples/private-data.example.json</span> in the repository — it is
          deliberately not bundled into the app.
        </p>
      </section>

      <section className="card">
        <h2>Back up before you change anything</h2>
        <p className="small">
          Clearing site data, reinstalling, or a Safari eviction takes captures, private data and
          the places you added with it. Export them before an upgrade. The route itself is safe —
          it ships with the app and comes back from the network.
        </p>
        <div className="btnrow">
          <button
            type="button"
            className="btn"
            data-testid="export-dayplan"
            disabled={plan.legs.length === 0}
            onClick={() =>
              downloadText(
                dayPlanExport(
                  plan.document,
                  plan.legs,
                  dataset?.routeMeta.dataVersion ?? 'unknown',
                  (id) => plan.anchors.find((a) => a.properties.id === id)?.properties.title ?? null,
                ),
                `samwise-day-plan-${new Date().toISOString().slice(0, 10)}.json`,
              )
            }
          >
            Export the day plan
          </button>
          <button
            type="button"
            className="btn"
            data-testid="export-places"
            disabled={userPoints.points.length === 0}
            onClick={() =>
              downloadText(
                JSON.stringify(
                  { schemaVersion: 1, kind: 'samwise-user-points', exported: new Date().toISOString(), points: userPoints.points },
                  null,
                  2,
                ),
                `samwise-places-${new Date().toISOString().slice(0, 10)}.json`,
              )
            }
          >
            Export my places ({userPoints.points.length})
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => {
              void listCaptures().then((cs) =>
                downloadText(
                  capturesToNdjson(cs),
                  `tokaido-captures-${new Date().toISOString().slice(0, 10)}.ndjson`,
                  'application/x-ndjson',
                ),
              );
            }}
          >
            Export captures
          </button>
          <a className="btn" href={assetUrl('data/index.json')} target="_blank" rel="noreferrer noopener">
            View raw data index
          </a>
        </div>
      </section>

      <p className="small muted">Data version {dataset?.index.dataVersion ?? '—'}.</p>
    </>
  );
}
