/**
 * Converts the preserved kaidotrail source into Samwise's canonical route model.
 *
 * SUPERSEDED 2026-08-23 by scripts/import-traced-route.mjs, which builds from
 * Kevin's road-snapped line. Kept because that line is a derivative of this
 * source and this is how the upstream original was first read. Running it will
 * overwrite the traced route with the coarser upstream one.
 *
 * RUN: npm run route:import-upstream
 *
 * Input:  route-sources/kaidotrail-2026-08-20/tokaido.js.original  (never edited)
 * Output: public/data/route.geojson    paths and variants as LineStrings
 *         public/data/anchors.geojson  named points, positioned along their path
 *         public/data/route-meta.json  project container, source, licence, status
 *
 * SOURCE: 旧街道足跡マップ (kaidotrail), CC BY-SA 4.0. GPS traces from people who
 * walked these roads. See route-sources/kaidotrail-2026-08-20/PROVENANCE.md for
 * the licence obligations, which bind any public deployment.
 *
 * WHAT THIS DOES NOT DO: verify anything. The output is a real route recorded by
 * real walkers, and it is still `navigational: false` — unchecked on the ground,
 * missing its last six kilometres into Kyoto, coarsely sampled through cities,
 * and following a Hakone line Kevin has already decided against.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'route-sources', 'kaidotrail-2026-08-20', 'tokaido.js.original');
const OUT = join(ROOT, 'public', 'data');
mkdirSync(OUT, { recursive: true });

const DATA_VERSION = '0.2.0-kaidotrail';
const GENERATED = '2026-08-20';

// --- geometry helpers -------------------------------------------------------

const R = 6371.0088;
const rad = (d) => (d * Math.PI) / 180;
function haversineKm(a, b) {
  const [la1, lo1] = [rad(a[0]), rad(a[1])];
  const [la2, lo2] = [rad(b[0]), rad(b[1])];
  const h =
    Math.sin((la2 - la1) / 2) ** 2 +
    Math.cos(la1) * Math.cos(la2) * Math.sin((lo2 - lo1) / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}
const lengthKm = (pts) => pts.slice(1).reduce((t, p, i) => t + haversineKm(pts[i], p), 0);
const round6 = (n) => Math.round(n * 1e6) / 1e6;
const omit = (obj, key) =>
  Object.fromEntries(Object.entries(obj).filter(([k]) => k !== key));

// --- parse ------------------------------------------------------------------

const src = readFileSync(SRC, 'utf8');

function parseArray(name) {
  const m = new RegExp(`const\\s+${name}\\s*=\\s*\\[(.*?)\\n\\];`, 's').exec(src);
  if (!m) throw new Error(`array not found: ${name}`);
  const pts = [];
  const labels = [];
  for (const line of m[1].split('\n')) {
    const c = /\[\s*(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)\s*\]/.exec(line);
    if (!c) continue;
    pts.push([Number(c[1]), Number(c[2])]); // [lat, lon] as written upstream
    const l = /\/\/\s*(.+?)\s*$/.exec(line);
    if (l) labels.push({ index: pts.length - 1, text: l[1] });
  }
  return { pts, labels };
}

const east = parseArray('tokaidoEastRoute');
const saya = parseArray('sayaRoute');
const west = parseArray('tokaidoWestRoute');

// --- names ------------------------------------------------------------------

/** Traditional Tokaido post stations, by number. */
const STATIONS = {
  1: 'Shinagawa-juku', 2: 'Kawasaki-juku', 3: 'Kanagawa-juku', 4: 'Hodogaya-juku',
  5: 'Totsuka-juku', 6: 'Fujisawa-juku', 7: 'Hiratsuka-juku', 8: 'Oiso-juku',
  9: 'Odawara-juku', 10: 'Hakone-juku', 11: 'Mishima-juku', 12: 'Numazu-juku',
  13: 'Hara-juku', 14: 'Yoshiwara-juku', 15: 'Kanbara-juku', 16: 'Yui-shuku',
  17: 'Okitsu-juku', 18: 'Ejiri-juku', 19: 'Fuchu-juku', 20: 'Mariko-juku',
  21: 'Okabe-juku', 22: 'Fujieda-juku', 23: 'Shimada-juku', 24: 'Kanaya-juku',
  25: 'Nissaka-juku', 26: 'Kakegawa-juku', 27: 'Fukuroi-juku', 28: 'Mitsuke-juku',
  29: 'Hamamatsu-juku', 30: 'Maisaka-juku', 31: 'Arai-juku', 32: 'Shirasuka-juku',
  33: 'Futagawa-juku', 34: 'Yoshida-juku', 35: 'Goyu-juku', 36: 'Akasaka-juku',
  37: 'Fujikawa-juku', 38: 'Okazaki-juku', 39: 'Chiryu-juku', 40: 'Narumi-juku',
  41: 'Miya-juku', 42: 'Kuwana-juku', 43: 'Yokkaichi-juku', 44: 'Ishiyakushi-juku',
  45: 'Shono-juku', 46: 'Kameyama-juku', 47: 'Seki-juku', 48: 'Sakashita-juku',
  49: 'Tsuchiyama-juku', 50: 'Minakuchi-juku', 51: 'Ishibe-juku', 52: 'Kusatsu-juku',
  53: 'Otsu-juku',
};

/** Landmarks. Left null where a confident reading was not available. */
const LANDMARKS = {
  '日本橋': 'Nihonbashi',
  '六郷橋': 'Rokugobashi',
  '八丁畷駅': 'Hatchonawate Station',
  '天王町駅': 'Tennocho Station',
  '藤沢宿交流館': 'Fujisawa-juku Koryukan',
  '馬入橋': 'Banyubashi',
  '松屋本陣': 'Matsuya Honjin',
  '国府津駅前': 'Kozu Station',
  '三枚橋': 'Sanmaibashi',
  '大澤坂入口': 'Osawa-zaka entrance',
  '畑宿本陣': 'Hatajuku Honjin',
  '七曲り': 'Nanamagari (the seven bends)',
  '箱根関所': 'Hakone Sekisho (checkpoint)',
  '三島大社': 'Mishima Taisha',
  '柚木駅': 'Yunoki Station',
  '富士川橋': 'Fujikawa Bridge',
  '由比駅': 'Yui Station',
  '薩埵峠': 'Satta Pass',
  '浦安橋': 'Urayasu Bridge',
  '草薙駅前': 'Kusanagi Station',
  '安倍川橋': 'Abekawa Bridge',
  '道の駅 宇津ノ谷峠': 'Michi-no-Eki Utsunoya-toge',
  '宇津ノ谷峠': 'Utsunoya Pass',
  '大井川橋': 'Oigawa Bridge',
  '小夜の中山': 'Sayo-no-Nakayama',
  '天竜川橋': 'Tenryugawa Bridge',
  '新居関所': 'Arai Sekisho (checkpoint)',
  '岩屋緑地入口': 'Iwaya Ryokuchi entrance',
  '中央競艇場前駅': 'Chuo-Kyoteijo-mae Station',
  '有松重伝建地区': 'Arimatsu preservation district',
  '東海道・佐屋街道分岐': 'Tokaido / Saya Kaido divergence',
  '東海道・佐屋街道分岐 (一旦七里の渡方向へ)': 'Tokaido / Saya Kaido divergence',
  '七里の渡': 'Shichiri-no-watashi (Miya ferry landing)',
  '七里の渡跡': 'Shichiri-no-watashi site (Kuwana landing)',
  '万場大橋': 'Manba Ohashi',
  '日光橋': 'Nikko Bridge',
  '尾張大橋': 'Owari Ohashi',
  '伊勢大橋': 'Ise Ohashi',
  '町屋橋': 'Machiya Bridge',
  '日永追分': 'Hinaga Oiwake',
  '内部橋': 'Utsube Bridge',
  '井田川駅': 'Idagawa Station',
  '鈴鹿峠': 'Suzuka Pass',
  '横田渡': 'Yokota-no-watashi',
  '三雲駅': 'Mikumo Station',
  '中山道・東海道合流地点': 'Nakasendo / Tokaido confluence',
  '瀬田の唐橋': 'Seta-no-Karahashi',
  '髭茶屋追分': 'Higechaya Oiwake',
};

function classify(ja, stationNumber) {
  if (stationNumber !== null) return 'post-station';
  if (/関所/.test(ja)) return 'checkpoint';
  if (/峠/.test(ja)) return 'pass';
  if (/橋/.test(ja)) return 'bridge';
  if (/駅/.test(ja)) return 'rail';
  if (/分岐|追分|合流/.test(ja)) return 'junction';
  if (/渡/.test(ja)) return 'ferry-site';
  return 'landmark';
}

let anchorSeq = 0;
function makeAnchor(label, pathId, pts) {
  const num = /^(\d+)\.\s*(.+)$/.exec(label.text);
  const ja = num ? num[2] : label.text;
  const stationNumber = num ? Number(num[1]) : null;

  // The west route labels Kusatsu 68 and Otsu 69, which is Nakasendo
  // numbering for the shared section after the confluence. Record both.
  const isNakasendoNumbering = stationNumber !== null && stationNumber > 53;
  const tokaidoNumber = isNakasendoNumbering
    ? { '草津宿': 52, '大津宿': 53 }[ja] ?? null
    : stationNumber;

  const en = stationNumber !== null ? (STATIONS[tokaidoNumber] ?? null) : (LANDMARKS[label.text] ?? null);
  const [lat, lon] = pts[label.index];

  return {
    id: `a-${String(++anchorSeq).padStart(3, '0')}`,
    titleJa: ja,
    title: en ?? ja,
    romanised: en !== null,
    kind: classify(ja, tokaidoNumber),
    stationNumber: tokaidoNumber,
    nakasendoNumber: isNakasendoNumbering ? stationNumber : null,
    pathId,
    indexOnPath: label.index,
    alongKm: Math.round(lengthKm(pts.slice(0, label.index + 1)) * 1000) / 1000,
    lat: round6(lat),
    lon: round6(lon),
    source: 'kaidotrail 2026-08-20',
    confidence: 'medium',
    verification: 'imported',
    lastChecked: null,
    classification: 'public',
  };
}

// --- paths and variants -----------------------------------------------------

const divergenceIdx = east.labels.find((l) => l.text.startsWith('東海道・佐屋街道分岐')).index;

// Sanity: the Saya route must begin where the east route diverges, and end
// where the west route begins. If upstream ever changes, fail loudly.
const dDiv = haversineKm(east.pts[divergenceIdx], saya.pts[0]);
const dJoin = haversineKm(saya.pts[saya.pts.length - 1], west.pts[0]);
if (dDiv > 0.05) throw new Error(`Saya divergence does not meet the east route: ${dDiv.toFixed(3)} km`);
if (dJoin > 0.05) throw new Error(`Saya rejoin does not meet the west route: ${dJoin.toFixed(3)} km`);

const anchors = [
  ...east.labels.map((l) => makeAnchor(l, 'path-east', east.pts)),
  ...saya.labels.map((l) => makeAnchor(l, 'variant-saya', saya.pts)),
  ...west.labels.map((l) => makeAnchor(l, 'path-west', west.pts)),
];

const byJa = (ja) => anchors.find((a) => a.titleJa === ja);
const anchorAt = (pathId, index) => anchors.find((a) => a.pathId === pathId && a.indexOnPath === index);

const geom = (pts) => pts.map(([lat, lon]) => [round6(lon), round6(lat)]); // GeoJSON order

const paths = [
  {
    id: 'path-east',
    order: 1,
    title: 'Nihonbashi to the Miya ferry landing',
    kind: 'walking',
    geometry: geom(east.pts),
    lengthKm: Math.round(lengthKm(east.pts) * 100) / 100,
    startAnchorId: byJa('日本橋').id,
    endAnchorId: byJa('七里の渡').id,
  },
  {
    id: 'gap-shichiri',
    order: 2,
    title: 'Seven-ri crossing — Miya to Kuwana',
    kind: 'ferry-gap',
    geometry: null,
    lengthKm: null,
    startAnchorId: byJa('七里の渡').id,
    endAnchorId: byJa('七里の渡跡').id,
    note:
      'The historical sea crossing. No ordinary ferry reproduces it. Left as a gap on purpose; activating the Saya Kaido variant closes it on land.',
    resolvedByVariantId: 'variant-saya',
  },
  {
    id: 'path-west',
    order: 3,
    title: 'Kuwana to Higechaya Oiwake',
    kind: 'walking',
    geometry: geom(west.pts),
    lengthKm: Math.round(lengthKm(west.pts) * 100) / 100,
    startAnchorId: byJa('桑名宿').id,
    endAnchorId: byJa('髭茶屋追分').id,
  },
  {
    id: 'gap-kyoto-approach',
    order: 4,
    title: 'Higechaya Oiwake to Sanjo Ohashi — MISSING',
    kind: 'unresolved',
    geometry: null,
    lengthKm: null,
    startAnchorId: byJa('髭茶屋追分').id,
    endAnchorId: null,
    note:
      'The source route ends at Higechaya Oiwake in Yamashina, roughly 6 km short of Sanjo Ohashi. This final approach into Kyoto has to be added before the route is complete.',
  },
];

const variants = [
  {
    id: 'variant-saya',
    title: 'Saya Kaido — the historical land route',
    rationale:
      'The Edo-period overland alternative to the Seven-ri sea crossing, via Saya and the Kiso Three Rivers bridges. Walking it makes the route continuous without inventing a modern line.',
    divergeAnchorId: anchorAt('path-east', divergenceIdx).id,
    rejoinAnchorId: byJa('桑名宿').id,
    replacesPathId: 'gap-shichiri',
    geometry: geom(saya.pts),
    lengthKm: Math.round(lengthKm(saya.pts) * 100) / 100,
    active: true,
    source: 'kaidotrail 2026-08-20',
    confidence: 'medium',
    verification: 'imported',
    lastChecked: null,
  },
];

// --- assemble ---------------------------------------------------------------

const eastToDivergence = lengthKm(east.pts.slice(0, divergenceIdx + 1));
const activeWalkingKm =
  eastToDivergence + variants[0].lengthKm + paths.find((p) => p.id === 'path-west').lengthKm;

const meta = {
  schemaVersion: 2,
  dataVersion: DATA_VERSION,
  generated: GENERATED,
  routeId: 'tokaido-2026',
  title: 'Tokaido — Nihonbashi to Sanjo Ohashi',
  direction: 'Tokyo to Kyoto',

  navigational: false,
  demonstration: false,
  verification: 'imported',
  notice:
    'IMPORTED SOURCE ROUTE, UNVERIFIED. GPS traces recorded by other walkers, not checked on the ground by anyone on this trip. The final approach into Kyoto is missing, urban sections are coarsely sampled, and the Hakone crossing follows the standard Old Tokaido rather than the hybrid line this project prefers. Hazards, bailouts and lodging remain placeholders. Do not navigate from this alone.',

  source: {
    name: '旧街道足跡マップ (kaidotrail)',
    url: 'https://kaidotrail.github.io/',
    repository: 'https://github.com/kaidotrail/kaidotrail.github.io',
    licence: 'CC BY-SA 4.0',
    attribution: '旧街道足跡マップ (kaidotrail), CC BY-SA 4.0, modified',
    retrieved: '2026-08-20',
    represents: 'GPS trajectories recorded by people who walked these roads',
    hasElevation: false,
    provenanceFile: 'route-sources/kaidotrail-2026-08-20/PROVENANCE.md',
  },

  totals: {
    activeWalkingKm: Math.round(activeWalkingKm * 100) / 100,
    eastKm: paths[0].lengthKm,
    sayaKm: variants[0].lengthKm,
    westKm: paths[2].lengthKm,
    missingKyotoApproachKmEstimate: 6,
    note:
      'Measured on the source geometry, which samples at roughly 100 m and therefore cuts corners. These figures are a floor. Densifying urban sections will increase them, and hotel access mileage is on top.',
  },

  knownWork: [
    'Add the final approach from Higechaya Oiwake to Sanjo Ohashi, roughly 6 km.',
    'Densify urban sampling. Mean spacing is 155 m through central Tokyo against 66 m across Hakone, which is backwards from what navigation needs.',
    'Replace the Hakone east slope between Hatajuku and the checkpoint with the Hiryu Falls / Ashinoyu hybrid line, per FOUNDATION.md. The branch anchor already exists at Hatajuku Honjin.',
    'Inspect the Hakone west slope around the Hakone Pass IC interchange for shoulder exposure.',
    'Two straight jumps over 1 km near Nihonbashi (source indices 4 and 6) cut corners through central Tokyo.',
  ],

  // Geometry lives in route.geojson; the meta file carries only the summary.
  paths: paths.map((p) => omit(p, 'geometry')),
  variants: variants.map((v) => omit(v, 'geometry')),
  anchorCount: anchors.length,
};

const routeCollection = {
  type: 'FeatureCollection',
  features: [
    ...paths
      .filter((p) => p.geometry)
      .map((p) => ({
        type: 'Feature',
        id: p.id,
        geometry: { type: 'LineString', coordinates: p.geometry },
        properties: {
          schemaVersion: 2,
          id: p.id,
          featureRole: 'path',
          order: p.order,
          title: p.title,
          kind: p.kind,
          lengthKm: p.lengthKm,
          startAnchorId: p.startAnchorId,
          endAnchorId: p.endAnchorId,
          navigational: false,
          demonstration: false,
          source: 'kaidotrail 2026-08-20',
          confidence: 'medium',
          verification: 'imported',
          lastChecked: null,
          classification: 'public',
        },
      })),
    ...variants.map((v) => ({
      type: 'Feature',
      id: v.id,
      geometry: { type: 'LineString', coordinates: v.geometry },
      properties: {
        schemaVersion: 2,
        id: v.id,
        featureRole: 'variant',
        order: 99,
        title: v.title,
        kind: 'walking',
        lengthKm: v.lengthKm,
        startAnchorId: v.divergeAnchorId,
        endAnchorId: v.rejoinAnchorId,
        active: v.active,
        replacesPathId: v.replacesPathId,
        rationale: v.rationale,
        navigational: false,
        demonstration: false,
        source: 'kaidotrail 2026-08-20',
        confidence: 'medium',
        verification: 'imported',
        lastChecked: null,
        classification: 'public',
      },
    })),
  ],
};

const anchorCollection = {
  type: 'FeatureCollection',
  features: anchors.map((a) => {
    const { lat, lon, ...rest } = a;
    return {
      type: 'Feature',
      id: a.id,
      geometry: { type: 'Point', coordinates: [lon, lat] },
      properties: { ...rest, navigational: false, demonstration: false },
    };
  }),
};

for (const [name, body] of Object.entries({
  'route-meta.json': meta,
  'route.geojson': routeCollection,
  'anchors.geojson': anchorCollection,
})) {
  const text = JSON.stringify(body, null, 2) + '\n';
  writeFileSync(join(OUT, name), text);
  console.log(`wrote data/${name} (${(Buffer.byteLength(text) / 1024).toFixed(0)} KB)`);
}

console.log('');
console.log(`paths:    ${paths.length} (${paths.filter((p) => p.geometry).length} with geometry)`);
console.log(`variants: ${variants.length}`);
console.log(`anchors:  ${anchors.length} (${anchors.filter((a) => a.romanised).length} romanised)`);
console.log(`stations: ${anchors.filter((a) => a.stationNumber !== null).length}`);
console.log('');
console.log(`east to divergence: ${eastToDivergence.toFixed(1)} km`);
console.log(`saya:               ${variants[0].lengthKm} km`);
console.log(`west:               ${paths[2].lengthKm} km`);
console.log(`ACTIVE WALKING:     ${meta.totals.activeWalkingKm} km  (+ ~6 km missing into Kyoto)`);
