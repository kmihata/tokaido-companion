/**
 * Audit a pile of traced files against the route that is actually shipped.
 *
 * RUN: npm run route:audit -- <file | folder | zip>
 *
 * WHY: twice on 2026-09-13 a finished retrace turned out to be sitting
 * somewhere unused — once in Downloads for three weeks, once inside
 * gpx.studio's own file list. Both were found by hand. The question "which of
 * these have I already done, and which are new work I have not used" is
 * answerable mechanically, so it should be.
 *
 * For each track it finds the anchors its endpoints sit on, locates the
 * matching section of the live route, and compares point spacing. Finer than
 * the route means unused work. Matching the route means already baked. Coarser
 * means it is a source export, not a retrace.
 *
 * It reads only. Nothing here changes the route.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA = join(ROOT, 'public', 'data');

const arg = process.argv[2];
if (!arg) {
  console.error('Usage: npm run route:audit -- <file | folder | zip>');
  process.exit(1);
}

const R = 6371.0088;
const rad = (d) => (d * Math.PI) / 180;
const hav = (a, b) => {
  const [la1, la2] = [rad(a[1]), rad(b[1])];
  const h =
    Math.sin((la2 - la1) / 2) ** 2 +
    Math.cos(la1) * Math.cos(la2) * Math.sin((rad(b[0]) - rad(a[0])) / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
};
const len = (pts) => pts.reduce((t, p, i) => (i ? t + hav(pts[i - 1], p) : 0), 0);

const meta = JSON.parse(readFileSync(join(DATA, 'route-meta.json'), 'utf8'));
const routeFeatures = JSON.parse(readFileSync(join(DATA, 'route.geojson'), 'utf8')).features;
const anchors = JSON.parse(readFileSync(join(DATA, 'anchors.geojson'), 'utf8')).features;

/** Sections of the live route, keyed by the anchor pair that bounds them. */
const sections = new Map();
for (const f of routeFeatures) {
  const pid = f.properties.id;
  const on = anchors
    .filter((a) => a.properties.pathId === pid)
    .sort((x, y) => x.properties.indexOnPath - y.properties.indexOnPath);
  const coords = f.geometry.coordinates;
  for (let i = 0; i < on.length - 1; i++) {
    const a = on[i];
    const b = on[i + 1];
    const slice = coords.slice(a.properties.indexOnPath, b.properties.indexOnPath + 1);
    if (slice.length < 2) continue;
    const km = len(slice);
    sections.set(`${a.properties.id}→${b.properties.id}`, {
      from: a,
      to: b,
      km,
      points: slice.length,
      spacingM: (km * 1000) / (slice.length - 1),
      pathId: pid,
    });
  }
}

// A retraced section is stored as a VARIANT layered over its path, not spliced
// into it, so the base geometry still holds the coarse line it replaced.
// Reading spacing off the paths alone therefore reports every baked retrace as
// unused work — which is what the first version of this script did, for all
// seven of them. Let an active variant that diverges and rejoins on the same
// path speak for the section it covers.
let overridden = 0;
for (const v of meta.variants) {
  if (!v.active || !v.rejoinAnchorId) continue;
  const from = anchors.find((a) => a.properties.id === v.divergeAnchorId);
  const to = anchors.find((a) => a.properties.id === v.rejoinAnchorId);
  if (!from || !to) continue;
  if (from.properties.pathId !== to.properties.pathId) continue;
  const key = `${from.properties.id}→${to.properties.id}`;
  const existing = sections.get(key);
  if (!existing) continue;
  const feature = routeFeatures.find((f) => f.properties.id === v.id);
  if (!feature) continue;
  const pts = feature.geometry.coordinates;
  if (pts.length < 2) continue;
  const km = len(pts);
  sections.set(key, {
    ...existing,
    km,
    points: pts.length,
    spacingM: (km * 1000) / (pts.length - 1),
    fromVariant: v.id,
  });
  overridden++;
}

function nearestAnchor(p, onlyPathId = null) {
  let best = null;
  for (const a of anchors) {
    if (onlyPathId && a.properties.pathId !== onlyPathId) continue;
    const d = hav([a.geometry.coordinates[0], a.geometry.coordinates[1]], p);
    if (!best || d < best.d) best = { d, a };
  }
  return best;
}

/** Both endpoints have to sit on one alignment, or the match is meaningless. */
function endpoints(first, last) {
  const a0 = nearestAnchor(first);
  const a1 = nearestAnchor(last);
  if (!a0 || !a1) return null;
  if (a0.a.properties.pathId === a1.a.properties.pathId) return [a0, a1];
  const byStart = nearestAnchor(last, a0.a.properties.pathId);
  const byEnd = nearestAnchor(first, a1.a.properties.pathId);
  return Math.max(a0.d, byStart?.d ?? Infinity) <= Math.max(byEnd?.d ?? Infinity, a1.d)
    ? [a0, byStart]
    : [byEnd, a1];
}

function tracksIn(xml) {
  const out = [];
  for (const m of xml.matchAll(/<trk>([\s\S]*?)<\/trk>/g)) {
    const body = m[1];
    const name = /<name>([^<]*)<\/name>/.exec(body)?.[1] ?? null;
    const pts = [...body.matchAll(/<trkpt[^>]*lat="(-?[\d.]+)"[^>]*lon="(-?[\d.]+)"/g)].map((t) => [
      Number(t[2]),
      Number(t[1]),
    ]);
    if (pts.length >= 2) out.push({ name, pts });
  }
  return out;
}

function collect(path) {
  const p = resolve(path);
  const st = statSync(p);
  if (st.isDirectory()) {
    // Recurse: gpx.studio's export-all writes a folder per multi-track file, so
    // a flat scan silently skipped one of Kevin's sections.
    const found = [];
    const walk = (d) => {
      for (const e of readdirSync(d, { withFileTypes: true })) {
        const full = join(d, e.name);
        if (e.isDirectory()) walk(full);
        else if (extname(e.name).toLowerCase() === '.gpx') found.push(full);
      }
    };
    walk(p);
    return found;
  }
  if (extname(p).toLowerCase() === '.zip') {
    const dir = mkdtempSync(join(tmpdir(), 'audit-'));
    execFileSync('unzip', ['-qo', p, '-d', dir]);
    const found = [];
    const walk = (d) => {
      for (const e of readdirSync(d, { withFileTypes: true })) {
        const full = join(d, e.name);
        if (e.isDirectory()) walk(full);
        else if (extname(e.name).toLowerCase() === '.gpx') found.push(full);
      }
    };
    walk(dir);
    return found;
  }
  return [p];
}

const files = collect(arg);
console.log(
  `route ${meta.dataVersion} · ${sections.size} sections ` +
    `(${overridden} carrying a retrace) · auditing ${files.length} file(s)\n`,
);

const buckets = { unused: [], baked: [], source: [], nomatch: [], whole: [] };

for (const file of files) {
  const xml = readFileSync(file, 'utf8');
  const tracks = tracksIn(xml);
  const short = file.split('/').pop();
  if (tracks.length === 0) {
    buckets.nomatch.push({ short, why: 'no track points' });
    continue;
  }
  for (const [i, t] of tracks.entries()) {
    const label = tracks.length > 1 ? `${short} [track ${i + 1}]` : short;
    const km = len(t.pts);
    const spacing = (km * 1000) / (t.pts.length - 1);

    // A whole-route export is not a section and should not be matched as one.
    if (km > 60) {
      buckets.whole.push({ label, km, points: t.pts.length, spacing });
      continue;
    }

    const ends = endpoints(t.pts[0], t.pts.at(-1));
    if (!ends || !ends[0] || !ends[1] || ends[0].d > 0.25 || ends[1].d > 0.25) {
      const away = (km) => (km > 5 ? `${km.toFixed(0)} km` : `${(km * 1000).toFixed(0)} m`);
      buckets.nomatch.push({
        short: label,
        why: `endpoints ${away(ends?.[0]?.d ?? 9)} / ${away(ends?.[1]?.d ?? 9)} from any anchor — not a Tokaido file`,
      });
      continue;
    }
    const key = `${ends[0].a.properties.id}→${ends[1].a.properties.id}`;
    const rev = `${ends[1].a.properties.id}→${ends[0].a.properties.id}`;
    const sec = sections.get(key) ?? sections.get(rev);
    if (!sec) {
      buckets.nomatch.push({
        short: label,
        why: `spans ${ends[0].a.properties.title} → ${ends[1].a.properties.title}, which is not one section`,
      });
      continue;
    }

    const row = {
      label,
      section: `${sec.from.properties.title} → ${sec.to.properties.title}`,
      fileSpacing: spacing,
      routeSpacing: sec.spacingM,
      filePoints: t.pts.length,
      routePoints: sec.points,
      km,
    };
    // Meaningfully finer than what is shipped means work that was done and
    // never used. Within a tenth means it IS what is shipped.
    if (spacing < sec.spacingM * 0.75) buckets.unused.push(row);
    else if (spacing <= sec.spacingM * 1.1) buckets.baked.push(row);
    else buckets.source.push(row);
  }
}

const show = (title, rows, fmt) => {
  if (rows.length === 0) return;
  console.log(`${title} (${rows.length})`);
  for (const r of rows) console.log(fmt(r));
  console.log('');
};

show(
  '*** UNUSED WORK — traced, finer than the route, never baked in ***',
  buckets.unused.sort((a, b) => a.fileSpacing - b.fileSpacing),
  (r) =>
    `  ${r.fileSpacing.toFixed(0)} m vs ${r.routeSpacing.toFixed(0)} m in the route · ` +
    `${r.filePoints} vs ${r.routePoints} pts · ${r.section}\n      ${r.label}`,
);
show('Already in the route', buckets.baked, (r) => `  ${r.section}  (${r.label})`);
show(
  'Coarser than the route — a source export, not a retrace',
  buckets.source,
  (r) => `  ${r.fileSpacing.toFixed(0)} m vs ${r.routeSpacing.toFixed(0)} m · ${r.section}  (${r.label})`,
);
show(
  'Whole-route files, not sections',
  buckets.whole,
  (r) => `  ${r.km.toFixed(0)} km, ${r.points} pts, ${r.spacing.toFixed(0)} m · ${r.label}`,
);
show('Could not be matched to a section', buckets.nomatch, (r) => `  ${r.short} — ${r.why}`);

console.log(
  buckets.unused.length
    ? `${buckets.unused.length} file(s) hold work the route does not have. Move them into route-sources/working/ and bake them.`
    : 'Nothing unused. Everything traced is already in the route.',
);
