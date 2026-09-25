/**
 * Field captures: create, store, export.
 *
 * Captures are the one thing in this app that cannot be regenerated. They are
 * written to IndexedDB immediately on save, exported as newline-delimited JSON
 * so a truncated file still yields every complete record before the break, and
 * never sent anywhere.
 */
import { STORE_CAPTURES, deleteRecord, getAll, putRecord, clearStore } from './idb';

export const CAPTURE_SCHEMA_VERSION = 1;

export const CAPTURE_KINDS = [
  'note',
  'observation',
  'question',
  'safety-correction',
  'route-correction',
  'photo-reference',
  'voice-note-reference',
] as const;

export type CaptureKind = (typeof CAPTURE_KINDS)[number];

export const CAPTURE_KIND_LABEL: Record<CaptureKind, string> = {
  note: 'Note',
  observation: 'Observation',
  question: 'Question',
  'safety-correction': 'Safety correction',
  'route-correction': 'Route correction',
  'photo-reference': 'Photo reference',
  'voice-note-reference': 'Voice note reference',
};

export interface Capture {
  schemaVersion: number;
  id: string;
  createdAt: string;
  kind: CaptureKind;
  text: string;
  dayId: string | null;
  waypointId: string | null;
  lat: number | null;
  lon: number | null;
  /** Reported GPS accuracy in metres at the time of capture. */
  accuracyM: number | null;
  /** External reference: a photo filename, a Voice Memo title, a notebook page. */
  externalRef: string | null;
  verifyLater: boolean;
  source: 'field-companion';
}

export function newCaptureId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `cap-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function makeCapture(partial: Partial<Capture> & { kind: CaptureKind; text: string }): Capture {
  return {
    schemaVersion: CAPTURE_SCHEMA_VERSION,
    id: partial.id ?? newCaptureId(),
    createdAt: partial.createdAt ?? new Date().toISOString(),
    kind: partial.kind,
    text: partial.text,
    dayId: partial.dayId ?? null,
    waypointId: partial.waypointId ?? null,
    lat: partial.lat ?? null,
    lon: partial.lon ?? null,
    accuracyM: partial.accuracyM ?? null,
    externalRef: partial.externalRef ?? null,
    verifyLater: partial.verifyLater ?? false,
    source: 'field-companion',
  };
}

export async function saveCapture(c: Capture): Promise<void> {
  await putRecord(STORE_CAPTURES, c);
}

export async function listCaptures(): Promise<Capture[]> {
  const all = await getAll<Capture>(STORE_CAPTURES);
  return all.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function removeCapture(id: string): Promise<void> {
  await deleteRecord(STORE_CAPTURES, id);
}

export async function clearCaptures(): Promise<void> {
  await clearStore(STORE_CAPTURES);
}

/** Newline-delimited JSON: one capture per line, stable key order. */
export function capturesToNdjson(captures: readonly Capture[]): string {
  return captures.map((c) => JSON.stringify(c)).join('\n') + (captures.length ? '\n' : '');
}

/** Human-readable plain-text export, for pasting into anything. */
export function capturesToText(captures: readonly Capture[]): string {
  return captures
    .map((c) => {
      const where =
        c.lat !== null && c.lon !== null
          ? ` @ ${c.lat.toFixed(5)}, ${c.lon.toFixed(5)}${c.accuracyM !== null ? ` (±${Math.round(c.accuracyM)} m)` : ''}`
          : '';
      const flags = [c.verifyLater ? 'VERIFY LATER' : null, c.externalRef].filter(Boolean).join(' · ');
      return [
        `[${c.createdAt}] ${CAPTURE_KIND_LABEL[c.kind]}${where}`,
        c.text,
        flags ? `— ${flags}` : null,
      ]
        .filter(Boolean)
        .join('\n');
    })
    .join('\n\n');
}
