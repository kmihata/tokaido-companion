#!/usr/bin/env node
/**
 * Removes consecutive duplicate points from the shipped route geometry.
 *
 * gpx.studio routes each anchor-to-anchor leg separately and concatenates the
 * results, so the shared node lands in the exported file twice. The original
 * kaidotrail import carries them too — `path-west` arrived with 264. They are
 * invisible on a map and harmless to navigation, but mean spacing is measured
 * as `length / (points - 1)` in both traceChecks.ts and sectionExport.ts, and a
 * zero-length step adds nothing to the numerator while still counting in the
 * denominator. Duplicates therefore make a coarse section read as fine, and
 * that reading is what decides whether a section is finished.
 *
 * Removing them changes no distance: a zero-length step has no length. What it
 * does change is every `indexOnPath` downstream of a removal, so this script
 * rewrites anchors.geojson in the same pass and refuses to write anything if a
 * single anchor cannot be placed back on the exact coordinate it claimed.
 *
 * The converter (gpx-to-route-edit.mjs) now drops duplicates at the door, so
 * this is a one-time correction for data baked before 2026-09-21 — but it is
 * idempotent and safe to re-run after any future bulk import.
 *
 * Usage: node scripts/strip-duplicate-points.mjs [--dry-run]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const DATA = join(process.cwd(), 'public', 'data');
const dryRun = process.argv.includes('--dry-run');
const read = (f) => JSON.parse(readFileSync(join(DATA, f), 'utf8'));

const route = read('route.geojson');
const anchors = read('anchors.geojson');

const same = (a, b) => a[0] === b[0] && a[1] === b[1];

/** oldIndex -> newIndex, for each path that changed. */
const remap = new Map();
let removed = 0;

for (const feature of route.features) {
  if (feature.geometry.type !== 'LineString') continue;
  const coords = feature.geometry.coordinates;
  const kept = [];
  const map = new Array(coords.length);
  for (let i = 0; i < coords.length; i++) {
    const prev = kept[kept.length - 1];
    if (prev && same(prev, coords[i])) {
      // The duplicate resolves to the point it duplicates, which is the same
      // place. An anchor sitting on either index still sits on its coordinate.
      map[i] = kept.length - 1;
      continue;
    }
    map[i] = kept.length;
    kept.push(coords[i]);
  }
  const dropped = coords.length - kept.length;
  if (dropped > 0) {
    console.log(
      `${feature.properties.id}: ${coords.length} -> ${kept.length} points (${dropped} removed)`,
    );
    removed += dropped;
  }
  remap.set(feature.properties.id, map);
  feature.geometry.coordinates = kept;
}

if (removed === 0) {
  console.log('No consecutive duplicates in the shipped route. Nothing to do.');
  process.exit(0);
}

const geometryOf = new Map(
  route.features.map((f) => [f.properties.id, f.geometry.coordinates]),
);

const R = 6371.0088;
const hav = (a, b) => {
  const toRad = (d) => (d * Math.PI) / 180;
  const [lo1, la1] = a;
  const [lo2, la2] = b;
  const dLa = toRad(la2 - la1);
  const dLo = toRad(lo2 - lo1);
  const s =
    Math.sin(dLa / 2) ** 2 +
    Math.cos(toRad(la1)) * Math.cos(toRad(la2)) * Math.sin(dLo / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
};
const lengthKm = (line) => {
  let t = 0;
  for (let i = 1; i < line.length; i++) t += hav(line[i - 1], line[i]);
  return t;
};

/**
 * How far an anchor's stored coordinate may sit from the geometry point it
 * claims, and still be treated as the same place. a-072 (Manba Ohashi) is
 * 0.2 m out and always has been — it predates the six-decimal rounding the
 * converter now applies at the door, so its coordinate and its path point were
 * written at different precisions. That is rounding noise, not a position, and
 * the fix is to adopt the geometry's value so the two agree exactly. Anything
 * larger is a real disagreement about where the anchor is, and this script has
 * no business guessing: it refuses and says which anchor.
 */
const EXACT_ENOUGH_M = 0.5;

const failures = [];
const snapped = [];
let moved = 0;

for (const anchor of anchors.features) {
  const { pathId, indexOnPath, id } = anchor.properties;
  const map = remap.get(pathId);
  if (!map) continue; // anchor on a path this file does not carry
  const nextIndex = map[indexOnPath];
  if (nextIndex === undefined) {
    failures.push(`${id}: indexOnPath ${indexOnPath} is past the end of ${pathId}`);
    continue;
  }
  const line = geometryOf.get(pathId);
  const at = line[nextIndex];
  if (!same(at, anchor.geometry.coordinates)) {
    const driftM = hav(at, anchor.geometry.coordinates) * 1000;
    if (driftM > EXACT_ENOUGH_M) {
      failures.push(
        `${id}: index ${indexOnPath} -> ${nextIndex} on ${pathId} is ${driftM.toFixed(1)} m from the anchor's own coordinate`,
      );
      continue;
    }
    snapped.push(`${id} (${anchor.properties.title}) by ${driftM.toFixed(2)} m`);
    anchor.geometry.coordinates = [at[0], at[1]];
  }
  if (nextIndex !== indexOnPath) moved++;
  anchor.properties.indexOnPath = nextIndex;
  anchor.properties.alongKm = Math.round(lengthKm(line.slice(0, nextIndex + 1)) * 1000) / 1000;
}

if (failures.length > 0) {
  console.error('\nRefusing to write. Anchors could not be replaced exactly:');
  for (const f of failures) console.error(`  ${f}`);
  process.exit(1);
}

console.log(`\n${removed} duplicate points removed, ${moved} anchors reindexed.`);
for (const line of snapped) console.log(`  snapped onto its own geometry: ${line}`);

if (dryRun) {
  console.log('--dry-run: nothing written.');
  process.exit(0);
}

writeFileSync(join(DATA, 'route.geojson'), `${JSON.stringify(route, null, 2)}\n`);
writeFileSync(join(DATA, 'anchors.geojson'), `${JSON.stringify(anchors, null, 2)}\n`);
console.log('Wrote route.geojson and anchors.geojson. Run `npm run verify`.');
