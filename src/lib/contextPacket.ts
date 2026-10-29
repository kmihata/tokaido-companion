/**
 * The AI handoff packet.
 *
 * This app makes no AI API calls and holds no provider credentials. It builds
 * a block of plain text that Kevin can read, edit, and then copy or share into
 * whichever assistant he is using. Provider-neutral by construction: it is
 * text.
 *
 * Two rules the generator enforces:
 *   1. Private data is NEVER included unless the caller passes it explicitly,
 *      which only happens after Kevin ticks the box on the preview screen.
 *   2. Every provenance flag travels with the fact. An assistant that receives
 *      a distance without being told it came from a schematic sketch will
 *      confidently reason from it.
 *
 * Pure; unit-tested.
 */
import type { Day, Station, WaypointProps } from '../data/schemas';
import { formatClock, formatKmMi } from './time';

export interface PacketInput {
  generatedAt: Date;
  dataVersion: string;
  day: Day | null;
  waypoint: (WaypointProps & { lat: number; lon: number }) | null;
  stations: readonly Station[];
  position: { lat: number; lon: number; accuracyM: number | null } | null;
  /** When `position` was taken, if known. Lets the packet say how old it is. */
  positionAt?: Date | null;
  /** Measured from the position along today's section, when one is available. */
  progress?: {
    kmIn: number;
    kmLeft: number;
    dayKm: number;
    offRouteKm: number;
    status: 'before-start' | 'on-section' | 'past-finish' | 'far-from-section';
  } | null;
  completedKm: number | null;
  paceKmh: number | null;
  sunset: Date | null;
  question: string;
  /** Only supplied when Kevin has explicitly opted in on the preview screen. */
  includePrivateLines?: readonly string[];
}

const DEMO_HEADER = [
  'PROVENANCE WARNING — read before reasoning from anything below.',
  'This packet comes from a demonstration build. Its route line is a schematic',
  'sketch of straight lines between approximate town placemarks. It follows no',
  'road. Distances, coordinates, hazards, bailouts and hotels are unverified and',
  'were never measured on a GPX or checked on the ground. Do not treat any figure',
  'here as navigational, and say so if I appear to be relying on one.',
].join('\n');

export function buildContextPacket(input: PacketInput): string {
  const lines: string[] = [];
  const push = (s = ''): void => void lines.push(s);

  push(DEMO_HEADER);
  push();
  push('--- CONTEXT ---');
  push(`Generated: ${input.generatedAt.toISOString()} (data version ${input.dataVersion})`);
  push('Trip: walking the Tokaido, Tokyo to Kyoto, October–November 2026.');
  push();

  if (input.day) {
    const d = input.day;
    push(`Day: ${d.date} — ${d.label}${d.walkingDayNumber ? ` (walking day ${d.walkingDayNumber})` : ''}`);
    push(`Plan: ${d.plan}`);
    if (d.nominalDistanceKm != null) push(`Nominal route distance: ${formatKmMi(d.nominalDistanceKm)} (provisional)`);
    if (d.likelyDoorToDoorKm != null) push(`Likely door-to-door: ${formatKmMi(d.likelyDoorToDoorKm)} (estimate)`);
    if (d.terrain) push(`Terrain: ${d.terrain}`);
    if (d.railRedundancy) push(`Rail redundancy: ${d.railRedundancy}`);
    if (d.sleepBase) push(`Sleep base: ${d.sleepBase}`);
    if (d.safetyNotes.length) {
      push('Safety notes on file:');
      for (const n of d.safetyNotes) push(`  - ${n}`);
    }
    if (d.weatherSensitive.length) {
      push('Weather-sensitive sections:');
      for (const n of d.weatherSensitive) push(`  - ${n}`);
    }
    push();
  }

  if (input.waypoint) {
    const w = input.waypoint;
    push(`Waypoint: ${w.title} (${w.type})`);
    push(`  Coordinates: ${w.lat.toFixed(5)}, ${w.lon.toFixed(5)} — APPROXIMATE PLACEMARK`);
    push(`  Confidence: ${w.confidence} · verification: ${w.verification} · source: ${w.source}`);
    if (w.operationalNotes) push(`  Operational: ${w.operationalNotes}`);
    if (w.historicalNotes) push(`  Historical: ${w.historicalNotes}`);
    if (w.safetyNotes) push(`  Safety: ${w.safetyNotes}`);
    push();
  }

  if (input.stations.length) {
    push('Traditional stations associated with this day:');
    for (const s of input.stations) {
      push(`  - ${s.name}${s.number !== null ? ` (#${s.number})` : ''} — modern: ${s.modern}`);
    }
    push();
  }

  push('--- CURRENT STATE ---');
  if (input.position) {
    const acc = input.position.accuracyM !== null ? ` (±${Math.round(input.position.accuracyM)} m)` : '';
    const at = input.positionAt
      ? `, taken ${formatClock(input.positionAt)} (${Math.max(0, Math.round((input.generatedAt.getTime() - input.positionAt.getTime()) / 60000))} min before this packet)`
      : '';
    push(`Device position: ${input.position.lat.toFixed(5)}, ${input.position.lon.toFixed(5)}${acc}${at}`);
  } else {
    push('Device position: not available.');
  }
  if (input.progress) {
    const g = input.progress;
    const where =
      g.status === 'before-start'
        ? 'not yet at the start of today\'s section'
        : g.status === 'past-finish'
          ? 'at or past today\'s planned finish'
          : g.status === 'far-from-section'
            ? `about ${g.offRouteKm.toFixed(1)} km from today's section, so the figures below may not apply`
            : g.offRouteKm >= 0.15
              ? `${g.offRouteKm.toFixed(1)} km off the route line`
              : 'on the route line';
    push(`Position on today's route (measured along the traced line from the position above): ${where}.`);
    push(`  Walked so far: ${formatKmMi(g.kmIn)} of ${formatKmMi(g.dayKm)}. Left to the planned finish: ${formatKmMi(g.kmLeft)}.`);
  }
  push(`Distance walked today (as entered): ${input.completedKm !== null ? formatKmMi(input.completedKm) : 'not entered'}`);
  push(`Pace including stops (as entered): ${input.paceKmh !== null ? `${(input.paceKmh / 1.609344).toFixed(2)} mph (${input.paceKmh.toFixed(1)} km/h)` : 'not entered'}`);
  push(`Computed sunset (astronomical, ignores terrain): ${input.sunset ? formatClock(input.sunset) : 'not computed'}`);
  push();

  if (input.includePrivateLines && input.includePrivateLines.length > 0) {
    push('--- PRIVATE DETAIL (included deliberately by me for this message) ---');
    for (const l of input.includePrivateLines) push(l);
    push();
  }

  push('--- MY QUESTION ---');
  push(input.question.trim() || '(no question entered)');
  push();
  push('--- HOW TO ANSWER ---');
  push('Separate what you actually know from what you are inferring. If the answer');
  push('depends on a distance, a trail condition, a timetable, or pedestrian legality,');
  push('say that it needs checking rather than estimating it. I am the one deciding.');

  return lines.join('\n');
}

export interface ShareResult {
  method: 'share' | 'clipboard' | 'manual';
  ok: boolean;
  error?: string;
}

/**
 * Hand the packet to the OS.
 *
 * Web Share where available (iOS Safari has it), clipboard otherwise, and a
 * 'manual' result when neither works so the UI can fall back to a selectable
 * textarea. Nothing is transmitted by this app.
 */
export async function sharePacket(text: string, title = 'Tokaido context'): Promise<ShareResult> {
  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      await navigator.share({ title, text });
      return { method: 'share', ok: true };
    } catch (err) {
      // AbortError means Kevin dismissed the sheet: not a failure worth escalating.
      if (err instanceof Error && err.name === 'AbortError') {
        return { method: 'share', ok: false, error: 'cancelled' };
      }
    }
  }
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return { method: 'clipboard', ok: true };
    } catch (err) {
      return { method: 'manual', ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }
  return { method: 'manual', ok: false, error: 'No share or clipboard API available.' };
}

/**
 * Plain copy, no share sheet.
 *
 * Kevin, 2026-10-29, on the road: the old button opened the share sheet,
 * which was not useful; he uses the Claude and ChatGPT apps and just wants the
 * text on the clipboard, with a clear "copied". The async clipboard API is
 * tried first; if the browser refuses it, the old select-and-execCommand path
 * still works on iOS inside a tap.
 */
export async function copyPacket(text: string): Promise<{ ok: boolean; error?: string }> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return { ok: true };
    } catch {
      // fall through to the legacy path
    }
  }
  if (typeof document !== 'undefined') {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.top = '-1000px';
      ta.style.fontSize = '16px'; // stops iOS zooming the page
      document.body.appendChild(ta);
      ta.select();
      ta.setSelectionRange(0, text.length);
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      if (ok) return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }
  return { ok: false, error: 'This browser would not copy.' };
}
