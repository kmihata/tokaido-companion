import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../../src/state/settings';

/**
 * The position override is a rehearsal aid, and the danger it carries is that
 * a pretend position could be mistaken for a real one — at dusk, on a pass,
 * with a decision to make. Everything here is about that being impossible.
 */
describe('the position override', () => {
  it('is off by default, so the field build never pretends', () => {
    expect(DEFAULT_SETTINGS.positionOverride).toBeNull();
  });

  it('parses a pasted "lat, lon" pair and rejects anything outside the globe', () => {
    // Same expression the Settings field uses. Kept here so a change to the
    // parser has to face these cases.
    const parse = (t: string): { lat: number; lon: number } | null => {
      const m = /^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/.exec(t.trim());
      if (!m) return null;
      const lat = Number(m[1]);
      const lon = Number(m[2]);
      const ok = lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
      return ok ? { lat, lon } : null;
    };
    expect(parse('34.8300, 138.1742')).toEqual({ lat: 34.83, lon: 138.1742 });
    expect(parse('  -33.9,18.4  ')).toEqual({ lat: -33.9, lon: 18.4 });
    expect(parse('91, 0')).toBeNull();
    expect(parse('0, 181')).toBeNull();
    expect(parse('34.83')).toBeNull();
    expect(parse('Shimada')).toBeNull();
    expect(parse('')).toBeNull();
  });
});
