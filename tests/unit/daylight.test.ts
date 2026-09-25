import { describe, expect, it } from 'vitest';
import { julianDayUTC, sunTimesForIsoDate, sunTimesUTC } from '../../src/lib/daylight';

/** Minutes past midnight in a given IANA zone. */
function minutesInZone(d: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d);
  const h = Number(parts.find((p) => p.type === 'hour')?.value);
  const m = Number(parts.find((p) => p.type === 'minute')?.value);
  return h * 60 + m;
}

describe('julianDayUTC', () => {
  it('matches the standard epoch value for 2000-01-01', () => {
    expect(julianDayUTC(2000, 1, 1)).toBe(2451544.5);
  });

  it('advances by one per day', () => {
    expect(julianDayUTC(2026, 10, 22) - julianDayUTC(2026, 10, 21)).toBe(1);
  });

  it('handles the January/February month shift', () => {
    expect(julianDayUTC(2026, 3, 1) - julianDayUTC(2026, 2, 28)).toBe(1);
  });
});

describe('sunTimesUTC', () => {
  it('gives Seattle about 16 hours of light at the June solstice', () => {
    const s = sunTimesUTC(2026, 6, 21, 47.6062, -122.3321);
    expect(s.dayLengthMinutes).not.toBeNull();
    expect(s.dayLengthMinutes!).toBeGreaterThan(15 * 60 + 50);
    expect(s.dayLengthMinutes!).toBeLessThan(16 * 60 + 5);
  });

  it('gives Tokyo about 11 hours of light on the first walking day', () => {
    const s = sunTimesUTC(2026, 10, 21, 35.6841, 139.7743);
    expect(s.dayLengthMinutes!).toBeGreaterThan(10 * 60 + 45);
    expect(s.dayLengthMinutes!).toBeLessThan(11 * 60 + 15);
  });

  it('puts Tokyo sunset in the 16:30-17:15 window on 21 October, Japan time', () => {
    const s = sunTimesUTC(2026, 10, 21, 35.6841, 139.7743);
    const mins = minutesInZone(s.sunset!, 'Asia/Tokyo');
    expect(mins).toBeGreaterThan(16 * 60 + 30);
    expect(mins).toBeLessThan(17 * 60 + 15);
  });

  it('gives almost the same clock sunset at the start and the end of the route', () => {
    // A genuinely useful field fact, and worth locking down. Walking west, the
    // seasonal loss of evening light between 21 October and 6 November is very
    // nearly cancelled by the four degrees of longitude between Tokyo and
    // Kyoto, which push clock sunset later by about sixteen minutes. Sunset at
    // the finish stays near 17:00 Japan time for the whole route, so the light
    // budget does not quietly shrink underneath the schedule.
    const early = sunTimesUTC(2026, 10, 21, 35.6841, 139.7743);
    const late = sunTimesUTC(2026, 11, 6, 35.0093, 135.7727);
    const earlyMin = minutesInZone(early.sunset!, 'Asia/Tokyo');
    const lateMin = minutesInZone(late.sunset!, 'Asia/Tokyo');
    expect(Math.abs(earlyMin - lateMin)).toBeLessThan(15);
    expect(earlyMin).toBeGreaterThan(16 * 60 + 40);
    expect(lateMin).toBeGreaterThan(16 * 60 + 40);
  });

  it('does lose evening light over the same dates at a fixed longitude', () => {
    const early = sunTimesUTC(2026, 10, 21, 35.0, 137.0);
    const late = sunTimesUTC(2026, 11, 6, 35.0, 137.0);
    const loss = minutesInZone(early.sunset!, 'Asia/Tokyo') - minutesInZone(late.sunset!, 'Asia/Tokyo');
    expect(loss).toBeGreaterThan(10);
    expect(loss).toBeLessThan(30);
  });

  it('puts sunrise before solar noon before sunset', () => {
    const s = sunTimesUTC(2026, 11, 5, 34.877, 136.306);
    expect(s.sunrise!.getTime()).toBeLessThan(s.solarNoon.getTime());
    expect(s.solarNoon.getTime()).toBeLessThan(s.sunset!.getTime());
  });

  it('is roughly twelve hours everywhere at the equinox', () => {
    for (const lat of [-45, -20, 0, 35, 60]) {
      const s = sunTimesUTC(2026, 3, 20, lat, 0);
      expect(Math.abs(s.dayLengthMinutes! - 720)).toBeLessThan(25);
    }
  });

  it('reports polar night rather than inventing a sunrise', () => {
    const s = sunTimesUTC(2026, 12, 21, 80, 0);
    expect(s.sunrise).toBeNull();
    expect(s.sunset).toBeNull();
    expect(s.dayLengthMinutes).toBeNull();
  });
});

describe('sunTimesForIsoDate', () => {
  it('parses an ISO date', () => {
    const a = sunTimesForIsoDate('2026-10-24', 35.126, 138.911);
    const b = sunTimesUTC(2026, 10, 24, 35.126, 138.911);
    expect(a!.sunset!.toISOString()).toBe(b.sunset!.toISOString());
  });

  it('rejects a malformed date', () => {
    expect(sunTimesForIsoDate('24 Oct 2026', 35, 139)).toBeNull();
  });
});
