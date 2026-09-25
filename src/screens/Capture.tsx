import { useCallback, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { useAppState } from '../state/AppState';
import { currentOrNextDay } from '../data/load';
import { useGeolocation } from '../state/useGeolocation';
import {
  CAPTURE_KINDS,
  CAPTURE_KIND_LABEL,
  capturesToNdjson,
  capturesToText,
  clearCaptures,
  listCaptures,
  makeCapture,
  removeCapture,
  saveCapture,
} from '../lib/capture';
import type { Capture, CaptureKind } from '../lib/capture';
import { formatDateTime } from '../lib/time';
import { downloadText } from '../lib/download';

/**
 * Field capture.
 *
 * Deliberately small. Voice Memos, the notebook, the camera and a dedicated
 * GPS tracker remain the primary field evidence — this is for the short typed
 * thing and, more usefully, for the pointer that lets a voice memo or a photo
 * be found again later. Everything is written to IndexedDB on save and stays
 * on the device.
 */
export function Capture(): ReactNode {
  const { dataset, effectiveDate } = useAppState();
  const geo = useGeolocation();

  const [kind, setKind] = useState<CaptureKind>('note');
  const [text, setText] = useState('');
  const [externalRef, setExternalRef] = useState('');
  const [verifyLater, setVerifyLater] = useState(false);
  // Location is attached BY DEFAULT.
  //
  // `../WRITING-RUNWAY.md` makes the location mark the index: it is what lets a
  // voice memo be found again later by shared timestamp and place. A capture
  // saved without it is a note whose "where" has to be reconstructed from
  // memory, which is the thing the whole capture hierarchy exists to avoid.
  // Defaulting it off meant every capture silently lost that unless Kevin
  // remembered to tick a box while tired.
  //
  // See PRIVACY-AND-THREAT-MODEL.md: a coordinate on a note Kevin chose to
  // write is not a location feed, and the captures never leave the device
  // except when he exports them himself.
  const [attachLocation, setAttachLocation] = useState(true);
  const [captures, setCaptures] = useState<Capture[]>([]);
  const [status, setStatus] = useState<string | null>(null);

  const day = dataset ? currentOrNextDay(dataset.days, effectiveDate) : null;

  const refresh = useCallback(() => {
    void listCaptures()
      .then(setCaptures)
      .catch((e: unknown) => setStatus(`Could not read stored captures: ${String(e)}`));
  }, []);

  useEffect(refresh, [refresh]);

  // Ask for a fix as soon as the screen opens, not when the box is ticked.
  //
  // The watch used to start from the checkbox's own handler, so defaulting the
  // box on would have left it ticked with no position, and captures would have
  // saved a null coordinate while claiming to carry one. A fix also takes
  // seconds to arrive: by the time there is something worth writing down, it
  // should already be there. The watch stops when the screen unmounts.
  const startGeo = geo.start;
  useEffect(() => {
    if (attachLocation) startGeo();
    // Deliberately only on mount: re-running on every `attachLocation` change
    // would restart the watch each time the box is toggled.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startGeo]);

  const save = (): void => {
    if (!text.trim() && !externalRef.trim()) {
      setStatus('Nothing to save.');
      return;
    }
    const c = makeCapture({
      kind,
      text: text.trim(),
      dayId: day?.id ?? null,
      externalRef: externalRef.trim() || null,
      verifyLater,
      lat: attachLocation ? geo.lat : null,
      lon: attachLocation ? geo.lon : null,
      accuracyM: attachLocation ? geo.accuracyM : null,
    });
    // Never refuse to save because the fix has not arrived — losing the thought
    // is far worse than losing the coordinate — but never let it pass silently
    // either. A capture that claims a location it does not have is the same
    // class of defect as everything else this project has spent the day
    // hunting down.
    const missedFix = attachLocation && geo.lat === null;

    void saveCapture(c)
      .then(() => {
        setText('');
        setExternalRef('');
        setVerifyLater(false);
        setStatus(
          missedFix
            ? 'Saved to this device — but WITHOUT coordinates: there was no fix yet. Note where you are in the text while you still remember.'
            : 'Saved to this device.',
        );
        refresh();
      })
      .catch((e: unknown) => setStatus(`Save failed: ${String(e)}`));
  };

  return (
    <>
      <h1>Capture</h1>
      <p className="muted small">
        Saved on this device only. Nothing is uploaded. Voice memos, photographs, the notebook and
        a dedicated GPS tracker are still the primary record — this is for the short typed thing
        and for pointers back to those files.
      </p>

      <section className="card">
        <div className="field">
          <label htmlFor="cap-kind">Kind</label>
          <select id="cap-kind" value={kind} onChange={(e) => setKind(e.target.value as CaptureKind)}>
            {CAPTURE_KINDS.map((k) => (
              <option key={k} value={k}>
                {CAPTURE_KIND_LABEL[k]}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor="cap-text">Note</label>
          <textarea
            id="cap-text"
            data-testid="capture-text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="What is actually here?"
          />
        </div>

        <div className="field">
          <label htmlFor="cap-ref">External reference (optional)</label>
          <input
            id="cap-ref"
            type="text"
            value={externalRef}
            placeholder="Voice memo title, photo filename, notebook page"
            onChange={(e) => setExternalRef(e.target.value)}
          />
          <p className="field__hint">
            There is no in-app audio recording. Record in Voice Memos and put the title here so the
            two can be joined later by timestamp.
          </p>
        </div>

        <div className="checkline">
          <input
            id="cap-loc"
            type="checkbox"
            checked={attachLocation}
            onChange={(e) => {
              setAttachLocation(e.target.checked);
              if (e.target.checked && geo.status !== 'watching') geo.start();
            }}
          />
          <label htmlFor="cap-loc" data-testid="cap-loc-label">
            Attach current coordinates
            {!attachLocation
              ? ''
              : geo.lat !== null
                ? ` (${geo.lat.toFixed(5)}, ${geo.lon?.toFixed(5)})`
                : geo.status === 'error' || geo.status === 'unsupported'
                  ? ' — no location available, so captures will save without it'
                  : ' (waiting for a fix…)'}
          </label>
        </div>

        <div className="checkline">
          <input
            id="cap-verify"
            type="checkbox"
            checked={verifyLater}
            onChange={(e) => setVerifyLater(e.target.checked)}
          />
          <label htmlFor="cap-verify">Flag for verification later</label>
        </div>

        <button type="button" className="btn btn--primary btn--wide" onClick={save} data-testid="capture-save">
          Save
        </button>
        {status ? (
          <p className="small" role="status" data-testid="capture-status">
            {status}
          </p>
        ) : null}
        {day ? <p className="small muted">Will be filed against {day.label}.</p> : null}
      </section>

      <section className="card">
        <h2>Stored captures ({captures.length})</h2>
        {captures.length === 0 ? (
          <p className="muted">Nothing captured yet.</p>
        ) : (
          <>
            <div className="btnrow">
              <button
                type="button"
                className="btn"
                onClick={() =>
                  downloadText(
                    capturesToNdjson(captures),
                    `tokaido-captures-${new Date().toISOString().slice(0, 10)}.ndjson`,
                    'application/x-ndjson',
                  )
                }
              >
                Export NDJSON
              </button>
              <button
                type="button"
                className="btn"
                onClick={() =>
                  downloadText(
                    capturesToText(captures),
                    `tokaido-captures-${new Date().toISOString().slice(0, 10)}.txt`,
                    'text/plain',
                  )
                }
              >
                Export plain text
              </button>
              <button
                type="button"
                className="btn btn--danger"
                onClick={() => {
                  if (!window.confirm('Delete every capture on this device? Export first.')) return;
                  void clearCaptures().then(() => {
                    setStatus('All captures deleted.');
                    refresh();
                  });
                }}
              >
                Delete all
              </button>
            </div>
            <ul className="list">
              {captures.map((c) => (
                <li key={c.id} className="list__item">
                  <h3>{CAPTURE_KIND_LABEL[c.kind]}</h3>
                  <div className="list__meta">
                    {formatDateTime(new Date(c.createdAt))}
                    {c.lat !== null ? ` · ${c.lat.toFixed(4)}, ${c.lon?.toFixed(4)}` : ''}
                    {c.verifyLater ? ' · VERIFY LATER' : ''}
                  </div>
                  {c.text ? <p style={{ marginTop: 6 }}>{c.text}</p> : null}
                  {c.externalRef ? <p className="small muted">Ref: {c.externalRef}</p> : null}
                  <button
                    type="button"
                    className="btn btn--danger"
                    onClick={() => void removeCapture(c.id).then(refresh)}
                  >
                    Delete
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </>
  );
}
