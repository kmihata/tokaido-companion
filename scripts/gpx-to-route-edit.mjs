/**
 * Turns finished traced GPX files into a Samwise route-edit payload.
 *
 * RUN: node scripts/gpx-to-route-edit.mjs <file.gpx> [more.gpx ...] > edits.json
 *      npm run route:apply-edits -- edits.json
 *
 * The desk produces this payload when you adopt a section on the device. That
 * path stays the source of truth for anything traced interactively. This script
 * exists for the other case: a GPX that came straight out of gpx.studio and was
 * never carried through the device — which is how most of the tracing actually
 * happens, and which on 2026-09-13 left seven finished sections sitting in
 * Downloads for weeks because there was no way to bake one without the app.
 *
 * It deliberately does NOT write to public/data. Everything that can corrupt
 * the dataset — splicing variant-on-variant edits, re-projecting anchors, and
 * REFUSING an edit whose endpoints leave their anchors behind — lives in
 * apply-route-edits.mjs and is exercised by the tests. This only builds the
 * payload that script validates.
 */
import { readFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA = join(ROOT, 'public', 'data');

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error('Usage: node scripts/gpx-to-route-edit.mjs <file.gpx> [more.gpx ...]');
  process.exit(1);
}

const meta = JSON.parse(readFileSync(join(DATA, 'route-meta.json'), 'utf8'));
const anchors = JSON.parse(readFileSync(join(DATA, 'anchors.geojson'), 'utf8')).features;

const R = 6371.0088;
const rad = (d) => (d * Math.PI) / 180;
const hav = (a, b) => {
  const [la1, la2] = [rad(a[1]), rad(b[1])];
  const h =
    Math.sin((la2 - la1) / 2) ** 2 +
    Math.cos(la1) * Math.cos(la2) * Math.sin((rad(b[0]) - rad(a[0])) / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
};
const lineLengthKm = (pts) => pts.reduce((t, p, i) => (i ? t + hav(pts[i - 1], p) : 0), 0);

/**
 * Same tolerance the baker refuses at. Catching it here means a bad file is
 * named before it is anywhere near the dataset.
 */
const ANCHOR_ON_ROUTE_KM = 0.05;
/** How far an endpoint may sit from the anchor it is claiming to start at. */
const ENDPOINT_MATCH_KM = 0.25;

function pointsIn(xml) {
  const pts = [];
  const re = /<trkpt[^>]*\blat="([-\d.]+)"[^>]*\blon="([-\d.]+)"|<trkpt[^>]*\blon="([-\d.]+)"[^>]*\blat="([-\d.]+)"/g;
  let m;
  while ((m = re.exec(xml))) {
    // Six decimals is ~0.1 m and is what every other feature in route.geojson
    // carries. gpx.studio exports full float precision, and the build test
    // "keeps long digit runs out of the shipped data" reads a 14-digit mantissa
    // as a possible confirmation or card number — correctly, since it cannot
    // tell them apart. Round at the door.
    const round6 = (n) => Math.round(n * 1e6) / 1e6;
    const lat = round6(Number(m[1] ?? m[4]));
    const lon = round6(Number(m[2] ?? m[3]));
    // gpx.studio routes each anchor-to-anchor leg separately and concatenates
    // them, so the shared node lands in the file twice. A zero-length step adds
    // nothing to the line but still counts in `(length / (n - 1))`, which is how
    // mean spacing is measured everywhere in this project — so duplicates make a
    // coarse section read as fine. Drop them at the door, like the rounding.
    const prev = pts[pts.length - 1];
    if (prev && prev[0] === lon && prev[1] === lat) continue;
    pts.push([lon, lat]);
  }
  return pts;
}

function nearestAnchor(p) {
  let best = null;
  for (const a of anchors) {
    const d = hav(a.geometry.coordinates, p);
    if (!best || d < best.km) best = { anchor: a, km: d };
  }
  return best;
}

const edits = [];
for (const file of files) {
  const name = basename(file);
  const pts = pointsIn(readFileSync(file, 'utf8'));
  if (pts.length < 2) {
    console.error(`${name}: fewer than two points`);
    process.exit(1);
  }

  const from = nearestAnchor(pts[0]);
  const to = nearestAnchor(pts[pts.length - 1]);
  if (!from || !to || from.anchor === to.anchor) {
    console.error(`${name}: could not find two distinct anchors for the endpoints`);
    process.exit(1);
  }
  for (const [end, hit] of [['start', from], ['end', to]]) {
    if (hit.km > ENDPOINT_MATCH_KM) {
      console.error(
        `${name}: ${end} is ${(hit.km * 1000).toFixed(0)} m from the nearest anchor ` +
          `(${hit.anchor.properties.title}) — too far to say which section this is`,
      );
      process.exit(1);
    }
    if (hit.km > ANCHOR_ON_ROUTE_KM) {
      console.error(
        `WARN ${name}: ${end} sits ${(hit.km * 1000).toFixed(0)} m from ` +
          `${hit.anchor.properties.title}; the baker refuses above ` +
          `${ANCHOR_ON_ROUTE_KM * 1000} m. Extend the trace to the anchor.`,
      );
    }
  }

  const id = `edit-${name.replace(/\.gpx$/i, '')}`;
  edits.push({
    id,
    label: `${from.anchor.properties.title} to ${to.anchor.properties.title}, retraced`,
    reason: 'Road-snapped in gpx.studio at walking density.',
    kind: 'replace-section',
    divergeAnchorId: from.anchor.properties.id,
    rejoinAnchorId: to.anchor.properties.id,
    geometry: pts,
    lengthKm: Math.round(lineLengthKm(pts) * 1000) / 1000,
    active: true,
    verification: 'manually-traced',
    origin: { filename: name },
  });
  console.error(
    `${name}: ${from.anchor.properties.title} → ${to.anchor.properties.title}, ` +
      `${lineLengthKm(pts).toFixed(2)} km, ${pts.length} pts, ` +
      `mean ${((lineLengthKm(pts) * 1000) / (pts.length - 1)).toFixed(0)} m`,
  );
}

process.stdout.write(
  `${JSON.stringify(
    {
      kind: 'samwise-route-edits',
      schemaVersion: 1,
      exported: new Date().toISOString().slice(0, 10),
      appliesToRouteDataVersion: meta.dataVersion,
      edits,
    },
    null,
    2,
  )}\n`,
);
