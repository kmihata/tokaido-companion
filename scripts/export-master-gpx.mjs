/**
 * Writes the master route GPX to disk, using the same export code the app runs.
 *
 * RUN: npm run route:gpx
 *
 * Exists so the export can be tested in Footpath without going through the
 * phone, and so the file the app produces and the file checked into
 * footpath-test/ cannot drift apart. src/lib/routeExport.ts has no runtime
 * imports, only type imports, so Node can strip the types and run it directly.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { masterRouteGpx } from '../src/lib/routeExport.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => JSON.parse(readFileSync(join(ROOT, 'public', 'data', f), 'utf8'));

const routeMeta = read('route-meta.json');
const routeFeatures = read('route.geojson').features;
const anchors = read('anchors.geojson').features;
const waypoints = read('waypoints.geojson').features;

// Mirror of buildStretches for the two cases this data has. Kept deliberately
// small; the app's own version in src/data/load.ts is the tested one.
const geometryOf = (id) =>
  routeFeatures.find((f) => f.properties.id === id)?.geometry.coordinates ?? [];
const anchorById = (id) => anchors.find((a) => a.properties.id === id);

const activeVariants = routeMeta.variants.filter((v) => v.active);
const stretches = [];
let current = null;
const flush = () => {
  if (current && current.positions.length >= 2) {
    stretches.push({
      id: current.members.join('+'),
      title: current.members.join(' → '),
      memberIds: current.members,
      positions: current.positions,
      lengthKm: 0,
      cumulativeKm: [],
    });
  }
  current = null;
};
for (const path of [...routeMeta.paths].sort((a, b) => a.order - b.order)) {
  if (path.kind === 'walking') {
    let geom = geometryOf(path.id);
    const leaving = activeVariants.find(
      (v) => anchorById(v.divergeAnchorId)?.properties.pathId === path.id,
    );
    if (leaving) {
      const idx = anchorById(leaving.divergeAnchorId)?.properties.indexOnPath;
      if (typeof idx === 'number') geom = geom.slice(0, idx + 1);
    }
    if (!current) current = { members: [], positions: [] };
    current.members.push(path.id);
    current.positions.push(...geom.slice(current.positions.length > 0 ? 1 : 0));
    continue;
  }
  const resolver = activeVariants.find((v) => v.replacesPathId === path.id);
  if (resolver) {
    const geom = geometryOf(resolver.id);
    if (!current) current = { members: [], positions: [] };
    current.members.push(resolver.id);
    current.positions.push(...geom.slice(current.positions.length > 0 ? 1 : 0));
    continue;
  }
  flush();
}
flush();

const R = 6371.0088;
const rad = (d) => (d * Math.PI) / 180;
const hav = (a, b) => {
  const [la1, lo1] = [rad(a[1]), rad(a[0])];
  const [la2, lo2] = [rad(b[1]), rad(b[0])];
  const h =
    Math.sin((la2 - la1) / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin((lo2 - lo1) / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
};
for (const s of stretches) {
  s.lengthKm = s.positions.slice(1).reduce((t, p, i) => t + hav(s.positions[i], p), 0);
}

const gpx = masterRouteGpx({ routeMeta, routeFeatures, anchors, waypoints, stretches });
const out = join(ROOT, 'footpath-test', 'TOKAIDO-MASTER.gpx');
writeFileSync(out, gpx);
console.log(`wrote footpath-test/TOKAIDO-MASTER.gpx (${(gpx.length / 1024).toFixed(0)} KB)`);
console.log(`tracks: ${stretches.length}`);
for (const s of stretches) console.log(`  ${s.positions.length} points, ${s.lengthKm.toFixed(1)} km`);
