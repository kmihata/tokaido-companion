/**
 * Generates three diagnostic GPX files for testing the Footpath handoff chain.
 *
 * WHY THIS EXISTS: the entire route-workbench plan depends on an unverified
 * assumption — that a GPX file produced by this app can reach Footpath on an
 * iPhone and be used to navigate. Before building an export system, test the
 * chain with hand-made files. Each file isolates one question. See the
 * "Footpath handoff" section of HANDOFF.md for results.
 *
 * The coordinates are approximate placemarks, like everything else in this
 * build. They are not a road. That does not matter here: this tests file
 * plumbing, not navigation.
 *
 * RUN: node scripts/make-footpath-test-gpx.mjs
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'footpath-test');
mkdirSync(OUT, { recursive: true });

const GENERATED = '2026-08-18T00:00:00Z';

// --- Odawara toward Hakone-Yumoto, roughly 5 km along the valley corridor. ---
// [lat, lon, elevation metres]. Elevation rises from ~15 m to ~110 m.
const ODAWARA_YUMOTO = [
  [35.2560, 139.1550, 15], [35.2551, 139.1531, 16], [35.2542, 139.1512, 18],
  [35.2534, 139.1493, 20], [35.2527, 139.1473, 22], [35.2519, 139.1452, 25],
  [35.2510, 139.1432, 28], [35.2500, 139.1414, 31], [35.2489, 139.1398, 34],
  [35.2478, 139.1383, 38], [35.2467, 139.1369, 42], [35.2456, 139.1354, 46],
  [35.2446, 139.1338, 51], [35.2437, 139.1321, 56], [35.2429, 139.1303, 61],
  [35.2421, 139.1285, 66], [35.2412, 139.1268, 71], [35.2403, 139.1251, 76],
  [35.2394, 139.1234, 81], [35.2385, 139.1217, 86], [35.2376, 139.1200, 90],
  [35.2368, 139.1182, 94], [35.2360, 139.1164, 98], [35.2352, 139.1146, 101],
  [35.2345, 139.1127, 104], [35.2338, 139.1108, 106], [35.2332, 139.1088, 108],
  [35.2328, 139.1069, 109], [35.2325, 139.1050, 110],
];

// --- The Seven-ri gap: Miya/Atsuta landing, then Kuwana landing, ~21 km of
// water between them. No walking line exists. This is the real discontinuity.
const MIYA = [
  [35.1310, 136.9140], [35.1301, 136.9122], [35.1293, 136.9105],
  [35.1286, 136.9092], [35.1280, 136.9080],
];
const KUWANA = [
  [35.0620, 136.6930], [35.0627, 136.6913], [35.0634, 136.6897],
  [35.0641, 136.6881], [35.0648, 136.6864],
];

const esc = (s) => s.replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]);

function header(name, desc) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Samwise — diagnostic fixture"
     xmlns="http://www.topografix.com/GPX/1/1"
     xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
     xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">
  <metadata>
    <name>${esc(name)}</name>
    <desc>${esc(desc)}</desc>
    <time>${GENERATED}</time>
  </metadata>
`;
}

const wpt = (lat, lon, name, desc) =>
  `  <wpt lat="${lat}" lon="${lon}">\n    <name>${esc(name)}</name>\n    <desc>${esc(desc)}</desc>\n  </wpt>\n`;

const trkpt = ([lat, lon, ele]) =>
  ele === undefined
    ? `      <trkpt lat="${lat}" lon="${lon}"></trkpt>\n`
    : `      <trkpt lat="${lat}" lon="${lon}"><ele>${ele}</ele></trkpt>\n`;

const rtept = ([lat, lon, ele]) =>
  ele === undefined
    ? `    <rtept lat="${lat}" lon="${lon}"></rtept>\n`
    : `    <rtept lat="${lat}" lon="${lon}"><ele>${ele}</ele></rtept>\n`;

// ---------------------------------------------------------------------------
// A. <trk> with one segment, elevation, and three waypoints.
//    The commonest export shape. Tests: does it import, does the internal
//    name survive, do waypoints survive, does elevation survive.
// ---------------------------------------------------------------------------
let a = header(
  'D04 ACTIVE — Odawara to Hakone-Yumoto',
  'DIAGNOSTIC TEST FILE. Approximate placemarks, not a road. Do not navigate.',
);
a += wpt(35.2560, 139.1550, 'Odawara Station', 'Day start. Rail bailout.');
a += wpt(35.2437, 139.1321, 'Hazard — test annotation', 'Does a mid-route waypoint survive import?');
a += wpt(35.2325, 139.1050, 'Hakone-Yumoto', 'Planned stop.');
a += `  <trk>
    <name>D04 ACTIVE — Odawara to Hakone-Yumoto</name>
    <trkseg>
${ODAWARA_YUMOTO.map(trkpt).join('')}    </trkseg>
  </trk>
</gpx>
`;

// ---------------------------------------------------------------------------
// B. <rte> with the same geometry and no elevation.
//    Footpath's docs describe a GPX route as one continuous route. Tests
//    whether <rte> and <trk> are handled differently, and whether a missing
//    <ele> causes trouble.
// ---------------------------------------------------------------------------
let b = header(
  'D04 CONTINUE — Odawara to Hakone-Yumoto',
  'DIAGNOSTIC TEST FILE. Route element, no elevation. Not a road.',
);
b += `  <rte>
    <name>D04 CONTINUE — Odawara to Hakone-Yumoto</name>
${ODAWARA_YUMOTO.map(([lat, lon]) => rtept([lat, lon])).join('')}  </rte>
</gpx>
`;

// ---------------------------------------------------------------------------
// C. THE IMPORTANT ONE. <trk> with two segments 21 km apart across water:
//    the historic Miya–Kuwana Seven-ri ferry gap.
//
//    If Footpath draws a straight line across the bay, then exporting any
//    route containing a discontinuity as a single file is dangerous, and the
//    app must always emit separate files per continuous walking section.
//    If Footpath keeps the gap, a single master file is safe.
//    This one answer determines the export architecture.
// ---------------------------------------------------------------------------
let c = header(
  'TEST GAP — Miya to Kuwana (21 km discontinuity)',
  'DIAGNOSTIC TEST FILE. Two track segments with a real gap between them. Does the app bridge it?',
);
c += wpt(35.1280, 136.9080, 'Miya ferry landing', 'End of walking section 1.');
c += wpt(35.0620, 136.6930, 'Kuwana ferry landing', 'Start of walking section 2.');
c += `  <trk>
    <name>TEST GAP — Miya to Kuwana</name>
    <trkseg>
${MIYA.map(([lat, lon]) => trkpt([lat, lon])).join('')}    </trkseg>
    <trkseg>
${KUWANA.map(([lat, lon]) => trkpt([lat, lon])).join('')}    </trkseg>
  </trk>
</gpx>
`;

// ---------------------------------------------------------------------------
// D. The follow-up to C. Same two walking sections, same real gap, but as two
//    separate <trk> ELEMENTS rather than two <trkseg> inside one <trk>.
//
//    C established that Footpath bridges multiple <trkseg> into one line. Many
//    applications treat multiple <trk> elements as separate routes instead. If
//    Footpath does, a single file can carry several continuous walking sections
//    with the discontinuities intact, and a master reference export stays
//    possible. If it bridges these too, the app must emit one file per
//    continuous walking section, always.
// ---------------------------------------------------------------------------
let d = header(
  'TEST MULTI — Miya and Kuwana as separate tracks',
  'DIAGNOSTIC TEST FILE. Two separate <trk> elements. Does the app keep them apart or join them?',
);
d += wpt(35.1280, 136.9080, 'Miya ferry landing', 'End of walking section 1.');
d += wpt(35.0620, 136.6930, 'Kuwana ferry landing', 'Start of walking section 2.');
d += `  <trk>
    <name>D12a MIYA — walking section</name>
    <trkseg>
${MIYA.map(([lat, lon]) => trkpt([lat, lon])).join('')}    </trkseg>
  </trk>
  <trk>
    <name>D12b KUWANA — walking section</name>
    <trkseg>
${KUWANA.map(([lat, lon]) => trkpt([lat, lon])).join('')}    </trkseg>
  </trk>
</gpx>
`;

const files = [
  ['TEST-A-track-with-waypoints.gpx', a],
  ['TEST-B-route-element.gpx', b],
  ['TEST-C-gap-two-segments.gpx', c],
  ['TEST-D-two-track-elements.gpx', d],
];

for (const [name, body] of files) {
  writeFileSync(join(OUT, name), body);
  console.log(`wrote footpath-test/${name} (${Buffer.byteLength(body)} bytes)`);
}
