import { describe, expect, it } from 'vitest';
import {
  buildLodgingViews,
  formatCountdown,
  resolveDeadline,
  stakesOfRouteChange,
  urgencyOf,
} from '../../src/lib/lodging';
import type { PrivateLodging } from '../../src/data/privateSchema';

const stay = (over: Partial<PrivateLodging> = {}): PrivateLodging => ({
  id: 'l-1',
  dayId: null,
  name: 'Test stay',
  address: '',
  phone: '',
  checkIn: null,
  checkOut: null,
  lat: null,
  lon: null,
  cancellationDeadline: null,
  cancellationDeadlineIso: null,
  laterExposure: '',
  bookingSource: '',
  paymentState: '',
  railNotes: '',
  notes: '',
  ...over,
});

describe('resolving a cancellation deadline', () => {
  it('prefers the exact instant over the date', () => {
    const d = resolveDeadline(
      stay({ cancellationDeadline: '2026-10-16', cancellationDeadlineIso: '2026-10-16T09:00:00+09:00' }),
      new Date('2026-10-15T00:00:00Z'),
    );
    expect(d.precision).toBe('exact');
    expect(d.at?.toISOString()).toBe('2026-10-16T00:00:00.000Z');
  });

  /**
   * The direction of this error is the point. Reading a bare date as UTC
   * midnight would move a Japanese deadline nine hours earlier and could
   * report a live booking as closed — which would stop Kevin looking at the
   * one thing he still had time to change.
   */
  it('reads a date-only deadline as the end of that day in Japan, not UTC', () => {
    const d = resolveDeadline(stay({ cancellationDeadline: '2026-10-16' }), new Date('2026-10-16T12:00:00Z'));
    expect(d.precision).toBe('date-only');
    // 23:59:59+09:00 on the 16th is 14:59:59Z on the 16th — still open at noon UTC.
    expect(d.passed).toBe(false);
    expect(d.at?.toISOString().startsWith('2026-10-16T14:59')).toBe(true);
  });

  it('reports no deadline rather than inventing one', () => {
    const d = resolveDeadline(stay(), new Date('2026-10-16T00:00:00Z'));
    expect(d.precision).toBe('none');
    expect(d.msRemaining).toBeNull();
    expect(d.passed).toBe(false);
  });

  it('knows when a window has closed', () => {
    const d = resolveDeadline(
      stay({ cancellationDeadlineIso: '2026-10-16T23:59:00+09:00' }),
      new Date('2026-10-17T06:00:00Z'),
    );
    expect(d.passed).toBe(true);
    expect(d.msRemaining!).toBeLessThan(0);
  });
});

describe('the countdown', () => {
  it('is coarse in days and precise inside a day', () => {
    expect(formatCountdown(4 * 86_400_000)).toBe('4 days left');
    expect(formatCountdown(5 * 3_600_000)).toBe('5 hours left');
    expect(formatCountdown(90_000)).toBe('1 minute left');
    expect(formatCountdown(null)).toBe('no deadline recorded');
  });

  it('says plainly when it has passed', () => {
    expect(formatCountdown(-2 * 86_400_000)).toBe('closed 2 days ago');
    expect(formatCountdown(-3 * 3_600_000)).toBe('closed 3 hours ago');
  });
});

describe('ordering and stakes', () => {
  const now = new Date('2026-10-14T00:00:00Z');
  const views = buildLodgingViews(
    [
      stay({ id: 'far', name: 'Far', cancellationDeadlineIso: '2026-11-04T00:00:00+09:00' }),
      stay({ id: 'none', name: 'Unrecorded' }),
      stay({ id: 'past', name: 'Past', cancellationDeadlineIso: '2026-10-10T00:00:00+09:00' }),
      stay({ id: 'soon', name: 'Soon', cancellationDeadlineIso: '2026-10-15T00:00:00+09:00' }),
    ],
    now,
  );

  it('puts the soonest live deadline first and sinks the dead ones', () => {
    expect(views.map((v) => v.lodging.id)).toEqual(['soon', 'far', 'past', 'none']);
  });

  it('bands urgency', () => {
    expect(urgencyOf(views[0]!.deadline)).toBe('today');
    expect(urgencyOf(views[1]!.deadline)).toBe('open');
    expect(urgencyOf(views[2]!.deadline)).toBe('passed');
    expect(urgencyOf(views[3]!.deadline)).toBe('open');
  });

  /**
   * A booking past its free window is not a free option any more, however far
   * off the night is. Listing it separately is the part that is easy to miss
   * when deciding whether to move a day.
   */
  it('separates what is closing from what is already locked', () => {
    const s = stakesOfRouteChange(views);
    expect(s.closingFirst.map((v) => v.lodging.id)).toEqual(['soon']);
    expect(s.alreadyLocked.map((v) => v.lodging.id)).toEqual(['past']);
  });
});

describe('distance to the route', () => {
  const line = [
    [139.0, 35.0],
    [139.01, 35.0],
  ] as const;

  /**
   * The vertices here are 912 m apart, and the stay sits beside the line
   * midway between them. Measuring vertex-to-vertex reports 455 m; the honest
   * answer is nearly zero. The route still has sections sampled at 80–99 m and
   * bridges that are one 700 m step, so this is not a contrived case — it is
   * where the hotels are.
   */
  it('measures to the line, not to the nearest vertex', () => {
    const [v] = buildLodgingViews([stay({ lat: 35.0, lon: 139.005 })], new Date(), line);
    expect(v!.distanceKm!).toBeLessThan(0.02);
  });

  it('measures perpendicular offset from the line', () => {
    const [v] = buildLodgingViews([stay({ lat: 35.0018, lon: 139.005 })], new Date(), line);
    expect(v!.distanceKm!).toBeGreaterThan(0.15);
    expect(v!.distanceKm!).toBeLessThan(0.25);
  });

  it('is null without coordinates', () => {
    const [v] = buildLodgingViews([stay()], new Date(), line);
    expect(v!.distanceKm).toBeNull();
  });
});
