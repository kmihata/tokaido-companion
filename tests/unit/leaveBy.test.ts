import { describe, expect, it } from 'vitest';
import {
  arriveByFor,
  arrivalIfStarting,
  clampMph,
  computeLeaveBy,
  DEFAULT_ALL_IN_MPH,
  readCutoff,
} from '../../src/lib/leaveBy';

const jst = (iso: string): Date => new Date(`${iso}+09:00`);
const hhmm = (d: Date): string =>
  d.toLocaleTimeString('en-GB', { timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit' });

describe('computeLeaveBy', () => {
  it('works back from the arrive-by time, Walk 2 as planned on 2026-10-21', () => {
    // 31.6 km at 2.5 mph all-in is 7h 51m; arrive 16:14; 45 min of train.
    const r = computeLeaveBy({
      distanceKm: 31.6,
      allInMph: 2.5,
      arriveBy: jst('2026-10-22T16:14:00'),
      travelMinutes: 45,
    })!;
    expect(r.walkMinutes).toBeCloseTo(471.2, 0);
    expect(hhmm(r.startWalkingAt)).toBe('08:22');
    expect(hhmm(r.leaveAt)).toBe('07:37');
  });

  it('leaves from the door when there is no travel', () => {
    const r = computeLeaveBy({ distanceKm: 10, allInMph: 3, arriveBy: jst('2026-10-22T12:00:00'), travelMinutes: 0 })!;
    expect(r.leaveAt.getTime()).toBe(r.startWalkingAt.getTime());
  });

  it('refuses nonsense', () => {
    const at = jst('2026-10-22T12:00:00');
    expect(computeLeaveBy({ distanceKm: 0, allInMph: 3, arriveBy: at, travelMinutes: 0 })).toBeNull();
    expect(computeLeaveBy({ distanceKm: 10, allInMph: 0, arriveBy: at, travelMinutes: 0 })).toBeNull();
  });
});

describe('arrivalIfStarting', () => {
  it('is the inverse of computeLeaveBy', () => {
    const arriveBy = jst('2026-10-22T16:14:00');
    const r = computeLeaveBy({ distanceKm: 31.6, allInMph: 2.75, arriveBy, travelMinutes: 0 })!;
    expect(arrivalIfStarting(r.startWalkingAt, 31.6, 2.75)!.getTime()).toBeCloseTo(arriveBy.getTime(), -3);
  });
});

describe('clampMph', () => {
  it('snaps to quarter steps inside a sane range', () => {
    expect(clampMph(2.8)).toBe(2.75);
    expect(clampMph(0.5)).toBe(1.5);
    expect(clampMph(9)).toBe(4);
    expect(clampMph(DEFAULT_ALL_IN_MPH)).toBe(2.75);
  });
});

describe('readCutoff', () => {
  it('reads an early-morning hour as overnight, not afternoon', () => {
    // KOKO STAY Shonan Fujisawa: "Check-in time ends at 4:00 AM".
    const c = readCutoff('04:00');
    expect(c.label).toBe('4:00 a.m. (overnight)');
    expect(c.sameDayMinutes).toBeNull();
  });
  it('reads an evening hour as a same-day limit', () => {
    expect(readCutoff('21:00')).toEqual({ label: '9:00 p.m.', sameDayMinutes: 1260, known: true });
    expect(readCutoff('23:00').label).toBe('11:00 p.m.');
  });
  it('keeps unknown apart from unlimited', () => {
    expect(readCutoff('not stated').known).toBe(false);
    expect(readCutoff('any time')).toEqual({ label: 'any time', sameDayMinutes: null, known: true });
    expect(readCutoff('midnight').sameDayMinutes).toBe(1440);
  });
});

describe('arriveByFor', () => {
  const sunset = jst('2026-10-22T16:59:00');
  it('uses sunset minus the buffer by default', () => {
    const r = arriveByFor(sunset, 45, readCutoff('04:00'), '2026-10-22')!;
    expect(r.reason).toBe('sunset');
    expect(hhmm(r.at)).toBe('16:14');
  });
  it('uses a same-day check-in cut-off when it comes first', () => {
    const r = arriveByFor(sunset, 45, readCutoff('15:00'), '2026-10-22')!;
    expect(r.reason).toBe('check-in');
    expect(hhmm(r.at)).toBe('14:15');
  });
  it('ignores an evening cut-off that falls after sunset', () => {
    expect(arriveByFor(sunset, 45, readCutoff('21:00'), '2026-10-22')!.reason).toBe('sunset');
  });
});
