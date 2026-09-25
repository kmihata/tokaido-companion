import { describe, expect, it } from 'vitest';
import { DEFAULT_SAFETY_BUFFER_MINUTES, evaluateDecision } from '../../src/lib/decision';
import type { DecisionInput } from '../../src/lib/decision';

const NOON = new Date('2026-10-24T03:00:00Z'); // 12:00 Japan time

function input(patch: Partial<DecisionInput> = {}): DecisionInput {
  return {
    now: NOON,
    plannedDistanceKm: 31.4,
    completedKm: 15,
    paceKmh: 4,
    daylightDeadline: new Date('2026-10-24T07:56:00Z'), // ~16:56 Japan time
    nextBailout: { id: 'wp-x', title: 'Test Station', distanceKm: 3 },
    hotelDistanceKm: 1.2,
    tomorrowBaselineKm: 38.7,
    ...patch,
  };
}

describe('evaluateDecision — arithmetic', () => {
  it('computes remaining distance and completion fraction', () => {
    const r = evaluateDecision(input());
    expect(r.remainingKm).toBeCloseTo(16.4, 9);
    expect(r.completedFraction).toBeCloseTo(15 / 31.4, 9);
  });

  it('never reports negative remaining distance when overshooting the plan', () => {
    const r = evaluateDecision(input({ completedKm: 40 }));
    expect(r.remainingKm).toBe(0);
    expect(r.completedFraction).toBe(1);
  });

  it('computes time to finish and an ETA at the entered pace', () => {
    const r = evaluateDecision(input());
    expect(r.minutesToFinish).toBeCloseTo(246, 0);
    expect(r.etaFinish!.toISOString()).toBe('2026-10-24T07:06:00.000Z');
  });

  it('adds the hotel distance to the hotel ETA', () => {
    const r = evaluateDecision(input());
    expect(r.etaHotel!.getTime()).toBeGreaterThan(r.etaFinish!.getTime());
    expect((r.etaHotel!.getTime() - r.etaFinish!.getTime()) / 60_000).toBeCloseTo((1.2 / 4) * 60, 6);
  });

  it('subtracts the safety buffer from the finish margin', () => {
    const r = evaluateDecision(input({ safetyBufferMinutes: 45 }));
    // 296 minutes of daylight, 246 to walk, 45 buffer.
    expect(r.finishMarginMinutes).toBeCloseTo(296 - 246 - 45, 0);
  });

  it('uses a 45-minute buffer by default', () => {
    const withDefault = evaluateDecision(input());
    const withExplicit = evaluateDecision(input({ safetyBufferMinutes: DEFAULT_SAFETY_BUFFER_MINUTES }));
    expect(withDefault.finishMarginMinutes).toBe(withExplicit.finishMarginMinutes);
  });
});

describe('evaluateDecision — stopping here', () => {
  it('moves the remaining distance to tomorrow', () => {
    const r = evaluateDecision(input());
    expect(r.deferredKm).toBeCloseTo(16.4, 9);
    expect(r.tomorrowIfStopNowKm).toBeCloseTo(38.7 + 16.4, 9);
  });

  it('leaves tomorrow unknown when the baseline is unknown', () => {
    const r = evaluateDecision(input({ tomorrowBaselineKm: null }));
    expect(r.tomorrowIfStopNowKm).toBeNull();
    expect(r.warnings.join(' ')).toMatch(/baseline/i);
  });
});

describe('evaluateDecision — bailout', () => {
  it('computes time and margin to the bailout', () => {
    const r = evaluateDecision(input());
    expect(r.bailout!.minutes).toBeCloseTo(45, 0);
    expect(r.bailout!.marginMinutes).toBeCloseTo(296 - 45 - 45, 0);
  });

  it('flags a last exit before a thin stretch', () => {
    const r = evaluateDecision(
      input({ nextBailout: { id: 'w', title: 'Seki Station', distanceKm: 2, moreBeyond: false } }),
    );
    expect(r.reasons.join(' ')).toMatch(/last exit/i);
  });

  it('warns when no bailout is loaded', () => {
    const r = evaluateDecision(input({ nextBailout: null }));
    expect(r.bailout).toBeNull();
    expect(r.warnings.join(' ')).toMatch(/bailout/i);
  });
});

describe('evaluateDecision — posture', () => {
  it('says continue with plenty of light', () => {
    const r = evaluateDecision(input({ completedKm: 28, plannedDistanceKm: 31.4 }));
    expect(r.posture).toBe('continue');
  });

  it('says reassess when the margin is under an hour', () => {
    // 16.4 km left at 4 km/h is 246 min; deadline 300 min out; 45 buffer
    // leaves 9 minutes of margin.
    const r = evaluateDecision(input({ daylightDeadline: new Date('2026-10-24T08:00:00Z') }));
    expect(r.finishMarginMinutes).toBeGreaterThanOrEqual(0);
    expect(r.finishMarginMinutes).toBeLessThan(60);
    expect(r.posture).toBe('reassess');
  });

  it('says stop when the finish runs past the deadline', () => {
    const r = evaluateDecision(input({ daylightDeadline: new Date('2026-10-24T06:00:00Z') }));
    expect(r.posture).toBe('stop');
    expect(r.reasons.join(' ')).toMatch(/buffer/i);
  });

  it('says stop when even the next exit is past the deadline', () => {
    const r = evaluateDecision(
      input({
        plannedDistanceKm: 16,
        completedKm: 15.9,
        nextBailout: { id: 'w', title: 'Far Station', distanceKm: 30 },
        daylightDeadline: new Date('2026-10-24T05:00:00Z'),
      }),
    );
    expect(r.posture).toBe('stop');
    expect(r.reasons.join(' ')).toMatch(/Far Station/);
  });

  it('refuses to guess without a pace', () => {
    const r = evaluateDecision(input({ paceKmh: null }));
    expect(r.posture).toBe('insufficient-data');
    expect(r.minutesToFinish).toBeNull();
    expect(r.warnings.join(' ')).toMatch(/no pace/i);
  });

  it('refuses to guess without a daylight deadline', () => {
    const r = evaluateDecision(input({ daylightDeadline: null }));
    expect(r.posture).toBe('insufficient-data');
    expect(r.warnings.join(' ')).toMatch(/daylight deadline/i);
  });

  it('suppresses times for an implausible pace rather than trusting a typo', () => {
    const r = evaluateDecision(input({ paceKmh: 40 }));
    expect(r.posture).toBe('insufficient-data');
    expect(r.etaFinish).toBeNull();
    expect(r.warnings.join(' ')).toMatch(/plausible range/i);
  });

  it('says continue once the planned distance is complete', () => {
    const r = evaluateDecision(input({ completedKm: 31.4 }));
    expect(r.posture).toBe('continue');
    expect(r.reasons.join(' ')).toMatch(/already complete/i);
  });

  it('notes when the deadline has already passed', () => {
    const r = evaluateDecision(input({ now: new Date('2026-10-24T09:00:00Z') }));
    expect(r.daylightRemainingMinutes!).toBeLessThan(0);
    expect(r.reasons.join(' ')).toMatch(/already passed/i);
    expect(r.posture).toBe('stop');
  });

  it('never returns a posture without at least one stated reason', () => {
    for (const patch of [
      {},
      { paceKmh: null },
      { daylightDeadline: null },
      { completedKm: 31.4 },
      { daylightDeadline: new Date('2026-10-24T04:00:00Z') },
    ] as Partial<DecisionInput>[]) {
      expect(evaluateDecision(input(patch)).reasons.length).toBeGreaterThan(0);
    }
  });
});
