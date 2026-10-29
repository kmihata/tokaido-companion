import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { buildContextPacket, copyPacket, sharePacket } from '../lib/contextPacket';
import type { PacketInput } from '../lib/contextPacket';
import { useAppState } from '../state/AppState';

/**
 * "Copy context" — the AI handoff.
 *
 * This component builds text. It makes no network request, holds no API key,
 * and knows nothing about any particular assistant. Kevin reads the packet,
 * edits it if he wants, and hands it to whatever he is talking to.
 *
 * Private data is excluded by default and only ever included through the
 * checkbox below, which is off every time this mounts. Nothing about that
 * decision is remembered, deliberately — an opt-in that persists is an opt-in
 * that gets forgotten about.
 */
export function AiHandoff({
  base,
  privateLines = [],
  heading = 'Ask an AI about this',
}: {
  base: Omit<PacketInput, 'question' | 'includePrivateLines' | 'generatedAt' | 'dataVersion'>;
  privateLines?: readonly string[];
  heading?: string;
}): ReactNode {
  const { settings, dataset } = useAppState();
  const [question, setQuestion] = useState('');
  const [includePrivate, setIncludePrivate] = useState(false);
  const [edited, setEdited] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const generated = useMemo(
    () =>
      buildContextPacket({
        ...base,
        generatedAt: new Date(),
        dataVersion: dataset?.index.dataVersion ?? 'unknown',
        question,
        includePrivateLines: includePrivate ? privateLines : undefined,
      }),
    // The timestamp is read at build time rather than tracked as a dependency;
    // the packet is regenerated whenever anything the user can change moves.
    [base, dataset?.index.dataVersion, question, includePrivate, privateLines],
  );

  const packet = edited ?? generated;

  return (
    <section className="card" aria-labelledby="ai-handoff-heading">
      <h2 id="ai-handoff-heading">{heading}</h2>
      <p className="small muted">
        This builds a block of text. It does not call any AI service and sends nothing anywhere.
        Tap Copy, open the Claude or ChatGPT app, and paste.
      </p>

      <div className="field">
        <label htmlFor="ai-question">Your question</label>
        <textarea
          id="ai-question"
          value={question}
          placeholder="What am I actually looking at here?"
          onChange={(e) => {
            setQuestion(e.target.value);
            setEdited(null);
          }}
          style={{ minHeight: 80 }}
        />
      </div>

      {privateLines.length > 0 ? (
        <div className="checkline">
          <input
            id="include-private"
            type="checkbox"
            checked={includePrivate}
            onChange={(e) => {
              setIncludePrivate(e.target.checked);
              setEdited(null);
            }}
          />
          <label htmlFor="include-private">
            Include {privateLines.length} line{privateLines.length === 1 ? '' : 's'} of private
            detail (lodging and personal notes). Off by default, and never remembered.
          </label>
        </div>
      ) : null}

      <details>
        <summary style={{ minHeight: 44, display: 'flex', alignItems: 'center', fontWeight: 600 }}>
          Preview and edit the packet ({packet.length} characters)
        </summary>
        <textarea
          aria-label="Context packet"
          data-testid="packet-text"
          className="pre"
          style={{ minHeight: 240, width: '100%' }}
          value={packet}
          onChange={(e) => setEdited(e.target.value)}
        />
      </details>

      <div className="btnrow" style={{ marginTop: 12 }}>
        <button
          type="button"
          className="btn btn--primary"
          data-testid="copy-packet"
          onClick={() => {
            void copyPacket(packet).then((r) => {
              setStatus(
                r.ok
                  ? `Copied (${packet.length} characters). Open the Claude or ChatGPT app and paste.`
                  : 'Could not copy automatically. Open "Preview and edit the packet" above, select all the text, and copy it by hand.',
              );
            });
          }}
        >
          Copy
        </button>
        <button
          type="button"
          className="btn"
          data-testid="share-packet"
          onClick={() => {
            void sharePacket(packet).then((r) => {
              setStatus(
                r.ok
                  ? r.method === 'share'
                    ? 'Shared.'
                    : 'Copied to the clipboard.'
                  : r.error === 'cancelled'
                    ? 'Cancelled.'
                    : `Could not copy automatically (${r.error ?? 'unknown'}). Select the text in the preview above and copy it by hand.`,
              );
            });
          }}
        >
          Share…
        </button>
      </div>

      {status ? (
        <p className="small" role="status" data-testid="packet-status">
          {status}
        </p>
      ) : null}

      {settings.aiLinks.length > 0 ? (
        <details style={{ marginTop: 8 }}>
          <summary className="small muted" style={{ minHeight: 44, display: 'flex', alignItems: 'center' }}>
            Open a web version instead
          </summary>
          <p className="small muted">
            These open the website in the browser, not the app, and may ask you to log in. Change
            them under More → Settings.
          </p>
          <div className="btnrow">
            {settings.aiLinks
              .filter((l) => l.url.trim().length > 0)
              .map((l) => (
                <a key={l.url} className="btn" href={l.url} target="_blank" rel="noreferrer noopener">
                  {l.label} ↗
                </a>
              ))}
          </div>
          <p className="small muted">
            Those links need a network. Nothing else on this screen does.
          </p>
        </details>
      ) : null}
    </section>
  );
}
