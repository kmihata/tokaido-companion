/**
 * Rebuilds the shipped route from Kevin's traced GPX.
 *
 * RUN: npm run route:import   (then npm run fixtures)
 *
 * Input:  route-sources/kevin-traced-2026-08-22/tokaido.gpx.original
 * Output: public/data/route-meta.json, route.geojson, anchors.geojson
 *
 * This supersedes scripts/import-kaidotrail.mjs, which is kept for reference —
 * the traced line is a derivative of that source and inherits its CC BY-SA 4.0
 * licence. See the PROVENANCE.md files in both source folders.
 *
 * WHAT THIS DOES THAT A NAIVE REPLACEMENT WOULD NOT:
 *
 * The traced line is one continuous polyline, but the route model is paths,
 * gaps and variants — which is what lets the Miya–Kuwana crossing stay an
 * honest discontinuity that the Saya Kaido resolves. So the line is split back
 * apart at its anchors rather than flattened, and every anchor is re-projected
 * onto the new geometry to recover its position.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'route-sources', 'kevin-traced-2026-08-22', 'tokaido.gpx.original');
const OUT = join(ROOT, 'public', 'data');

const DATA_VERSION = '0.3.0-traced';
const GENERATED = '2026-08-23';

const R = 6371.0088;
const rad = (d) => (d * Math.PI) / 180;
const hav = (a, b) => {
  const [la1, lo1] = [rad(a[1]), rad(a[0])];
  const [la2, lo2] = [rad(b[1]), rad(b[0])];
  const h = Math.sin((la2 - la1) / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin((lo2 - lo1) / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
};
const len = (pts) => pts.slice(1).reduce((t, p, i) => t + hav(pts[i], p), 0);
const r6 = (n) => Math.round(n * 1e6) / 1e6;

// --- read the traced line ---------------------------------------------------
const gpx = readFileSync(SRC, 'utf8');
const line = [...gpx.matchAll(/<trkpt\s+lat="(-?[\d.]+)"\s+lon="(-?[\d.]+)"/g)].map((m) => [
  Number(m[2]),
  Number(m[1]),
]);
if (line.length < 1000) throw new Error(`Only ${line.length} points parsed — that is not the full route.`);

// --- the previous anchors, which carry the names ----------------------------
// This script reads its own previous output as input, so any anchor it added
// itself has to be dropped before it adds it again. Without this the terminus
// is appended afresh under a new id on every run, and the route quietly ends at
// several identical Sanjo Ohashi anchors — all of them offered in the day-end
// and section pickers, indistinguishable from each other. Three had already
// accumulated before anyone noticed.
const rawPrevAnchors = JSON.parse(readFileSync(join(OUT, 'anchors.geojson'), 'utf8')).features;
// Match on the name, not on a source marker: the re-projection loop below
// rewrites `source` on every anchor it touches, so only the most recent copy
// still carried the marker and the older ones survived the filter.
const TERMINUS_JA = '三条大橋';
const prevAnchors = rawPrevAnchors.filter((a) => a.properties.titleJa !== TERMINUS_JA);
if (rawPrevAnchors.length !== prevAnchors.length) {
  console.log(
    `  dropped ${rawPrevAnchors.length - prevAnchors.length} anchor(s) added by a previous run of this script`,
  );
}
const prevRoute = JSON.parse(readFileSync(join(OUT, 'route.geojson'), 'utf8')).features;
const prevMeta = JSON.parse(readFileSync(join(OUT, 'route-meta.json'), 'utf8'));

/** Nearest index on a polyline, and how far off it the point sits. */
function nearestOn(pts, p) {
  let best = { i: 0, d: Infinity };
  for (let i = 0; i < pts.length; i++) {
    const d = hav(pts[i], p);
    if (d < best.d) best = { i, d };
  }
  return best;
}

const anchorAt = (ja) => prevAnchors.find((a) => a.properties.titleJa === ja);
const coordOf = (ja) => anchorAt(ja).geometry.coordinates;

// --- split the line back into the model -------------------------------------
// The traced line runs Nihonbashi → Saya divergence → Kuwana → Sanjo Ohashi.
const iDiverge = nearestOn(line, coordOf('東海道・佐屋街道分岐 (一旦七里の渡方向へ)')).i;
const iKuwana = nearestOn(line, coordOf('桑名宿')).i;
if (!(iDiverge > 0 && iKuwana > iDiverge)) {
  throw new Error(`Junctions out of order: divergence ${iDiverge}, Kuwana ${iKuwana}`);
}

// The spur down to the Miya ferry landing is not walked when the Saya is
// active, but it is a real place. Carry it over from the previous geometry so
// the landing keeps a home on path-east.
const prevEast = prevRoute.find((f) => f.properties.id === 'path-east').geometry.coordinates;
const prevDivergeIdx = anchorAt('東海道・佐屋街道分岐 (一旦七里の渡方向へ)').properties.indexOnPath;
const spur = prevDivergeIdx != null ? prevEast.slice(prevDivergeIdx + 1) : [];

const pathEast = [...line.slice(0, iDiverge + 1), ...spur];
const saya = line.slice(iDiverge, iKuwana + 1);
const pathWest = line.slice(iKuwana);

console.log(`path-east   ${pathEast.length} pts, ${len(pathEast).toFixed(1)} km (incl. ${spur.length}-pt ferry spur)`);
console.log(`variant-saya ${saya.length} pts, ${len(saya).toFixed(1)} km`);
console.log(`path-west   ${pathWest.length} pts, ${len(pathWest).toFixed(1)} km`);

const geoms = { 'path-east': pathEast, 'variant-saya': saya, 'path-west': pathWest };

// --- re-project every anchor ------------------------------------------------
/**
 * A few anchors carry names that are identical in English, which makes them
 * indistinguishable in a picker. Disambiguate the ones that matter.
 */
// The romanised English titles are generated from the Japanese, and the
// generator drops trailing qualifiers. 駅前 means the forecourt in front of a
// station, not the station itself: the anchor marks where the Tokaido passes
// the station, which is several hundred metres from the building a map search
// will show you. Labelling it "Kozu Station" makes a correct anchor look
// misplaced. Say what it is.
const TITLE_OVERRIDES = {
  'a-015': 'Outside Kozu Station',
  'a-036': 'Outside Kusanagi Station',
  'a-069': 'Saya Kaido junction (on the Tokaido)',
  'a-071': 'Saya Kaido start',
};

/**
 * Where a junction anchor belongs, when the coordinate alone cannot say.
 *
 * The point where the Saya Kaido leaves the Tokaido is the last point of one
 * geometry and the first point of another; Kuwana is the same at the far end.
 * Nearest-point matching picks whichever was checked first, which put the
 * Saya's own start on the east path — and an edit to the Saya then looked like
 * a second route leaving the Tokaido at the same junction, so both got walked.
 * These are stated rather than inferred.
 */
const PATH_OVERRIDES = {
  'a-069': 'path-east',    // the junction as seen from the Tokaido
  'a-070': 'path-east',    // the ferry landing, on the spur
  'a-071': 'variant-saya', // the start of the Saya itself
  'a-076': 'variant-saya', // the Kuwana landing, end of the Saya
  'a-077': 'path-west',    // Kuwana-juku, start of the west path
};

const anchors = [];
const drifted = [];
for (const prev of prevAnchors) {
  const p = prev.geometry.coordinates;
  let best = null;
  for (const [pathId, pts] of Object.entries(geoms)) {
    const n = nearestOn(pts, p);
    if (best === null || n.d < best.d) best = { pathId, ...n };
  }

  // Junctions sit on two geometries at once — the point where the Saya leaves
  // the Tokaido is the last point of one and the first of the other. Picking
  // whichever was checked first moved the Saya's own start onto the east path,
  // which then made an edit to the Saya look like a second route leaving the
  // Tokaido at the same place. Keep the anchor where it already was whenever
  // that is equally close.
  const forced = PATH_OVERRIDES[prev.properties.id];
  if (forced && geoms[forced]) {
    best = { pathId: forced, ...nearestOn(geoms[forced], p) };
  } else {
    // Otherwise keep an anchor on the geometry it already belonged to whenever
    // that is equally close, so a coincident point does not drift between them.
    const keep = nearestOn(geoms[prev.properties.pathId] ?? [], p);
    if (geoms[prev.properties.pathId] && keep.d <= best.d + 0.005) {
      best = { pathId: prev.properties.pathId, ...keep };
    }
  }
  if (best.d > 0.5) drifted.push([prev.properties.title, best.d]);
  const pts = geoms[best.pathId];
  anchors.push({
    ...prev,
    geometry: { type: 'Point', coordinates: [r6(pts[best.i][0]), r6(pts[best.i][1])] },
    properties: {
      ...prev.properties,
      title: TITLE_OVERRIDES[prev.properties.id] ?? prev.properties.title,
      pathId: best.pathId,
      indexOnPath: best.i,
      alongKm: Math.round(len(pts.slice(0, best.i + 1)) * 1000) / 1000,
      source: 'kevin-traced 2026-08-22 (from kaidotrail, CC BY-SA 4.0)',
    },
  });
}
console.log(`\nanchors re-projected: ${anchors.length}`);
if (drifted.length) {
  console.log('  moved more than 500 m:');
  for (const [t, d] of drifted) console.log(`    ${t}: ${d.toFixed(2)} km`);
} else {
  console.log('  none moved more than 500 m');
}

// The traced line reaches Sanjo Ohashi, which the upstream source never did, so
// the terminus needs an anchor of its own. Without one the route would end at a
// nameless coordinate and the last day would have nothing to finish at.
{
  const last = pathWest.length - 1;
  // Derived from the highest id actually present, not the count, so a gap in
  // the sequence cannot silently reissue an id that is already in use.
  const highest = prevAnchors.reduce((m, a) => {
    const n = Number(/^a-(\d+)$/.exec(a.properties.id)?.[1] ?? 0);
    return Number.isFinite(n) && n > m ? n : m;
  }, 0);
  const nextId = `a-${String(highest + 1).padStart(3, '0')}`;
  anchors.push({
    type: 'Feature',
    id: nextId,
    geometry: { type: 'Point', coordinates: [r6(pathWest[last][0]), r6(pathWest[last][1])] },
    properties: {
      id: nextId,
      titleJa: TERMINUS_JA,
      title: 'Sanjo Ohashi',
      romanised: true,
      kind: 'bridge',
      stationNumber: null,
      nakasendoNumber: null,
      pathId: 'path-west',
      indexOnPath: last,
      alongKm: Math.round(len(pathWest) * 1000) / 1000,
      navigational: false,
      demonstration: false,
      source: 'kevin-traced 2026-08-22 — route terminus',
      confidence: 'medium',
      verification: 'manually-traced',
      lastChecked: null,
      classification: 'public',
    },
  });
  console.log(`  added terminus anchor ${nextId} Sanjo Ohashi at ${anchors.at(-1).properties.alongKm} km on path-west`);
}

const byJa = (ja) => anchors.find((a) => a.properties.titleJa === ja);
const idOf = (ja) => byJa(ja).properties.id;
// The Saya branches from the junction marked on the east path, not the
// duplicate label that opens the variant itself.
const divergeJa = '東海道・佐屋街道分岐 (一旦七里の渡方向へ)';

// --- assemble ---------------------------------------------------------------
const paths = [
  {
    id: 'path-east', order: 1,
    title: 'Nihonbashi to the Miya ferry landing',
    kind: 'walking', lengthKm: Math.round(len(pathEast) * 100) / 100,
    startAnchorId: idOf('日本橋'), endAnchorId: idOf('七里の渡'),
  },
  {
    id: 'gap-shichiri', order: 2,
    title: 'Seven-ri crossing — Miya to Kuwana',
    kind: 'ferry-gap', lengthKm: null,
    startAnchorId: idOf('七里の渡'), endAnchorId: idOf('七里の渡跡'),
    note: 'The historical sea crossing. No ordinary ferry reproduces it. Left as a gap on purpose; the Saya Kaido variant closes it on land.',
    resolvedByVariantId: 'variant-saya',
  },
  {
    id: 'path-west', order: 3,
    title: 'Kuwana to Sanjo Ohashi',
    kind: 'walking', lengthKm: Math.round(len(pathWest) * 100) / 100,
    startAnchorId: idOf('桑名宿'), endAnchorId: idOf('三条大橋'),
  },
];

const variants = [
  {
    id: 'variant-saya',
    title: 'Saya Kaido — the historical land route',
    rationale: 'The Edo-period overland alternative to the Seven-ri sea crossing, via Saya and the Kiso Three Rivers bridges. Walking it makes the route continuous without inventing a modern line.',
    divergeAnchorId: idOf(divergeJa),
    rejoinAnchorId: idOf('桑名宿'),
    replacesPathId: 'gap-shichiri',
    lengthKm: Math.round(len(saya) * 100) / 100,
    active: true,
    source: 'kevin-traced 2026-08-22 (from kaidotrail, CC BY-SA 4.0)',
    confidence: 'medium', verification: 'manually-traced', lastChecked: null,
  },
];

const activeKm = len(pathEast.slice(0, iDiverge + 1)) + len(saya) + len(pathWest);

// Two anchors sharing an id, or sitting on the same spot under the same name,
// are the failure that put 45 km on the route once already: the pickers show
// two identical rows and there is no way to tell which one an edit attached to.
{
  const seen = new Map();
  const dupIds = [];
  const coincident = [];
  for (const a of anchors) {
    const { id, titleJa } = a.properties;
    if (seen.has(id)) dupIds.push(id);
    seen.set(id, a);
    for (const b of anchors) {
      if (b === a || b.properties.id >= id) continue;
      if (b.properties.titleJa !== titleJa) continue;
      const [x1, y1] = a.geometry.coordinates;
      const [x2, y2] = b.geometry.coordinates;
      if (Math.abs(x1 - x2) < 1e-5 && Math.abs(y1 - y2) < 1e-5) {
        coincident.push(`${b.properties.id}/${id} ${titleJa}`);
      }
    }
  }
  if (dupIds.length) throw new Error(`duplicate anchor ids: ${dupIds.join(', ')}`);
  if (coincident.length) {
    throw new Error(`anchors sharing a name and a position: ${coincident.join('; ')}`);
  }
  console.log(`  ${anchors.length} anchors, ids unique, no coincident duplicates`);
}

const meta = {
  schemaVersion: 2, dataVersion: DATA_VERSION, generated: GENERATED,
  routeId: 'tokaido-2026',
  title: 'Tokaido — Nihonbashi to Sanjo Ohashi',
  direction: 'Tokyo to Kyoto',
  navigational: false, demonstration: false, verification: 'manually-traced',
  notice:
    'TRACED BUT UNVERIFIED. Road-snapped in an external editor and reaching Sanjo Ohashi, but not checked on the ground by anyone on this trip. Several sections are still coarsely sampled, the Hakone crossing follows the standard Old Tokaido rather than the hybrid line this project prefers, and the Hakone Pass IC shoulder is unresolved. Hazards, bailouts and lodging remain placeholders. Do not navigate from this alone.',
  source: {
    name: '旧街道足跡マップ (kaidotrail), traced and extended by Kevin',
    url: 'https://kaidotrail.github.io/',
    repository: 'https://github.com/kaidotrail/kaidotrail.github.io',
    licence: 'CC BY-SA 4.0',
    attribution: '旧街道足跡マップ (kaidotrail), CC BY-SA 4.0, modified',
    retrieved: '2026-08-20', represents: 'GPS trajectories recorded by walkers, road-snapped and extended to Sanjo Ohashi on 2026-08-22',
    hasElevation: false,
    provenanceFile: 'route-sources/kevin-traced-2026-08-22/PROVENANCE.md',
  },
  totals: {
    activeWalkingKm: Math.round(activeKm * 100) / 100,
    eastKm: Math.round(len(pathEast) * 100) / 100,
    sayaKm: Math.round(len(saya) * 100) / 100,
    westKm: Math.round(len(pathWest) * 100) / 100,
    missingKyotoApproachKmEstimate: 0,
    note: 'Measured on the traced line, which is road-snapped at a mean 69 m point spacing. Sections still coarser than that cut corners and read slightly short; see the section screen for which. Hotel access mileage is on top.',
  },
  knownWork: [
    'Trace the coarsest remaining sections. Only 8 of 92 are at 60 m point spacing or better; the section screen ranks them.',
    'Replace the Hakone east slope between Hatajuku and the checkpoint with the Hiryu Falls / Ashinoyu hybrid, per FOUNDATION.md. The branch anchor exists at Hatajuku Honjin.',
    'Resolve the Hakone Pass IC interchange on the west slope — a route decision needing Street View, not more points.',
    'Verify the Saya Kaido bridges over the Kiso Three Rivers for pedestrian legality.',
  ],
  paths, variants, anchorCount: anchors.length,
};

const routeCollection = {
  type: 'FeatureCollection',
  features: [
    ...paths.filter((p) => geoms[p.id]).map((p) => ({
      type: 'Feature', id: p.id,
      geometry: { type: 'LineString', coordinates: geoms[p.id].map(([lon, lat]) => [r6(lon), r6(lat)]) },
      properties: {
        schemaVersion: 2, id: p.id, featureRole: 'path', order: p.order,
        title: p.title, kind: p.kind, lengthKm: p.lengthKm,
        startAnchorId: p.startAnchorId, endAnchorId: p.endAnchorId,
        navigational: false, demonstration: false,
        source: 'kevin-traced 2026-08-22 (from kaidotrail, CC BY-SA 4.0)',
        confidence: 'medium', verification: 'manually-traced', lastChecked: null,
        classification: 'public',
      },
    })),
    ...variants.map((v) => ({
      type: 'Feature', id: v.id,
      geometry: { type: 'LineString', coordinates: geoms[v.id].map(([lon, lat]) => [r6(lon), r6(lat)]) },
      properties: {
        schemaVersion: 2, id: v.id, featureRole: 'variant', order: 99,
        title: v.title, kind: 'walking', lengthKm: v.lengthKm,
        startAnchorId: v.divergeAnchorId, endAnchorId: v.rejoinAnchorId,
        active: v.active, replacesPathId: v.replacesPathId, rationale: v.rationale,
        navigational: false, demonstration: false,
        source: 'kevin-traced 2026-08-22 (from kaidotrail, CC BY-SA 4.0)',
        confidence: 'medium', verification: 'manually-traced', lastChecked: null,
        classification: 'public',
      },
    })),
  ],
};

const anchorCollection = { type: 'FeatureCollection', features: anchors };

for (const [name, body] of Object.entries({
  'route-meta.json': meta,
  'route.geojson': routeCollection,
  'anchors.geojson': anchorCollection,
})) {
  const text = JSON.stringify(body, null, 2) + '\n';
  writeFileSync(join(OUT, name), text);
  console.log(`wrote data/${name} (${(Buffer.byteLength(text) / 1024).toFixed(0)} KB)`);
}

console.log(`\nACTIVE WALKING: ${meta.totals.activeWalkingKm} km`);
console.log(`  was ${prevMeta.totals.activeWalkingKm} km (+${(activeKm - prevMeta.totals.activeWalkingKm).toFixed(1)})`);
console.log(`  Kyoto approach gap: CLOSED`);
