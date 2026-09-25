/**
 * Time formatting.
 *
 * Everything the field screens show is in the trip timezone (Asia/Tokyo by
 * default), regardless of what the phone thinks its own timezone is, because
 * an ambiguous clock reading at dusk is worse than no clock reading.
 */

export const TRIP_TIMEZONE = 'Asia/Tokyo';

function fmt(timeZone: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat('en-GB', { timeZone, ...options });
}

/** "16:58" */
export function formatClock(d: Date | null, timeZone: string = TRIP_TIMEZONE): string {
  if (!d || Number.isNaN(d.getTime())) return '—';
  return fmt(timeZone, { hour: '2-digit', minute: '2-digit', hour12: false }).format(d);
}

/** "Sat 24 Oct" */
export function formatDayLabel(d: Date | null, timeZone: string = TRIP_TIMEZONE): string {
  if (!d || Number.isNaN(d.getTime())) return '—';
  return fmt(timeZone, { weekday: 'short', day: 'numeric', month: 'short' }).format(d);
}

/** "Sat 24 Oct 2026, 16:58" */
export function formatDateTime(d: Date | null, timeZone: string = TRIP_TIMEZONE): string {
  if (!d || Number.isNaN(d.getTime())) return '—';
  return fmt(timeZone, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d);
}

/** The calendar date, "YYYY-MM-DD", as seen in `timeZone`. */
export function isoDateIn(d: Date, timeZone: string = TRIP_TIMEZONE): string {
  const parts = fmt(timeZone, { year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d);
  const get = (t: string): string => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** Whole days from `from` to `to`, by calendar date in `timeZone`. */
export function daysBetweenIso(fromIso: string, toIso: string): number {
  const a = Date.parse(`${fromIso}T00:00:00Z`);
  const b = Date.parse(`${toIso}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return NaN;
  return Math.round((b - a) / 86_400_000);
}

/** Parse "HH:MM" against an ISO date, interpreted in the trip timezone. */
export function parseLocalTime(isoDate: string, hhmm: string, timeZone: string = TRIP_TIMEZONE): Date | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  // Find the UTC instant whose representation in `timeZone` is the wanted
  // wall-clock time: read the guess back in that zone and correct by the
  // difference. One pass suffices for a zone without DST, which Japan is.
  const guess = new Date(`${isoDate}T${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}:00Z`);
  if (Number.isNaN(guess.getTime())) return null;
  const shown = fmt(timeZone, { hour: '2-digit', minute: '2-digit', hour12: false }).format(guess);
  const sm = /^(\d{2}):(\d{2})$/.exec(shown);
  if (!sm) return guess;
  let deltaMin = (Number(sm[1]) - h) * 60 + (Number(sm[2]) - min);
  // The readback wraps across midnight, so a +9h offset can present as -15h.
  // Fold the difference into (-12h, +12h] before applying it.
  while (deltaMin > 720) deltaMin -= 1440;
  while (deltaMin <= -720) deltaMin += 1440;
  return new Date(guess.getTime() - deltaMin * 60_000);
}

export function formatKm(km: number | null | undefined, digits = 1): string {
  if (km === null || km === undefined || !Number.isFinite(km)) return '—';
  return `${km.toFixed(digits)} km`;
}

export function formatKmMi(km: number | null | undefined): string {
  if (km === null || km === undefined || !Number.isFinite(km)) return '—';
  return `${km.toFixed(1)} km / ${(km * 0.621371).toFixed(1)} mi`;
}
