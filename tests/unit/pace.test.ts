import { describe, expect, it } from 'vitest';
import {
  etaFor,
  formatDuration,
  isPlausiblePace,
  minutesBetween,
  minutesFor,
  paceKmh,
  walkingTimeLeft,
  KM_PER_MILE,
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

describe('walking time left along the path', () => {
  it('measures the gap to the day finish and converts at 3.0 mph', () => {
    const r = walkingTimeLeft(10, 25)!;
    expect(r.remainingKm).toBeCloseTo(15, 6);
    expect(r.remainingMi).toBeCloseTo(9.3206, 3);
    // 15 km at 3.0 mph (4.828032 km/h) = 3.1067 h = 186.4 min
    expect(r.movingMinutes).toBeCloseTo(186.4, 1);
    expect(r.pastFinish).toBe(false);
  });

  it('clamps to zero once past the finish rather than reporting negative distance', () => {
    const r = walkingTimeLeft(30, 25)!;
    expect(r.remainingKm).toBe(0);
    expect(r.movingMinutes).toBe(0);
    expect(r.pastFinish).toBe(true);
  });

  it('treats landing exactly on the finish as past it', () => {
    expect(walkingTimeLeft(25, 25)!.pastFinish).toBe(true);
  });

  it('honours a pace other than the default', () => {
    const slow = walkingTimeLeft(0, 10, 2)!;
    const fast = walkingTimeLeft(0, 10, 4)!;
    expect(slow.movingMinutes).toBeCloseTo(fast.movingMinutes * 2, 6);
  });

  it('returns null rather than a wrong number for unusable input', () => {
    expect(walkingTimeLeft(Number.NaN, 25)).toBeNull();
    expect(walkingTimeLeft(10, Number.NaN)).toBeNull();
    expect(walkingTimeLeft(10, 25, 0)).toBeNull();
    expect(walkingTimeLeft(10, 25, -3)).toBeNull();
    expect(walkingTimeLeft(10, 25, Number.POSITIVE_INFINITY)).toBeNull();
  });

  /**
   * The honesty check. 3.0 mph MOVING is slower than Kevin's own measured
   * 3.08 mph INCLUDING stops on 2026-10-06, so for a real day's distance the
   * figure must come out longer than that day actually took. If this ever
   * flips, the number has started predicting arrival instead of flooring it,
   * and the label on screen would become a lie.
   */
  it('errs long against the measured 2026-10-06 walk, which is the safe direction', () => {
    const oct6Mi = 14.29;
    const r = walkingTimeLeft(0, oct6Mi * KM_PER_MILE)!;
    const actualElapsedMinutes = 4 * 60 + 38 + 38 / 60;
    expect(r.movingMinutes).toBeGreaterThan(actualElapsedMinutes);
  });
});
