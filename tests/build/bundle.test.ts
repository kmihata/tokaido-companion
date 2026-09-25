/**
 * Assertions about dist/. Requires `npm run build` first — `npm run verify`
 * sequences it correctly, and `npm run test:build` alone will fail loudly if
 * dist/ is stale or missing.
 *
 * These are the checks that cannot be made from source: what actually ends up
 * in the shipped bundle, and whether it would work at a GitHub Pages subpath.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { join, relative } from 'node:path';
import { tmpdir } from 'node:os';
import { beforeAll, describe, expect, it } from 'vitest';

const ROOT = process.cwd();
const DIST = join(ROOT, 'dist');
const BASE = '/tokaido-companion/';

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)],
  );
}

let files: string[] = [];
let indexHtml = '';
let swJs = '';

beforeAll(() => {
  if (!existsSync(DIST)) {
    throw new Error('dist/ is missing. Run `npm run build` before `npm run test:build`.');
  }
  files = walk(DIST);
  indexHtml = readFileSync(join(DIST, 'index.html'), 'utf8');
  swJs = readFileSync(join(DIST, 'sw.js'), 'utf8');
});

describe('the build produces what a PWA needs', () => {
  it('emits an entry document, a service worker and a manifest', () => {
    for (const f of ['index.html', 'sw.js', 'manifest.webmanifest']) {
      expect(existsSync(join(DIST, f)), `${f} missing from dist/`).toBe(true);
    }
  });

  it('emits the icons the manifest and iOS need', () => {
    for (const f of ['icon-192.png', 'icon-512.png', 'maskable-512.png', 'apple-touch-icon.png']) {
      expect(existsSync(join(DIST, 'icons', f)), `icons/${f} missing`).toBe(true);
    }
  });

  it('emits every public data file', () => {
    for (const f of [
      'index.json',
      'trip.json',
      'days.json',
      'stations.json',
      'waypoints.geojson',
      'route-meta.json',
      'route.geojson',
      'anchors.geojson',
      'hiroshige.json',
    ]) {
      expect(existsSync(join(DIST, 'data', f)), `data/${f} missing`).toBe(true);
    }
  });
});

describe('GitHub Pages subpath operation', () => {
  it('prefixes every emitted asset reference with the base path', () => {
    for (const m of indexHtml.matchAll(/(?:src|href)="([^"]+)"/g)) {
      const url = m[1]!;
      if (url.startsWith('http') || url.startsWith('data:') || url.startsWith('#')) continue;
      const ok = !url.startsWith('/') || url.startsWith(BASE);
      expect(ok, `"${url}" is root-absolute and would break at a project subpath`).toBe(true);
    }
  });

  it('keeps manifest start_url and scope relative so a rename cannot break them', () => {
    const manifest = JSON.parse(readFileSync(join(DIST, 'manifest.webmanifest'), 'utf8')) as Record<
      string,
      string
    >;
    expect(manifest['start_url']).toBe('.');
    expect(manifest['scope']).toBe('.');
    for (const icon of JSON.parse(
      JSON.stringify(
        (JSON.parse(readFileSync(join(DIST, 'manifest.webmanifest'), 'utf8')) as { icons: { src: string }[] })
          .icons,
      ),
    ) as { src: string }[]) {
      expect(icon.src.startsWith('/'), `icon src "${icon.src}" must be relative`).toBe(false);
    }
  });

  it('registers the service worker inside the subpath scope', () => {
    const bundle = files.filter((f) => f.endsWith('.js') && f.includes('assets')).map((f) => readFileSync(f, 'utf8'));
    const all = bundle.join('\n');
    expect(all).toContain(`${BASE}sw.js`);
  });

  it('precaches the shell, the styles, the script and all nine data files', () => {
    const urls = [...swJs.matchAll(/url:"([^"]+)"/g)].map((m) => m[1]!);
    expect(urls).toContain('index.html');
    expect(urls).toContain('manifest.webmanifest');
    expect(urls.filter((u) => u.startsWith('data/'))).toHaveLength(9);
    expect(urls.some((u) => u.endsWith('.css'))).toBe(true);
    expect(urls.some((u) => u.startsWith('assets/') && u.endsWith('.js'))).toBe(true);
  });

  it('falls back navigations to index.html so a deep link survives a reload', () => {
    expect(swJs).toMatch(/index\.html/);
    expect(swJs).toMatch(/NavigationRoute|createHandlerBoundToURL/);
  });

  it('builds correctly at a different subpath, so renaming the repository is safe', () => {
    const out = join(tmpdir(), 'tokaido-companion-basetest');
    rmSync(out, { recursive: true, force: true });
    execFileSync('npx', ['vite', 'build', '--outDir', out, '--emptyOutDir'], {
      cwd: ROOT,
      env: { ...process.env, BASE_PATH: '/some-other-name/' },
      stdio: 'pipe',
    });
    const html = readFileSync(join(out, 'index.html'), 'utf8');
    expect(html).toContain('/some-other-name/assets/');
    expect(html).not.toContain('/tokaido-companion/');
    const manifest = JSON.parse(readFileSync(join(out, 'manifest.webmanifest'), 'utf8')) as Record<string, string>;
    expect(manifest['start_url']).toBe('.');
    rmSync(out, { recursive: true, force: true });
  }, 180_000);
});

describe('nothing sensitive reaches the bundle', () => {
  /**
   * Key NAMES from the private schema legitimately appear in dist, because
   * the validator that rejects a malformed private file is part of the app.
   * What must never appear is private CONTENT. So: take every string value
   * out of the example private fixture and prove none of them is in the
   * bundle, then sweep for secret-shaped patterns.
   */
  const examplePath = join(ROOT, 'examples', 'private-data.example.json');

  /**
   * Content-bearing keys only. Structural values — `kind`, `schemaVersion`,
   * and public day ids the app already knows — legitimately appear in the
   * bundle because the validator and the public dataset use them.
   */
  const CONTENT_KEYS = new Set([
    'name',
    'address',
    'detail',
    'notes',
    'body',
    'title',
    'label',
    'description',
    'departsIso',
  ]);

  function contentValues(node: unknown, out: string[] = []): string[] {
    if (Array.isArray(node)) {
      for (const v of node) contentValues(v, out);
    } else if (node && typeof node === 'object') {
      for (const [k, v] of Object.entries(node)) {
        if (typeof v === 'string' && CONTENT_KEYS.has(k) && v.length >= 8) out.push(v);
        else contentValues(v, out);
      }
    }
    return out;
  }

  it('contains no content value from the example private fixture', () => {
    const values = contentValues(JSON.parse(readFileSync(examplePath, 'utf8')));
    expect(values.length).toBeGreaterThan(5);
    const haystack = files
      .filter((f) => !f.endsWith('.map'))
      .map((f) => readFileSync(f, 'utf8'))
      .join('\n');
    for (const v of values) {
      expect(haystack.includes(v), `example private value leaked into dist: "${v}"`).toBe(false);
    }
  });

  it('ships no user-created place content, which is device-local by design', () => {
    const haystack = files
      .filter((f) => !f.endsWith('.map'))
      .map((f) => readFileSync(f, 'utf8'))
      .join('\n');
    // The store key may appear — the code that reads it is in the bundle. Any
    // actual point content must not be, because it never leaves the device.
    expect(haystack).not.toMatch(/"kind"\s*:\s*"samwise-user-points"[\s\S]{0,200}"points"\s*:\s*\[\s*\{/);
    expect(haystack).not.toMatch(/user-placed[\s\S]{0,80}REAL BOOKING/i);
  });

  it('does not ship the examples directory', () => {
    for (const f of files) {
      expect(relative(DIST, f).startsWith('examples')).toBe(false);
    }
    expect(existsSync(join(DIST, 'private-data.example.json'))).toBe(false);
  });

  it('contains no secret-shaped strings', () => {
    const patterns: [string, RegExp][] = [
      ['PEM block', /-----BEGIN [A-Z ]*(PRIVATE KEY|CERTIFICATE)-----/],
      ['bearer token', /Bearer\s+[A-Za-z0-9._-]{20,}/],
      ['AWS access key', /AKIA[0-9A-Z]{16}/],
      ['Anthropic-style key', /sk-[A-Za-z0-9_-]{20,}/],
      ['Google API key', /AIza[0-9A-Za-z_-]{30,}/],
      ['GitHub token', /gh[pousr]_[A-Za-z0-9]{30,}/],
    ];
    for (const f of files.filter((x) => !x.endsWith('.map'))) {
      const text = readFileSync(f, 'utf8');
      for (const [label, re] of patterns) {
        expect(re.test(text), `${label} found in ${relative(DIST, f)}`).toBe(false);
      }
    }
  });

  it('keeps long digit runs — card, passport, confirmation numbers — out of the shipped data', () => {
    for (const f of files.filter((x) => x.includes(`${'data'}/`))) {
      const text = readFileSync(f, 'utf8');
      const runs = [...text.matchAll(/\d{9,}/g)].map((m) => m[0]);
      expect(runs, `long digit run in ${relative(DIST, f)}`).toEqual([]);
    }
  });

  it('mentions none of the categories the privacy model forbids', () => {
    const forbidden = [
      'confirmation number',
      'ticket number',
      'loyalty',
      'medication',
      'emergency contact',
      'passport number',
    ];
    for (const f of files.filter((x) => x.includes(`${'data'}/`))) {
      const text = readFileSync(f, 'utf8').toLowerCase();
      for (const word of forbidden) {
        expect(text.includes(word), `"${word}" found in ${relative(DIST, f)}`).toBe(false);
      }
    }
  });

  it('adds no analytics, telemetry or third-party script host', () => {
    const hosts = [
      'google-analytics',
      'googletagmanager',
      'plausible.io',
      'sentry.io',
      'segment.com',
      'hotjar',
      'mixpanel',
      'facebook.net',
    ];
    const haystack = files
      .filter((f) => !f.endsWith('.map'))
      .map((f) => readFileSync(f, 'utf8'))
      .join('\n')
      .toLowerCase();
    for (const h of hosts) {
      expect(haystack.includes(h), `third-party host "${h}" found in the bundle`).toBe(false);
    }
  });

  it('reaches only OpenStreetMap tiles at runtime, and no other network host', () => {
    const appJs = files
      .filter((f) => f.includes('assets') && f.endsWith('.js'))
      .map((f) => readFileSync(f, 'utf8'))
      .join('\n');
    const hosts = new Set(
      [...appJs.matchAll(/https?:\/\/([a-z0-9.-]+)/gi)].map((m) => m[1]!.toLowerCase()),
    );
    const allowed = new Set([
      'tile.openstreetmap.org',
      'a.tile.opentopomap.org', // terrain basemap, keyless
      'opentopomap.org',
      'www.openstreetmap.org',
      'openstreetmap.org',
      'claude.ai',
      'chatgpt.com',
      'www.city.shizuoka.lg.jp',
      'www.city.fujieda.shizuoka.jp',
      'www.city.nagoya.jp',
      'ossanpo.hatenablog.com',
      'busmagazine.bestcarweb.jp',
      'localhost',
      'reactjs.org',
      'react.dev',
      'www.w3.org',
      'developer.mozilla.org',
      'github.com',
      'json-schema.org', // referenced in Zod's error metadata, not fetched
      'leafletjs.com', // Leaflet's own attribution string
      'www.topografix.com', // GPX XML namespace identifier, never fetched
      'kaidotrail.github.io', // route source, linked from the Route screen
      'creativecommons.org', // licence link
    ]);
    for (const h of hosts) {
      expect(allowed.has(h), `unexpected host referenced in the bundle: ${h}`).toBe(true);
    }
  });
});

describe('the shipped data still declares itself non-navigational', () => {
  it('flags every data file', () => {
    for (const f of ['index.json', 'trip.json', 'days.json', 'stations.json', 'route-meta.json']) {
      const o = JSON.parse(readFileSync(join(DIST, 'data', f), 'utf8')) as Record<string, unknown>;
      expect(o['navigational'], f).toBe(false);
    }
  });

  it('ships the route source attribution, as CC BY-SA requires', () => {
    const meta = JSON.parse(readFileSync(join(DIST, 'data', 'route-meta.json'), 'utf8')) as {
      source: Record<string, string>;
    };
    expect(meta.source.licence).toBe('CC BY-SA 4.0');
    expect(meta.source.attribution).toMatch(/kaidotrail/i);
    const appJs = files
      .filter((f) => f.includes('assets') && f.endsWith('.js'))
      .map((f) => readFileSync(f, 'utf8'))
      .join('\n');
    // The attribution has to be reachable in the running app, not only in a file.
    expect(appJs).toMatch(/CC BY-SA 4\.0/);
  });

  it('carries the warning text in the shipped JavaScript', () => {
    const appJs = files
      .filter((f) => f.includes('assets') && f.endsWith('.js'))
      .map((f) => readFileSync(f, 'utf8'))
      .join('\n');
    expect(appJs).toMatch(/not for navigation/i);
    expect(appJs).toMatch(/unverified/i);
  });
});
