/**
 * Bakes exported route edits into the shipped dataset.
 *
 * RUN: npm run route:apply-edits -- path/to/samwise-route-edits-YYYY-MM-DD.json
 *
 * Route edits are device-local by default: the shipped route is precached and
 * survives an iOS Safari storage eviction, an edit in IndexedDB does not. This
 * promotes an edit from delta to shipped data, at which point it can be deleted
 * from the device.
 *
 * It appends the edit as a variant in route-meta.json and route.geojson. It
 * does NOT splice any path geometry — the imported source stays exactly as it
 * arrived, which is what makes an edit reversible and comparable.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA = join(ROOT, 'public', 'data');

const arg = process.argv[2];
if (!arg) {
  console.error('Usage: npm run route:apply-edits -- <exported-edits.json>');
  process.exit(1);
}

const payload = JSON.parse(readFileSync(resolve(arg), 'utf8'));
if (payload.kind !== 'samwise-route-edits') {
  console.error(`Not a Samwise route-edit export: kind was ${JSON.stringify(payload.kind)}`);
  process.exit(1);
}

const meta = JSON.parse(readFileSync(join(DATA, 'route-meta.json'), 'utf8'));
const route = JSON.parse(readFileSync(join(DATA, 'route.geojson'), 'utf8'));

if (payload.appliesToRouteDataVersion !== meta.dataVersion) {
  console.error(
    `These edits were made against route data ${payload.appliesToRouteDataVersion}, but the shipped route is ${meta.dataVersion}.`,
  );
  console.error('Re-check them against the current route before baking them in.');
  process.exit(1);
}

const anchors = JSON.parse(readFileSync(join(DATA, 'anchors.geojson'), 'utf8')).features;
const anchorOf = (id) => anchors.find((a) => a.properties.id === id);
const variantIds = new Set(meta.variants.map((v) => v.id));

/** Mirrors ANCHOR_TOLERANCE_KM in src/lib/dayPlan.ts. */
const ANCHOR_ON_ROUTE_KM = 0.05;

/**
 * How far an anchor ON A SPLICED VARIANT may be moved to stay on that variant.
 * A road-snapped retrace runs a few metres off the line it replaces; 25 m is
 * GPS noise on a bridge deck, and anything larger is a different place.
 */
const ANCHOR_SNAP_KM = 0.025;

const R = 6371.0088;
const rad = (d) => (d * Math.PI) / 180;
const hav = (a, b) => {
  const [la1, la2] = [rad(a[1]), rad(b[1])];
  const h =
    Math.sin((la2 - la1) / 2) ** 2 +
    Math.cos(la1) * Math.cos(la2) * Math.sin((rad(b[0]) - rad(a[0])) / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
};
const lineLengthKm = (pts) =>
  pts.reduce((t, p, i) => {
    if (i === 0) return 0;
    const q = pts[i - 1];
    const [la1, la2] = [rad(q[1]), rad(p[1])];
    const h =
      Math.sin((la2 - la1) / 2) ** 2 +
      Math.cos(la1) * Math.cos(la2) * Math.sin((rad(p[0]) - rad(q[0])) / 2) ** 2;
    return t + 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
  }, 0);

let added = 0;
let splicedCount = 0;
let anchorsDirty = false;
for (const e of payload.edits) {
  if (meta.variants.some((v) => v.id === e.id)) {
    console.log(`skip ${e.id} — already present`);
    continue;
  }

  // An edit whose two ends both lie on an existing VARIANT is an edit TO that
  // variant, and its geometry has to be spliced into it. Appending it beside
  // the variant instead produces a variant nothing refers to: `buildStretches`
  // walks the active alignment and never sees it, so the edit is silently
  // absent from the route while appearing in the file as though it applied.
  // That happened to the Saya Kaido retrace on 2026-09-13 — the section still
  // measured 266 m between points after it had supposedly been baked in.
  // `applyRouteEdits` has always done this in the app; the script had not.
  const from = anchorOf(e.divergeAnchorId);
  const to = e.rejoinAnchorId ? anchorOf(e.rejoinAnchorId) : undefined;
  if (
    from &&
    to &&
    from.properties.pathId === to.properties.pathId &&
    variantIds.has(from.properties.pathId)
  ) {
    const variantId = from.properties.pathId;
    const target = route.features.find((f) => f.properties.id === variantId);
    const summary = meta.variants.find((v) => v.id === variantId);

    // A spliced edit leaves no variant of its own, so the "already present"
    // check above cannot see it and a second run would splice the same
    // geometry in again. The filename recorded in `source` is the only trace
    // it leaves, so that is the guard. This is the same shape as the import
    // script appending a fresh terminus anchor on every run.
    if (summary && String(summary.source ?? '').includes(e.origin.filename)) {
      console.log(`skip ${e.label} — already spliced into ${variantId}`);
      continue;
    }
    const a = Math.min(from.properties.indexOnPath, to.properties.indexOnPath);
    const b = Math.max(from.properties.indexOnPath, to.properties.indexOnPath);
    if (!target || !summary || a < 0 || b >= target.geometry.coordinates.length) {
      console.error(`cannot splice ${e.label} into ${variantId}: indices out of range`);
      process.exit(1);
    }
    const next = [
      ...target.geometry.coordinates.slice(0, a),
      ...e.geometry,
      ...target.geometry.coordinates.slice(b + 1),
    ];
    const km = Math.round(lineLengthKm(next) * 100) / 100;
    target.geometry.coordinates = next;
    target.properties.lengthKm = km;
    target.properties.source = `${target.properties.source} + ${e.origin.filename}`;
    summary.lengthKm = km;
    summary.source = `${summary.source} + ${e.origin.filename}`;
    summary.verification = e.verification;
    // Splicing reindexes the variant, so every anchor on it now points at the
    // wrong vertex. The app survives this because it resolves an anchor by
    // projecting its coordinates onto the line at query time, but the shipped
    // data is validated for internal consistency and `buildStretches` reads
    // `indexOnPath` directly. Re-project them here or ship a file that
    // contradicts itself: Manba Ohashi came out 8.1 km adrift on the first
    // attempt at this.
    let reprojected = 0;
    let snapped = 0;
    for (const a of anchors) {
      if (a.properties.pathId !== variantId) continue;
      const p = a.geometry.coordinates;
      let best = null;
      for (let i = 0; i < next.length; i++) {
        const d = Math.abs(next[i][0] - p[0]) + Math.abs(next[i][1] - p[1]);
        if (!best || d < best.d) best = { d, i };
      }
      if (!best) continue;
      a.properties.indexOnPath = best.i;
      a.properties.alongKm = Math.round(lineLengthKm(next.slice(0, best.i + 1)) * 1000) / 1000;
      reprojected++;

      // The index alone is not enough. A retrace snapped to the road runs a few
      // metres off the line it replaced, so the vertex the anchor now indexes
      // is NOT the anchor's own coordinate, and "places every anchor on the
      // geometry it claims to sit on" fails — a-075 (Ise Ohashi) came out 5.0 m
      // adrift the first time this ran.
      //
      // Moving it is safe here and ONLY here: this anchor's pathId already IS
      // the spliced variant, so it is being kept on its own line rather than
      // dragged onto someone else's. That distinction is the whole a-036
      // lesson. Above ANCHOR_SNAP_KM the trace is not describing the same place
      // any more, and that is a refusal, not a nudge.
      const drift = hav(next[best.i], p);
      if (drift <= 0.0005) continue;
      if (drift > ANCHOR_SNAP_KM) {
        console.error(
          `\ncannot splice ${e.label}: ${a.properties.title} (${a.properties.id}) would move ` +
            `${(drift * 1000).toFixed(0)} m to stay on the line, past the ${ANCHOR_SNAP_KM * 1000} m limit.`,
        );
        console.error('Retrace through the anchor, or move the anchor deliberately first.');
        process.exit(1);
      }
      a.geometry.coordinates = [next[best.i][0], next[best.i][1]];
      snapped++;
    }
    anchorsDirty = true;
    console.log(
      `spliced ${e.label} into ${variantId} (${variantId} is now ${km.toFixed(2)} km, ` +
        `${reprojected} anchor${reprojected === 1 ? '' : 's'} re-projected` +
        `${snapped ? `, ${snapped} moved onto the new line` : ''})`,
    );
    splicedCount++;
    continue;
  }
  meta.variants.push({
    id: e.id,
    title: e.label,
    rationale: e.reason || `Imported from ${e.origin.filename}.`,
    divergeAnchorId: e.divergeAnchorId,
    rejoinAnchorId: e.rejoinAnchorId,
    ...(e.replacesPathId ? { replacesPathId: e.replacesPathId } : {}),
    lengthKm: e.lengthKm,
    active: e.active,
    source: `imported: ${e.origin.filename}`,
    confidence: 'medium',
    verification: e.verification,
    lastChecked: null,
  });
  route.features.push({
    type: 'Feature',
    id: e.id,
    geometry: { type: 'LineString', coordinates: e.geometry },
    properties: {
      schemaVersion: 2,
      id: e.id,
      featureRole: 'variant',
      order: 99,
      title: e.label,
      kind: 'walking',
      lengthKm: e.lengthKm,
      startAnchorId: e.divergeAnchorId,
      endAnchorId: e.rejoinAnchorId,
      active: e.active,
      ...(e.replacesPathId ? { replacesPathId: e.replacesPathId } : {}),
      rationale: e.reason || undefined,
      navigational: false,
      demonstration: false,
      source: `imported: ${e.origin.filename}`,
      confidence: 'medium',
      verification: e.verification,
      lastChecked: null,
      classification: 'public',
    },
  });
  // An edit that moves the line sideways leaves its own endpoints behind, and
  // this is REPORTED, not silently repaired.
  //
  // The obvious fix is to move the anchor onto the traced line. It is wrong.
  // Anchors carry `pathId` and `indexOnPath` into the BASE path, and a retrace
  // is a variant layered over that path, not a replacement for it — so an
  // anchor moved onto the variant no longer sits on the geometry it claims,
  // and `routeModel`'s "places every anchor on the geometry it claims to sit
  // on" fails. It was written that way first, and it corrupted a-036 on
  // 2026-09-13 before the test caught it.
  //
  // Below ANCHOR_ON_ROUTE_KM nothing needs doing: the anchor still projects
  // onto the active route and everything downstream resolves. Above it, the
  // edit is asking for a change this script cannot make safely — the base path
  // itself needs retracing, or the edit needs to end nearer its anchor.
  for (const id of [e.divergeAnchorId, e.rejoinAnchorId]) {
    if (!id) continue;
    const anchor = anchorOf(id);
    if (!anchor) continue;
    const p = anchor.geometry.coordinates;
    let nearest = Infinity;
    for (const q of e.geometry) nearest = Math.min(nearest, hav([q[0], q[1]], [p[0], p[1]]));
    if (nearest <= ANCHOR_ON_ROUTE_KM) continue;
    console.error(
      `\nREFUSED ${e.label}\n` +
        `  ${anchor.properties.title} ends up ${(nearest * 1000).toFixed(0)} m from this geometry, ` +
        `beyond the ${ANCHOR_ON_ROUTE_KM * 1000} m at which an anchor stops resolving as a day\n` +
        `  finish and a section boundary. Moving the anchor onto the traced line would put it off\n` +
        `  the base path it indexes into, which is a different kind of broken. Either end the trace\n` +
        `  nearer the anchor, or retrace the base path.`,
    );
    process.exit(1);
  }

  added++;
  console.log(`added ${e.label} (${e.lengthKm.toFixed(1)} km, ${e.kind})`);
}

if (added === 0 && splicedCount === 0) {
  console.log('Nothing to do.');
  process.exit(0);
}

// Bump the data version so a device can tell its cached route has moved.
const m = /^(\d+)\.(\d+)\.(\d+)(-.*)?$/.exec(meta.dataVersion);
meta.dataVersion = m ? `${m[1]}.${Number(m[2]) + 1}.0${m[4] ?? ''}` : `${meta.dataVersion}+edits`;
meta.generated = new Date().toISOString().slice(0, 10);

writeFileSync(join(DATA, 'route-meta.json'), JSON.stringify(meta, null, 2) + '\n');
writeFileSync(join(DATA, 'route.geojson'), JSON.stringify(route, null, 2) + '\n');
if (anchorsDirty) {
  writeFileSync(
    join(DATA, 'anchors.geojson'),
    JSON.stringify({ type: 'FeatureCollection', features: anchors }, null, 2) + '\n',
  );
  console.log('anchors.geojson rewritten with re-projected positions');
}
console.log(
  `\nbaked ${added + splicedCount} edit${added + splicedCount === 1 ? '' : 's'} into the shipped route` +
    (splicedCount ? ` (${splicedCount} spliced into an existing variant)` : ''),
);
console.log(`data version is now ${meta.dataVersion}`);
console.log('Delete them from the device once this is deployed.');
console.log(
  '\nNOW UPDATE `totals` in route-meta.json by hand: this script does not reassemble the\n' +
  'active route, so activeWalkingKm and the leg figures are still the pre-edit numbers.\n' +
  'The routeModel test "measures the assembled line as the sum of its parts" fails until\n' +
  'you do, which is the check — run `npm test` before believing anything here.',
);
