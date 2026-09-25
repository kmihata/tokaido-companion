import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SINUOSITY_SUSPECT, checkTrace } from '../../src/lib/traceChecks';
import type { Position } from '../../src/lib/geo';

const WORK = join(process.cwd(), 'route-sources', 'working');

function gpx(file: string): Position[] {
  const xml = readFileSync(join(WORK, file), 'utf8');
  return [...xml.matchAll(/<trkpt[^>]*lat="(-?[\d.]+)"[^>]*lon="(-?[\d.]+)"/g)].map(
    (m) => [Number(m[2]), Number(m[1])] as Position,
  );
}

/** A straight-ish line, standing in for an ordinary traced section. */
function line(n: number): Position[] {
  return Array.from({ length: n }, (_, i) => [138.5 + i * 0.001, 35.0 + i * 0.0005] as Position);
}

describe('checkTrace', () => {
  it('passes an ordinary traced section', () => {
    const r = checkTrace(line(200));
    expect(r.problems).toEqual([]);
    expect(r.sinuosity).toBeLessThan(1.01);
  });

  it('catches a line that goes out and comes back', () => {
    // The Mitsuke failure in miniature: out, then home along the same points.
    const out = line(120);
    const r = checkTrace([...out, ...out.slice(0, -1).reverse()]);
    expect(r.problems.length).toBeGreaterThan(0);
    expect(r.problems.join(' ')).toMatch(/returns to a point it already visited/);
    expect(r.revisitM).not.toBeNull();
  });

  it('flags a trace that finishes where it started', () => {
    const out = line(120);
    const r = checkTrace([...out, ...out.slice(0, -1).reverse()]);
    expect(r.sinuosity).toBeGreaterThan(SINUOSITY_SUSPECT);
    expect(r.problems.join(' ')).toMatch(/finishes close to where it starts/);
  });

  it('does not flag a winding section of old road as an out-and-back', () => {
    // Mitsuke to Tenryugawa runs a sinuosity of about 2.1 because the old road
    // genuinely wanders. The threshold has to leave that alone — a section that
    // merely bends is not a section that doubles back.
    const r = checkTrace(gpx('section-mitsuke-tenryugawa-traced-2026-09-13.gpx'));
    expect(r.sinuosity).toBeGreaterThan(2);
    expect(r.sinuosity).toBeLessThan(SINUOSITY_SUSPECT);
    expect(r.problems.join(' ')).not.toMatch(/finishes close to where it starts/);
  });

  it('surfaces the 423 m tail loop at the Tenryu crossing, which is real', () => {
    // Flagged, looked at, and kept. Kevin verified it in Street View on
    // 2026-09-13: it is an out-and-back to the historic ferry site — where the
    // Tokaido actually went — plus a forced loop under the bridge, because
    // three bridge sections cross there and only one carries a footway, which
    // can only be reached by passing underneath and coming back around.
    //
    // It was first called an artifact on the grounds that the 60-point source
    // line has no such loop. That was bad reasoning: a line sampled at 152 m
    // cannot represent a 423 m feature, so its silence proves nothing. The
    // check is right to raise this and the operator is right to keep it —
    // which is why a flagged file is warned about rather than blocked.
    const r = checkTrace(gpx('section-mitsuke-tenryugawa-traced-2026-09-13.gpx'));
    expect(r.revisitM).toBeGreaterThan(400);
    expect(r.revisitAt![1]).toBe(r.pointCount - 1);
  });

  it('passes every section that was baked into the route', () => {
    // If any of these tripped a check, the check would be wrong: they are all
    // in the shipped route and were each verified by hand.
    for (const f of [
      'section-nihonbashi-shinagawa-traced-2026-08-23.gpx',
      'section-hara-yoshiwara-traced-v2.gpx',
      'section-tenryugawa-hamamatsu-traced-2026-09-13.gpx',
      'section-ejiri-kusanagi-traced-2026-09-13.gpx',
      'section-hatchonawate-kanagawa-traced-2026-09-13.gpx',
      // Mitsuke is deliberately absent: its 423 m tail loop is a genuine
      // feature of the Tenryu crossing and is covered by its own test above.
      // It stays out of this list because the list means "trips nothing", not
      // "is correct" — the two are different and conflating them would cost
      // the check its value.
    ]) {
      expect(checkTrace(gpx(f)).problems, f).toEqual([]);
    }
  });

  it('reports the numbers a person actually wants', () => {
    const r = checkTrace(gpx('section-hatchonawate-kanagawa-traced-2026-09-13.gpx'));
    expect(r.pointCount).toBe(211);
    expect(r.lengthKm).toBeCloseTo(8.63, 1);
    expect(r.meanSpacingM).toBeCloseTo(41, 0);
    expect(r.maxStepM).toBeGreaterThan(0);
  });

  it('refuses a file with nothing in it rather than dividing by zero', () => {
    expect(checkTrace([]).problems.length).toBeGreaterThan(0);
    expect(checkTrace([[138.5, 35.0]]).problems.length).toBeGreaterThan(0);
  });
});
