import { describe, expect, it } from 'vitest';
import {
  etaFor,
  formatDuration,
  isPlausiblePace,
  minutesBetween,
  minutesFor,
  paceKmh,
} from '../../src/lib/pace';

describe('paceKmh', () => {
  it('computes an ordinary walking pace', () => {
    expect(paceKmh(20, 300)).toBeCloseTo(4, 9);
  });

  it('rejects zero or negative elapsed time', () => {
    expect(paceKmh(10, 0)).toBeNull();
    expect(paceKmh(10, -30)).toBeNull();
  });

  it('rejects negative distance and non-finite input', () => {
    expect(paceKmh(-1, 60)).toBeNull();
    expect(paceKmh(Number.NaN, 60)).toBeNull();
    expect(paceKmh(10, Number.POSITIVE_INFINITY)).toBeNull();
  });
});

describe('minutesFor', () => {
  it('inverts paceKmh', () => {
    expect(minutesFor(20, 4)).toBeCloseTo(300, 9);
  });

  it('returns null for an unusable pace', () => {
    expect(minutesFor(20, null)).toBeNull();
    expect(minutesFor(20, 0)).toBeNull();
    expect(minutesFor(20, -3)).toBeNull();
  });

  it('returns zero for zero distance', () => {
    expect(minutesFor(0, 4)).toBe(0);
  });
});

describe('etaFor', () => {
  it('adds the travel time to the start instant', () => {
    const start = new Date('2026-10-24T05:00:00Z');
    const eta = etaFor(start, 12, 4);
    expect(eta!.toISOString()).toBe('2026-10-24T08:00:00.000Z');
  });

  it('is null without a pace', () => {
    expect(etaFor(new Date(), 12, null)).toBeNull();
  });
});

describe('isPlausiblePace', () => {
  it('accepts realistic loaded-walking paces', () => {
    expect(isPlausiblePace(3.5)).toBe(true);
    expect(isPlausiblePace(5)).toBe(true);
  });

  it('rejects a crawl, a sprint, and nothing at all', () => {
    expect(isPlausiblePace(0.4)).toBe(false);
    expect(isPlausiblePace(25)).toBe(false);
    expect(isPlausiblePace(null)).toBe(false);
  });
});

describe('minutesBetween', () => {
  it('is positive forwards and negative backwards', () => {
    const a = new Date('2026-10-24T05:00:00Z');
    const b = new Date('2026-10-24T06:30:00Z');
    expect(minutesBetween(a, b)).toBe(90);
    expect(minutesBetween(b, a)).toBe(-90);
  });
});

describe('formatDuration', () => {
  it('formats hours and minutes', () => {
    expect(formatDuration(260)).toBe('4h 20m');
    expect(formatDuration(45)).toBe('45m');
    expect(formatDuration(0)).toBe('0m');
  });

  it('keeps the sign on a negative margin, which is the case that matters', () => {
    expect(formatDuration(-15)).toBe('-15m');
    expect(formatDuration(-95)).toBe('-1h 35m');
  });

  it('renders nothing available as an em dash rather than NaN', () => {
    expect(formatDuration(null)).toBe('—');
    expect(formatDuration(Number.NaN)).toBe('—');
  });
});
