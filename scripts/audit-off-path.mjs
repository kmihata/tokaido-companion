/**
 * Audit the shipped route against the paths OpenStreetMap says are there.
 *
 * RUN: npm run route:off-path                 # every section
 *      npm run route:off-path -- a-041 a-042  # one section
 *      npm run route:off-path -- --refresh    # ignore the cache
 *
 * WHY: the desk ranks sections on one number, mean point spacing, and calls
 * anything at or under 65 m done. That is a sampling measure, not a
 * correctness measure. On 2026-10-02 Utsunoya Pass to Okabe-juku was sitting
 * in the "baked" column at 60 m having never been reviewed by anyone, and its
 * line was up to 16.6 m off the footway it was supposed to be on. Forty
 * sections were in that position: never retraced, never listed, passing
 * because whoever imported them happened to land under the threshold.
 *
 * So this asks the other question. Not "how often is the line sampled" but
 * "is the line where a walkable way is".
 *
 * Two details matter, both learned by getting them wrong first:
 *
 *  1. It samples ALONG each segment, not at the vertices. Measuring vertices
 *     scores a line that cuts a switchback perfectly, because both ends of the
 *     chord sit exactly on the path and only the middle is in the trees.
 *
 *  2. It scores footpaths and roads separately. Around Utsunoya several
 *     service roads are also named 旧東海道, so a trace 2 m from the wrong one
 *     looked flawless until the classes were split.
 *
 * A high number here is a DISAGREEMENT, not a verdict. OSM footpaths through
 * forest are often traced off aerial imagery and carry their own tens of
 * metres of error. This produces a worklist, not a judgement.
 *
 * It reads only. Nothing here changes the route, and nothing here feeds the
 * desk's idea of done — that stays spacing until someone decides otherwise.
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA = join(ROOT, 'public', 'data');
const CACHE = join(ROOT, '.cache', 'osm-corridor');

const args = process.argv.slice(2);
const REFRESH = args.includes('--refresh');
const ONLY = args.filter((a) => /^a-\d+$/.test(a));

/** How far from the line to ask OSM for ways. Nothing beyond this is seen. */
const CORRIDOR_M = 150;
/** Spacing of the probes walked along each segment. */
const SAMPLE_M = 10;
/** Above this, a sample is called off-path and counted. */
const OFF_PATH_M = 25;
/** Simplify the query polyline to about this, to keep Overpass cheap. */
const QUERY_STEP_M = 120;

const UA = 'samwise-route-audit/1.0 (kmihata@gmail.com)';
const FRONT = 'https://overpass-api.de';

/**
 * Ask Overpass which backend it wants us on and talk to that one directly.
 *
 * WHY: on 2026-10-02 every query through overpass-api.de returned 504 within
 * seconds — six sections in eight minutes — while /api/status reported the
 * service healthy with slots free. The load balancer was sending us to a
 * backend that would not answer. The announced endpoint from the same status
 * page served the identical query in 1.3 seconds. So the front door is the
 * fallback here, not the default.
 */
const KNOWN_BACKENDS = ['lambert.openstreetmap.de', 'gall.openstreetmap.de'];
let backendTurn = 0;

async function resolveEndpoint() {
  try {
    const res = await fetch(`${FRONT}/api/status`, {
      headers: { 'User-Agent': UA },
      signal: AbortSignal.timeout(30_000),
    });
    const text = await res.text();
    const host = /Announced endpoint:\s*(\S+?)\/?\s*$/m.exec(text)?.[1];
    const slots = /(\d+) slots available now/.exec(text)?.[1];
    if (host && host !== 'none') {
      if (!KNOWN_BACKENDS.includes(host)) KNOWN_BACKENDS.push(host);
      process.stderr.write(`  -> backend ${host}${slots ? ` (${slots} slots free)` : ''}\n`);
      return `https://${host}/api/interpreter`;
    }
  } catch {
    /* status is itself behind the balancer; fall through */
  }
  // No announcement does NOT mean "use the front door". The front door is the
  // thing that was 504ing; it announces nothing precisely when it is unwell.
  // Rotate through backends known to have answered instead.
  const host = KNOWN_BACKENDS[backendTurn++ % KNOWN_BACKENDS.length];
  process.stderr.write(`  -> no announcement, trying ${host}\n`);
  return `https://${host}/api/interpreter`;
}

let ENDPOINT = `${FRONT}/api/interpreter`;

/**
 * Ways a person on foot can use. `service` is in because half of rural Japan's
 * old road survives as one. Motorways are out: if the trace is nearest a
 * motorway, that is the finding, not the baseline.
 */
const FOOT_KINDS = new Set(['footway', 'path', 'steps', 'pedestrian', 'track', 'cycleway']);
const ROAD_KINDS = new Set([
  'residential',
  'unclassified',
  'tertiary',
  'tertiary_link',
  'secondary',
  'secondary_link',
  'primary',
  'primary_link',
  'trunk',
  'trunk_link',
  'service',
  'living_street',
  'road',
]);

const R = 6371.0088;
const rad = (d) => (d * Math.PI) / 180;
const hav = (a, b) => {
  const [la1, la2] = [rad(a[1]), rad(b[1])];
  const h =
    Math.sin((la2 - la1) / 2) ** 2 +
    Math.cos(la1) * Math.cos(la2) * Math.sin((rad(b[0]) - rad(a[0])) / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
};

/** Metres from p to segment a-b, in a local flat approximation. */
function distToSegment(p, a, b) {
  const kx = Math.cos(rad(p[1])) * 111.32;
  const ky = 110.574;
  const px = (p[0] - a[0]) * kx;
  const py = (p[1] - a[1]) * ky;
  const bx = (b[0] - a[0]) * kx;
  const by = (b[1] - a[1]) * ky;
  const L = bx * bx + by * by;
  const t = L ? Math.max(0, Math.min(1, (px * bx + py * by) / L)) : 0;
  return Math.hypot(px - bx * t, py - by * t) * 1000;
}

function distToWays(p, ways) {
  let best = Infinity;
  let which = null;
  for (const w of ways) {
    const g = w.geometry;
    for (let i = 1; i < g.length; i++) {
      const d = distToSegment(p, g[i - 1], g[i]);
      if (d < best) {
        best = d;
        which = w;
      }
    }
  }
  return { d: best, way: which };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let overpassDead = false;

/**
 * Overpass refuses a lot under load, and this walks the whole route, so a
 * failed fetch has to be a retry rather than a hole in the audit. A hole that
 * reported "clean" would be worse than no audit at all.
 */
async function overpass(query, label) {
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'data=' + encodeURIComponent(query),
        signal: AbortSignal.timeout(180_000),
      });
      if (res.ok) {
        const text = await res.text();
        if (text.startsWith('{')) return JSON.parse(text);
      }
      process.stderr.write(`    ${label}: HTTP ${res.status}, retry ${attempt}/5\n`);
    } catch (err) {
      process.stderr.write(`    ${label}: ${err.message}, retry ${attempt}/5\n`);
    }
    // A 504 here usually means the backend changed under us, not that the
    // query is bad, so re-resolve before sleeping rather than hammering a
    // host that has stopped answering.
    ENDPOINT = await resolveEndpoint();
    await sleep(attempt * 20_000);
  }
  return null;
}

/** Thin the line to roughly QUERY_STEP_M so the `around` clause stays cheap. */
function thin(line) {
  const out = [line[0]];
  let acc = 0;
  for (let i = 1; i < line.length; i++) {
    acc += hav(line[i - 1], line[i]) * 1000;
    if (acc >= QUERY_STEP_M) {
      out.push(line[i]);
      acc = 0;
    }
  }
  if (out.at(-1) !== line.at(-1)) out.push(line.at(-1));
  return out;
}

/* ---------------------------------------------------------------------- *
 * Second source: api.openstreetmap.org, tiled.
 *
 * Overpass is the right tool and is tried first, because `around` on the line
 * returns only what matters. But on 2026-10-02 it went from answering in 1.3 s
 * to refusing every request including /api/status, roughly seventy queries in,
 * with twenty-three sections done. An audit that cannot finish is not an
 * audit, so there is a fallback.
 *
 * The OSM API cannot filter, so this fetches map tiles and throws away
 * everything that is not a highway. Tiles are cached globally rather than per
 * section: consecutive sections overlap heavily, so the 107 sections cost far
 * fewer than 107 tiles. It splits on the 50,000-node limit, which 0.02 deg
 * exceeds in Tokyo and nowhere rural.
 * ---------------------------------------------------------------------- */
const TILE_CACHE = join(ROOT, '.cache', 'osm-tiles');
const TILE_DEG = 0.02;
let lastApiCall = 0;

async function politeFetch(url) {
  const wait = 1100 - (Date.now() - lastApiCall);
  if (wait > 0) await sleep(wait);
  lastApiCall = Date.now();
  return fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(180_000) });
}

/** Pull highway ways out of OSM XML without dragging in an XML dependency. */
function highwaysFromXml(xml) {
  const nodes = new Map();
  const nodeRe = /<node\s+id="(\d+)"[^>]*?\slat="([-\d.]+)"[^>]*?\slon="([-\d.]+)"/g;
  let m;
  while ((m = nodeRe.exec(xml))) nodes.set(m[1], [Number(m[3]), Number(m[2])]);

  const out = [];
  const wayRe = /<way\s+id="(\d+)"[^>]*>([\s\S]*?)<\/way>/g;
  while ((m = wayRe.exec(xml))) {
    const body = m[2];
    const tags = {};
    const tagRe = /<tag\s+k="([^"]*)"\s+v="([^"]*)"/g;
    let t;
    while ((t = tagRe.exec(body))) {
      tags[t[1]] = t[2]
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&');
    }
    if (!tags.highway) continue;
    const geometry = [];
    const ndRe = /<nd\s+ref="(\d+)"/g;
    let n;
    while ((n = ndRe.exec(body))) {
      const p = nodes.get(n[1]);
      if (p) geometry.push(p);
    }
    if (geometry.length >= 2) out.push({ id: Number(m[1]), tags, geometry });
  }
  return out;
}

async function tile(x0, y0, size, depth = 0) {
  mkdirSync(TILE_CACHE, { recursive: true });
  const name = `${x0.toFixed(4)}_${y0.toFixed(4)}_${size.toFixed(4)}.json`;
  const file = join(TILE_CACHE, name);
  if (existsSync(file)) return JSON.parse(readFileSync(file, 'utf8'));

  const pad = 0.0018; // ~170 m, so a tile covers the corridor past its own edge
  const bbox = `${(x0 - pad).toFixed(5)},${(y0 - pad).toFixed(5)},${(x0 + size + pad).toFixed(5)},${(y0 + size + pad).toFixed(5)}`;
  const res = await politeFetch(`https://api.openstreetmap.org/api/0.6/map?bbox=${bbox}`);

  // 509 is NOT "too much data" — it is the server asking us to slow down.
  //
  // This originally lumped 509 in with 400 and split the tile, which fired four
  // more requests, which earned four more 509s. Combined with the Promise.all
  // below defeating the rate limiter, the whole run melted down: 5,953 of 6,119
  // tiles cached EMPTY, and because an empty tile looks exactly like a tile
  // with no roads in it, the audit then reported a correct section of the route
  // — Futagawa to Iwaya Ryokuchi — as sitting 129 m off the road. It is on
  // 旧東海道 at 0 m. A cascade of rate limits became a false finding about the
  // route, which is the worst thing this tool can do.
  if (res.status === 509 || res.status === 429) {
    throw new Error(`OSM API ${res.status} (rate limited) — slow down, do not split`);
  }
  if (res.status === 400) {
    if (depth >= 4) {
      throw new Error(`tile ${x0},${y0} still too large at depth ${depth}`);
    }
    const h = size / 2;
    // Sequential, not Promise.all. Parallel children all read the same
    // `lastApiCall` before any of them writes it, so the 1.1 s gate lets four
    // requests through at once and the politeness is imaginary.
    const merged = [];
    for (const [cx, cy] of [
      [x0, y0],
      [x0 + h, y0],
      [x0, y0 + h],
      [x0 + h, y0 + h],
    ]) {
      merged.push(...(await tile(cx, cy, h, depth + 1)));
    }
    writeFileSync(file, JSON.stringify(merged));
    return merged;
  }
  if (!res.ok) throw new Error(`OSM API ${res.status}`);
  const ways = highwaysFromXml(await res.text());
  writeFileSync(file, JSON.stringify(ways));
  return ways;
}

async function corridorViaOsmApi(line) {
  const keys = new Set();
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1];
    const b = line[i];
    const steps = Math.max(
      1,
      Math.ceil(Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1])) / (TILE_DEG / 4)),
    );
    for (let k = 0; k <= steps; k++) {
      const t = k / steps;
      const x = Math.floor((a[0] + (b[0] - a[0]) * t) / TILE_DEG) * TILE_DEG;
      const y = Math.floor((a[1] + (b[1] - a[1]) * t) / TILE_DEG) * TILE_DEG;
      keys.add(`${x.toFixed(4)},${y.toFixed(4)}`);
    }
  }
  const seen = new Set();
  const ways = [];
  for (const k of keys) {
    const [x, y] = k.split(',').map(Number);
    for (const w of await tile(x, y, TILE_DEG)) {
      if (seen.has(w.id)) continue;
      seen.add(w.id);
      ways.push(w);
    }
  }
  return ways;
}

async function corridorFor(key, line) {
  mkdirSync(CACHE, { recursive: true });
  const file = join(CACHE, `${key}.json`);
  if (!REFRESH && existsSync(file)) {
    const cached = JSON.parse(readFileSync(file, 'utf8'));
    // Cache written before the coverage guard existed can be short, so check
    // on the way out too rather than trusting that it was checked on the way in.
    if (covers(cached, line)) return cached;
    process.stderr.write(`    ${key}: cached reference data is short; refetching\n`);
    rmSync(file, { force: true });
  }

  const coords = thin(line)
    .map((p) => `${p[1].toFixed(5)},${p[0].toFixed(5)}`)
    .join(',');
  const query = `[out:json][timeout:170];way(around:${CORRIDOR_M},${coords})[highway];out tags geom;`;
  const json = overpassDead ? null : await overpass(query, key);

  let ways;
  if (json) {
    ways = (json.elements ?? [])
      .filter((e) => e.geometry?.length >= 2)
      .map((e) => ({ id: e.id, tags: e.tags ?? {}, geometry: e.geometry.map((q) => [q.lon, q.lat]) }));
  } else {
    if (!overpassDead) {
      overpassDead = true;
      process.stderr.write('  Overpass is not answering; falling back to api.openstreetmap.org\n');
    }
    try {
      ways = await corridorViaOsmApi(line);
    } catch (err) {
      process.stderr.write(`    ${key}: OSM API also failed (${err.message})\n`);
      return null;
    }
  }
  if (!covers(ways, line)) {
    // Refuse partial reference data rather than scoring against it.
    //
    // WHY: the first full run reported Hara-juku → Yoshiwara-juku at 3,211 m
    // off the road, 62% of its line "off path" — a result that would have sent
    // a correct 12 km section back for retracing. The corridor fetch had
    // returned ways covering lon 138.711–138.844 for a section running west to
    // 138.684, so its last 2.5 km was measured against nothing at all. An
    // incomplete fetch has to read as a failure, never as a finding.
    process.stderr.write(`    ${key}: reference data does not cover the section; discarding\n`);
    return null;
  }
  writeFileSync(file, JSON.stringify(ways));
  return ways;
}

/**
 * Does this way set actually cover the line — not merely surround it?
 *
 * The first version tested the ways' BOUNDING BOX against the line's, which a
 * corridor with a hole in the middle passes trivially. Futagawa to Iwaya
 * Ryokuchi had 427 ways spanning the section comfortably and was missing the
 * one road the route runs along; the bbox check waved it through and the audit
 * reported a correct section as 129 m off the road.
 *
 * So check the thing we actually rely on: the query asked for every way within
 * CORRIDOR_M of the line, so each vertex should have one. A vertex with nothing
 * within that radius means EITHER the fetch is incomplete OR the route really
 * does leave every mapped way there — and from the data alone those are
 * indistinguishable. Treat it as a bad fetch, because a false alarm about the
 * route costs an evening of retracing something that was already right.
 */
function covers(ways, line) {
  if (!ways.length) return false;
  for (const p of line) {
    if (distToWays(p, ways).d > CORRIDOR_M) return false;
  }
  return true;
}



function sectionsOfRoute() {
  const meta = JSON.parse(readFileSync(join(DATA, 'route-meta.json'), 'utf8'));
  const anchors = JSON.parse(readFileSync(join(DATA, 'anchors.geojson'), 'utf8')).features;
  const feats = JSON.parse(readFileSync(join(DATA, 'route.geojson'), 'utf8')).features.filter(
    (f) => f.geometry.type === 'LineString',
  );
  const variantKeys = new Set(meta.variants.map((v) => `${v.divergeAnchorId}→${v.rejoinAnchorId}`));

  /**
   * Only the active line is worth auditing. route.geojson keeps the base path
   * AND every variant layered over it as separate features, so a naive walk of
   * all of them scores Abekawa→Mariko twice: once at 35 m on the retrace you
   * actually walk, and once at 125 m on the superseded base underneath. The
   * second row is not a finding, it is archaeology.
   */
  const out = [];
  for (const f of feats) {
    if (f.properties.featureRole === 'variant' && f.properties.active === false) continue;
    const g = f.geometry.coordinates;
    const on = anchors
      .map((a) => {
        let bi = -1;
        let bd = Infinity;
        g.forEach((q, i) => {
          const d = hav(a.geometry.coordinates, q);
          if (d < bd) {
            bd = d;
            bi = i;
          }
        });
        return { a, bi, bd };
      })
      .filter((x) => x.bd < 0.05)
      .sort((x, y) => x.bi - y.bi);

    for (let i = 1; i < on.length; i++) {
      const from = on[i - 1];
      const to = on[i];
      const line = g.slice(from.bi, to.bi + 1);
      if (line.length < 2) continue;
      const lengthKm = line.reduce((t, q, k) => (k ? t + hav(line[k - 1], q) : 0), 0);
      if (lengthKm < 0.05) continue;
      const key = `${from.a.properties.id}→${to.a.properties.id}`;
      out.push({
        key,
        title: `${from.a.properties.title} → ${to.a.properties.title}`,
        line,
        lengthKm,
        meanSpacingM: (lengthKm / (line.length - 1)) * 1000,
        retraced: variantKeys.has(key),
        fromVariant: f.properties.featureRole === 'variant',
      });
    }
  }

  // One row per section: where a variant covers the same anchor pair as the
  // base path, the variant is what is walked and the base is dead geometry.
  const best = new Map();
  for (const s of out) {
    const prev = best.get(s.key);
    if (!prev || (s.fromVariant && !prev.fromVariant)) best.set(s.key, s);
  }
  return [...best.values()];
}

/** Walk the section at SAMPLE_M and score every probe against both classes. */
function scoreSection(line, ways) {
  const foot = ways.filter((w) => FOOT_KINDS.has(w.tags.highway));
  const road = ways.filter((w) => ROAD_KINDS.has(w.tags.highway));
  const any = [...foot, ...road];
  if (any.length === 0) return null;

  const samples = [];
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1];
    const b = line[i];
    const L = hav(a, b) * 1000;
    const n = Math.max(1, Math.round(L / SAMPLE_M));
    for (let k = 0; k <= n; k++) {
      if (k === n && i !== line.length - 1) continue; // the next segment opens here
      const t = k / n;
      const p = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
      const hit = distToWays(p, any);
      samples.push({ p, d: hit.d, way: hit.way });
    }
  }
  const ds = samples.map((s) => s.d).sort((x, y) => x - y);
  const worst = samples.reduce((m, s) => (s.d > m.d ? s : m), samples[0]);
  return {
    median: ds[Math.floor(ds.length / 2)],
    p90: ds[Math.floor(ds.length * 0.9)],
    max: ds.at(-1),
    offCount: ds.filter((d) => d > OFF_PATH_M).length,
    samples: ds.length,
    worst,
    footWays: foot.length,
    roadWays: road.length,
  };
}

const sections = sectionsOfRoute().filter((s) => (ONLY.length ? ONLY.includes(s.key.split('→')[0]) : true));
process.stderr.write(`auditing ${sections.length} sections against OSM\n`);
ENDPOINT = await resolveEndpoint();

const results = [];
for (const [i, s] of sections.entries()) {
  process.stderr.write(`  [${i + 1}/${sections.length}] ${s.key}  ${s.title}\n`);
  // A pause between sections. Overpass allows four slots and the loop was
  // issuing a new query the instant the last returned, which exhausted them
  // and cost 98 failures on the 2026-10-09 run. Waiting two seconds between
  // sections costs about three minutes over the whole route and is the
  // difference between finishing and not. Skipped when the corridor is
  // already cached, since that asks nothing of anyone.
  if (!existsSync(join(CACHE, `${s.key}.json`))) await sleep(2_000);
  const ways = await corridorFor(s.key, s.line);
  if (!ways) {
    results.push({ ...s, error: 'no OSM data (fetch failed after retries)' });
    continue;
  }
  const score = scoreSection(s.line, ways);
  if (!score) {
    results.push({ ...s, error: `nothing walkable within ${CORRIDOR_M} m` });
    continue;
  }
  results.push({ ...s, score });
}

const fmt = (x) => (x === undefined || x === null ? '    -' : `${x.toFixed(0).padStart(4)}`);
const bad = results
  .filter((r) => r.score || r.error)
  .sort((a, b) => (b.score?.p90 ?? 9999) - (a.score?.p90 ?? 9999));

console.log('');
console.log('How far the shipped line sits from the nearest walkable OSM way.');
console.log(`Probes every ${SAMPLE_M} m along the line; "off" counts probes over ${OFF_PATH_M} m.`);
console.log('');
console.log('  p90  max   off%   km   spacing  reviewed  section');
console.log('  ---- ----  -----  ----  -------  --------  -------');
for (const r of bad) {
  if (r.error) {
    console.log(`     ?    ?      ?  ${r.lengthKm.toFixed(1).padStart(4)}                     ${r.title}  [${r.error}]`);
    continue;
  }
  const pct = ((r.score.offCount / r.score.samples) * 100).toFixed(0).padStart(4);
  console.log(
    `  ${fmt(r.score.p90)} ${fmt(r.score.max)}  ${pct}%  ${r.lengthKm.toFixed(1).padStart(4)}  ` +
      `${r.meanSpacingM.toFixed(0).padStart(5)} m  ${r.retraced ? '   yes  ' : '    NO  '}  ${r.title}`,
  );
}

const flagged = bad.filter((r) => r.score && r.score.p90 > OFF_PATH_M);
console.log('');
console.log(`${flagged.length} sections have 10% of their line more than ${OFF_PATH_M} m from any walkable way.`);
if (flagged.length) {
  console.log('');
  console.log('Worst point in each:');
  for (const r of flagged.slice(0, 15)) {
    const w = r.score.worst;
    const name = w.way?.tags?.name ?? '(unnamed)';
    console.log(
      `  ${w.d.toFixed(0).padStart(4)} m  ${w.p[1].toFixed(5)},${w.p[0].toFixed(5)}  ` +
        `nearest ${name} [${w.way?.tags?.highway ?? '?'}]  — ${r.title}`,
    );
  }
}
console.log('');
console.log('A high number is a disagreement with OSM, not proof the trace is wrong.');
console.log('Forest footpaths in OSM carry their own error. Look before retracing.');
