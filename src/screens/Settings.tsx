import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useAppState } from '../state/AppState';
import { parsePrivateData } from '../data/privateSchema';
import { downloadText } from '../lib/download';
import { dayPlanExport } from '../state/dayPlanStore';
import { href } from '../router';
import { listCaptures, capturesToNdjson } from '../lib/capture';
import { assetUrl } from '../lib/base';
import { KM_PER_MILE } from '../lib/pace';

export function Settings(): ReactNode {
  const { settings, updateSettings, privateData, setPrivateData, dataset, userPoints, plan } =
    useAppState();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const posRef = useRef<HTMLInputElement | null>(null);
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
          <label htmlFor="set-pace">Default pace including stops (mph)</label>
          <PaceMphInput
            id="set-pace"
            kmh={settings.paceKmh}
            onChange={(kmh) => updateSettings({ paceKmh: kmh })}
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
          <div className="field__row">
            <input
              id="set-date"
              type="date"
              data-testid="date-override"
              value={settings.dateOverride ?? ''}
              onChange={(e) => updateSettings({ dateOverride: e.target.value || null })}
            />
            {/* iOS Safari's date picker cannot empty the field, so without this
                button a preview date set on the phone could not be undone. */}
            <button
              type="button"
              className="btn"
              data-testid="clear-date-override"
              disabled={settings.dateOverride === null}
              onClick={() => updateSettings({ dateOverride: null })}
            >
              Clear
            </button>
          </div>
          <p className="field__hint">
            For reviewing walking days before the trip starts. While set, a warning chip stays at
            the top of every screen; tapping that chip clears it from anywhere. Clear it before you
            leave.
          </p>
        </div>

        <div className="field">
          <label htmlFor="set-position">Pretend I am here (lat, lon)</label>
          <div className="field__row">
          <input
            ref={posRef}
            /* Uncontrolled, because it only commits on blur. The key makes it
               remount when the override is cleared from somewhere else — the
               warning chip on another screen — so the box cannot keep showing
               a position the app is no longer using. */
            key={settings.positionOverride ? 'set' : 'empty'}
            id="set-position"
            type="text"
            inputMode="text"
            placeholder="34.8300, 138.1742"
            data-testid="position-override"
            defaultValue={
              settings.positionOverride
                ? `${settings.positionOverride.lat}, ${settings.positionOverride.lon}`
                : ''
            }
            onBlur={(e) => {
              const t = e.target.value.trim();
              if (t === '') {
                updateSettings({ positionOverride: null });
                return;
              }
              const m = /^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/.exec(t);
              const lat = m ? Number(m[1]) : NaN;
              const lon = m ? Number(m[2]) : NaN;
              const ok =
                Number.isFinite(lat) && Number.isFinite(lon) &&
                lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
              updateSettings({ positionOverride: ok ? { lat, lon } : null });
              if (!ok) e.target.value = '';
            }}
          />
            {/* The field only commits on blur, which on a phone means tapping
                somewhere else and hoping. This clears both the box and the
                stored value in one tap. */}
            <button
              type="button"
              className="btn"
              data-testid="clear-position-override"
              disabled={settings.positionOverride === null}
              onClick={() => {
                if (posRef.current) posRef.current.value = '';
                updateSettings({ positionOverride: null });
              }}
            >
              Clear
            </button>
          </div>
          <p className="field__hint">
            Rehearsal only. The device treats this as where you are standing, so the decision
            calculator, the off-route distance and the nearest exit all become real from home. It
            overrides the actual GPS completely and never falls back to it. A warning chip stays on
            every screen while it is set, and the map dot turns amber; tapping that chip clears it from
            anywhere. Clear it before you leave.
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
            {/* The file's own date, which is how to tell one export from the
                next. The app has no backend and cannot know whether a newer
                file exists elsewhere, so it says which one it is holding
                rather than claiming to be current. */}
            <tr>
              <th>File date</th>
              <td data-testid="private-generated">
                {privateData ? privateData.generated : '—'}
                {privateData ? (
                  <div className="small muted">
                    This is the file on this device. Compare it with the newest export you made.
                  </div>
                ) : null}
              </td>
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

/** Pace typed in mph, stored in km/h. Local text state so partial input like "2." is not rewritten. */
function PaceMphInput({
  id,
  kmh,
  onChange,
}: {
  id: string;
  kmh: number | null;
  onChange: (kmh: number | null) => void;
}): ReactNode {
  const fmt = (v: number | null): string => (v !== null ? String(Math.round((v / KM_PER_MILE) * 100) / 100) : '');
  const [text, setText] = useState(fmt(kmh));
  // Settings load asynchronously; follow outside changes without fighting typing.
  useEffect(() => {
    const typed = Number(text) * KM_PER_MILE;
    if (kmh === null ? text.trim() !== '' : Math.abs(typed - kmh) > 0.01) setText(fmt(kmh));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kmh]);
  return (
    <input
      id={id}
      type="number"
      inputMode="decimal"
      step="0.05"
      min="0"
      value={text}
      onChange={(e) => {
        setText(e.target.value);
        const n = Number(e.target.value);
        onChange(e.target.value.trim() === '' || Number.isNaN(n) ? null : n * KM_PER_MILE);
      }}
    />
  );
}
