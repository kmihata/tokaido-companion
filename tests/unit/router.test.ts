import { describe, expect, it } from 'vitest';
import { href, parseHash } from '../../src/router';

describe('parseHash', () => {
  it('treats an empty hash as Today', () => {
    for (const h of ['', '#', '#/']) {
      expect(parseHash(h).name).toBe('today');
    }
  });

  it('parses the flat routes', () => {
    expect(parseHash('#/decide').name).toBe('decide');
    expect(parseHash('#/map').name).toBe('map');
    expect(parseHash('#/capture').name).toBe('capture');
    expect(parseHash('#/more').name).toBe('more');
    expect(parseHash('#/offline').name).toBe('offline');
    expect(parseHash('#/settings').name).toBe('settings');
    expect(parseHash('#/about').name).toBe('about');
  });

  it('parses parameterised routes', () => {
    expect(parseHash('#/day/d-2026-10-24')).toMatchObject({ name: 'day', param: 'd-2026-10-24' });
    expect(parseHash('#/place/wp-rail-seki')).toMatchObject({ name: 'place', param: 'wp-rail-seki' });
    expect(parseHash('#/map/wp-rail-seki')).toMatchObject({ name: 'map', param: 'wp-rail-seki' });
  });

  it('falls back to the list when a parameterised route has no parameter', () => {
    expect(parseHash('#/day').name).toBe('days');
    expect(parseHash('#/place').name).toBe('places');
  });

  it('tolerates trailing and doubled slashes', () => {
    expect(parseHash('#/settings/').name).toBe('settings');
    expect(parseHash('#//day//d-1')).toMatchObject({ name: 'day', param: 'd-1' });
  });

  it('returns not-found for anything unrecognised', () => {
    expect(parseHash('#/admin').name).toBe('not-found');
  });
});

describe('href', () => {
  it('always produces a relative hash link, never an absolute path', () => {
    expect(href('/decide')).toBe('#/decide');
    expect(href('decide')).toBe('#/decide');
    expect(href('/day/d-1')).toBe('#/day/d-1');
    for (const p of ['/', '/map', 'place/x']) {
      expect(href(p).startsWith('#')).toBe(true);
    }
  });
});
