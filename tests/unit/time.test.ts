import { describe, expect, it } from 'vitest';
import {
  daysBetweenIso,
  formatClock,
  formatDayLabel,
  formatKm,
  formatKmMi,
  isoDateIn,
  parseLocalTime,
} from '../../src/lib/time';

describe('formatting in the trip timezone', () => {
  it('shows a UTC instant as Japan wall-clock time regardless of the host timezone', () => {
    expect(formatClock(new Date('2026-10-24T07:56:00Z'))).toBe('16:56');
  });

  it('renders nothing available as an em dash', () => {
    expect(formatClock(null)).toBe('—');
    expect(formatClock(new Date('nonsense'))).toBe('—');
  });

  it('labels the day in Japan time', () => {
    expect(formatDayLabel(new Date('2026-10-24T03:00:00Z'))).toBe('Sat 24 Oct');
  });

  it('derives the Japan calendar date across the UTC day boundary', () => {
    // 22:00 UTC on the 23rd is already 07:00 on the 24th in Japan.
    expect(isoDateIn(new Date('2026-10-23T22:00:00Z'))).toBe('2026-10-24');
  });
});

describe('parseLocalTime', () => {
  it('interprets HH:MM as Japan time', () => {
    const d = parseLocalTime('2026-10-24', '16:56');
    expect(d!.toISOString()).toBe('2026-10-24T07:56:00.000Z');
  });

  it('handles a single-digit hour', () => {
    expect(parseLocalTime('2026-10-24', '6:05')!.toISOString()).toBe('2026-10-23T21:05:00.000Z');
  });

  it('rejects nonsense', () => {
    expect(parseLocalTime('2026-10-24', 'dusk')).toBeNull();
    expect(parseLocalTime('2026-10-24', '25:00')).toBeNull();
    expect(parseLocalTime('2026-10-24', '12:99')).toBeNull();
  });

  it('round-trips through formatClock', () => {
    for (const t of ['05:30', '12:00', '16:56', '23:59']) {
      expect(formatClock(parseLocalTime('2026-11-05', t))).toBe(t);
    }
  });
});

describe('daysBetweenIso', () => {
  it('counts whole days', () => {
    expect(daysBetweenIso('2026-08-18', '2026-10-21')).toBe(64);
    expect(daysBetweenIso('2026-10-21', '2026-10-21')).toBe(0);
    expect(daysBetweenIso('2026-10-22', '2026-10-21')).toBe(-1);
  });

  it('returns NaN for a malformed date', () => {
    expect(Number.isNaN(daysBetweenIso('not-a-date', '2026-10-21'))).toBe(true);
  });
});

describe('distance formatting', () => {
  it('shows both units', () => {
    expect(formatKmMi(31.4)).toBe('31.4 km / 19.5 mi');
  });

  it('handles nothing available', () => {
    expect(formatKm(null)).toBe('—');
    expect(formatKmMi(undefined)).toBe('—');
    expect(formatKm(Number.NaN)).toBe('—');
  });
});
