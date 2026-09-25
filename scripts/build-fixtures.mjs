/**
 * Regenerates the public demonstration fixtures in public/data/.
 *
 * RUN: npm run fixtures
 *
 * ------------------------------------------------------------------------
 * MIXED PROVENANCE. READ BEFORE TRUSTING ANY COORDINATE.
 *
 * Since 2026-08-20 this script reads public/data/anchors.geojson — produced by
 * scripts/import-kaidotrail.mjs from a real GPS-traced source route — and takes
 * coordinates from it wherever a fixture corresponds to a labelled point on the
 * route. Those coordinates are REAL, at `verification: imported`.
 *
 * Everything it cannot match stays an APPROXIMATE PLACEMARK written from
 * general knowledge, good to roughly a neighbourhood and sometimes worse, at
 * `verification: unverified`. The provenance fields on every record say which
 * is which, and `positionSource` names where the coordinate came from.
 *
 * The schematic corridor sketch this script used to emit is GONE. The route now
 * lives in public/data/route.geojson and comes from the source import.
 *
 * ORDER MATTERS: run `npm run route:import` before `npm run fixtures`.
 * See DATA-SCHEMAS.md.
 * ------------------------------------------------------------------------
 */
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'data');
mkdirSync(OUT, { recursive: true });

// Real coordinates from the imported source route, when it is present.
const ANCHOR_FILE = join(OUT, 'anchors.geojson');
if (!existsSync(ANCHOR_FILE)) {
  throw new Error('public/data/anchors.geojson is missing. Run `npm run route:import` first.');
}
const anchorFeatures = JSON.parse(readFileSync(ANCHOR_FILE, 'utf8')).features;

/** Find an anchor by traditional station number. */
const anchorByStation = (n) =>
  anchorFeatures.find((f) => f.properties.stationNumber === n) ?? null;

/** Find an anchor by its Japanese label. */
const anchorByJa = (ja) => anchorFeatures.find((f) => f.properties.titleJa === ja) ?? null;

const anchorPos = (f) => (f ? { lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0] } : null);

const DATA_VERSION = '0.1.0-demo';
const GENERATED = '2026-08-18';

/** Shared provenance stamp for every generated record. */
const DEMO = {
  source: 'demonstration-fixture',
  confidence: 'demonstration',
  verification: 'unverified',
};

// ---------------------------------------------------------------------------
// Stations. A deliberate SUBSET, not all fifty-three. Building the full
// fifty-three-station ledger is a named non-goal for this build.
// `number` is the traditional post-station number; Nihonbashi and Sanjo Ohashi
// are the endpoints and carry no station number.
// ---------------------------------------------------------------------------
const stations = [
  { id: 'st-nihonbashi',  number: null, name: 'Nihonbashi',        modern: 'Chuo, Tokyo',        lat: 35.6841, lon: 139.7743 },
  { id: 'st-shinagawa',   number: 1,    name: 'Shinagawa-juku',    modern: 'Shinagawa, Tokyo',   lat: 35.6285, lon: 139.7387 },
  { id: 'st-kawasaki',    number: 2,    name: 'Kawasaki-juku',     modern: 'Kawasaki',           lat: 35.5308, lon: 139.7029 },
  { id: 'st-kanagawa',    number: 3,    name: 'Kanagawa-juku',     modern: 'Yokohama',           lat: 35.4657, lon: 139.6220 },
  { id: 'st-hodogaya',    number: 4,    name: 'Hodogaya-juku',     modern: 'Yokohama',           lat: 35.4463, lon: 139.5980 },
  { id: 'st-totsuka',     number: 5,    name: 'Totsuka-juku',      modern: 'Yokohama',           lat: 35.4004, lon: 139.5340 },
  { id: 'st-fujisawa',    number: 6,    name: 'Fujisawa-juku',     modern: 'Fujisawa',           lat: 35.3390, lon: 139.4890 },
  { id: 'st-odawara',     number: 9,    name: 'Odawara-juku',      modern: 'Odawara',            lat: 35.2560, lon: 139.1550 },
  { id: 'st-hakone',      number: 10,   name: 'Hakone-juku',       modern: 'Hakone (Lake Ashi)', lat: 35.2020, lon: 139.0250 },
  { id: 'st-mishima',     number: 11,   name: 'Mishima-juku',      modern: 'Mishima',            lat: 35.1260, lon: 138.9110 },
  { id: 'st-yui',         number: 16,   name: 'Yui-shuku',         modern: 'Shizuoka (Yui)',     lat: 35.1030, lon: 138.5670 },
  { id: 'st-fuchu',       number: 19,   name: 'Fuchu-juku',        modern: 'Shizuoka',           lat: 34.9760, lon: 138.3830 },
  { id: 'st-mariko',      number: 20,   name: 'Mariko-juku',       modern: 'Shizuoka (Mariko)',  lat: 34.9550, lon: 138.3260 },
  { id: 'st-okabe',       number: 21,   name: 'Okabe-juku',        modern: 'Fujieda (Okabe)',    lat: 34.9210, lon: 138.2680 },
  { id: 'st-kakegawa',    number: 26,   name: 'Kakegawa-juku',     modern: 'Kakegawa',           lat: 34.7690, lon: 138.0140 },
  { id: 'st-hamamatsu',   number: 29,   name: 'Hamamatsu-juku',    modern: 'Hamamatsu',          lat: 34.7050, lon: 137.7340 },
  { id: 'st-arai',        number: 31,   name: 'Arai-juku',         modern: 'Kosai (Arai)',       lat: 34.6970, lon: 137.5590 },
  { id: 'st-yoshida',     number: 34,   name: 'Yoshida-juku',      modern: 'Toyohashi',          lat: 34.7630, lon: 137.3910 },
  { id: 'st-okazaki',     number: 38,   name: 'Okazaki-juku',      modern: 'Okazaki',            lat: 34.9540, lon: 137.1740 },
  { id: 'st-miya',        number: 41,   name: 'Miya-juku',         modern: 'Nagoya (Atsuta)',    lat: 35.1280, lon: 136.9080 },
  { id: 'st-kuwana',      number: 42,   name: 'Kuwana-juku',       modern: 'Kuwana',             lat: 35.0620, lon: 136.6930 },
  { id: 'st-yokkaichi',   number: 43,   name: 'Yokkaichi-juku',    modern: 'Yokkaichi',          lat: 34.9650, lon: 136.6240 },
  { id: 'st-kameyama',    number: 46,   name: 'Kameyama-juku',     modern: 'Kameyama',           lat: 34.8560, lon: 136.4520 },
  { id: 'st-seki',        number: 47,   name: 'Seki-juku',         modern: 'Kameyama (Seki)',    lat: 34.8500, lon: 136.3930 },
  { id: 'st-sakashita',   number: 48,   name: 'Sakashita-juku',    modern: 'Kameyama (Sakashita)', lat: 34.8720, lon: 136.3400 },
  { id: 'st-tsuchiyama',  number: 49,   name: 'Tsuchiyama-juku',   modern: 'Koka (Tsuchiyama)',  lat: 34.9200, lon: 136.2500 },
  { id: 'st-minakuchi',   number: 50,   name: 'Minakuchi-juku',    modern: 'Koka (Minakuchi)',   lat: 34.9680, lon: 136.1660 },
  { id: 'st-ishibe',      number: 51,   name: 'Ishibe-juku',       modern: 'Konan (Ishibe)',     lat: 35.0030, lon: 136.0430 },
  { id: 'st-kusatsu',     number: 52,   name: 'Kusatsu-juku',      modern: 'Kusatsu, Shiga',     lat: 35.0170, lon: 135.9600 },
  { id: 'st-otsu',        number: 53,   name: 'Otsu-juku',         modern: 'Otsu',               lat: 35.0060, lon: 135.8650 },
  { id: 'st-sanjo',       number: null, name: 'Sanjo Ohashi',      modern: 'Kyoto',              lat: 35.0093, lon: 135.7727 },
].map((s) => {
  // Prefer a real coordinate from the imported route. Nihonbashi and the two
  // ends carry no station number, so fall back to matching the label; Kawasaki
  // (#2) and Hakone (#10) are not labelled upstream and keep their estimates.
  const anchor =
    (s.number !== null ? anchorByStation(s.number) : null) ??
    ({
      'st-nihonbashi': anchorByJa('日本橋'),
      'st-miya': anchorByJa('七里の渡'),
      'st-hakone': anchorByJa('箱根関所'),
      'st-sanjo': anchorByJa('三条大橋'),
    }[s.id] ?? null);
  const pos = anchorPos(anchor);
  const real = pos !== null;
  return {
    ...s,
    ...(real ? pos : {}),
    ...DEMO,
    ...(real
      ? {
          source: 'kaidotrail 2026-08-20 (route anchor)',
          confidence: 'medium',
          verification: 'imported',
        }
      : {}),
    kind: 'tokaido-station',
    anchorId: anchor?.properties.id ?? null,
    positionSource: real ? 'source-route-anchor' : 'operator-estimate',
    notes:
      s.number === null
        ? 'Route terminus, not a numbered post station.'
        : `Traditional post station #${s.number}. Surviving remnant, marker, and access all unresearched.`,
    lastChecked: null,
    visibility: 'unknown',
    classification: 'public',
  };
});

// ---------------------------------------------------------------------------
// Days. Dates, plans, and nominal distances trace DAILY-SCHEDULE-DRAFT.md,
// which is itself explicitly a balancing draft rather than a navigable route.
// Door-to-door figures are rough inflations, not measurements.
// ---------------------------------------------------------------------------
function day(o) {
  return {
    schemaVersion: 1,
    provisional: true,
    bailoutWaypointIds: [],
    hazardWaypointIds: [],
    stationIds: [],
    editorialPrompts: [],
    hiroshigeRefIds: [],
    safetyNotes: [],
    verificationTasks: [],
    weatherSensitive: [],
    source: 'DAILY-SCHEDULE-DRAFT.md (2026-08-16 balancing draft)',
    ...o,
  };
}

const days = [
  day({ id: 'd-2026-10-18', date: '2026-10-18', kind: 'travel', label: 'Travel', plan: 'SEA 13:20 departure, AS 123.', sleepBase: 'Aircraft', tiredDaySummary: 'No walking target. Pack is cabin baggage.' }),
  day({ id: 'd-2026-10-19', date: '2026-10-19', kind: 'travel', label: 'Arrival', plan: 'NRT 16:00. Immigration, transfer, food, sleep.', sleepBase: 'Tokyo (Ueno or Nihonbashi area)', tiredDaySummary: 'Ordinary arrival walking only. Favour daylight and a normal bedtime.' }),
  day({
    id: 'd-2026-10-20', date: '2026-10-20', kind: 'walk', walkingDayNumber: 1,
    label: 'Walk 1 — Nihonbashi to Kawasaki',
    plan: 'Nihonbashi → Shinagawa → Kawasaki-juku.',
    from: 'Nihonbashi', to: 'Kawasaki-juku',
    fromWaypointId: 'wp-start-d1', toWaypointId: 'wp-end-d1',
    nominalDistanceKm: 17.7, likelyDoorToDoorKm: 19.5,
    terrain: 'Continuous urban pavement. Negligible elevation.',
    elevationWarning: null,
    startLightGuidance: 'Start at first light if the body offers it. Tokyo is sixteen hours ahead of Seattle, so on the first morning 06:00 here reads as early afternoon at home: alert, and the crash comes at about 15:00 local. Thirteen miles started at 06:30 finishes inside that window. This is the one day the jet lag is an asset, and it is gone by Walk 3.',
    railRedundancy: 'high',
    sleepBase: 'Tokyo (Nihonbashi)',
    sleepBaseNote: 'Not the walk endpoint. The Tokyo arrival hotel is booked through the morning of Oct 22, so tonight means riding back in from Hatchonawate. Tomorrow is a rest day in the same bed; the return to this point is on Oct 22. This is the one day whose bed is behind the walker rather than ahead.',
    stationIds: ['st-nihonbashi', 'st-shinagawa', 'st-kawasaki'],
    bailoutWaypointIds: ['wp-rail-shinagawa', 'wp-rail-kawasaki'],
    weatherSensitive: [],
    safetyNotes: [
      'Urban traffic and crowding, not exposure. The real risk today is doing more than 17.7 km because it feels easy.',
      'REVERSIBLE THIS MORNING. This walk was moved from Oct 21 to Oct 20 so a rest day falls AFTER the first walking day instead of before it. If the flight was late or the night was bad, swap it back: museum today, walk tomorrow. Both dates are open museum days in the same rotation, the hotel is the same either way, and no booking is affected. Decide at breakfast, not in advance.',
    ],
    editorialPrompts: [
      'The first ichirizuka stood one ri out, not at Nihonbashi. Look for whether anything marks a zero point here, and who put it there.',
      'What is the bridge doing today, as a piece of working infrastructure, rather than as a starting line.',
      'Hiroshige\u2019s first print is a DAWN scene \u2014 Nihonbashi, asa no kei, the daimyo procession crossing as the gates open at ake-mutsu, the hour of the rabbit, roughly six. Late-October sunrise in Tokyo is close to the same hour. Being on the bridge at six is the one chance on the whole route to stand in a print at its own time of day. Verify the sunrise time before setting the alarm.',
      'You cross Nihonbashi twice: once walking out on Oct 20, once passing through on Oct 22 on the way to the train, having seen the print in between. Notice what the second crossing knows that the first did not.',
    ],
    hiroshigeRefIds: ['hr-nihonbashi', 'hr-kawasaki'],
    verificationTasks: [
      'Measure the actual pedestrian line on a GPX, not the post-station table.',
      'Confirm the Kawasaki endpoint and its relationship to the hotel.',
    ],
    tiredDaySummary: 'Short day by design. Rail parallels the whole line. Stop early rather than borrowing against tomorrow.',
  }),

  day({
    id: 'd-2026-10-21', date: '2026-10-21', kind: 'orientation', label: 'Tokyo rest and the Hiroshige exhibition',
    plan: 'Hiroshige exhibition at the Tokyo National Museum, Honkan Room A. Feet, pack and shoes reviewed after the first walking day. Takkyubin send to Hamamatsu if the chain is confirmed.',
    sleepBase: 'Tokyo (Nihonbashi)', nominalDistanceKm: 0,
    startLightGuidance: 'No mileage target. Museum opens 09:30; the ticket needs no time slot.',
    editorialPrompts: [
      'The exhibition rotates three times and this window is the Tokaido one. The Kisokaido replaces it on Oct 27, so there is no second chance later in the trip.',
      'You have now walked the first stage. Look at the first print again knowing what the ground under it feels like.',
    ],
    hiroshigeRefIds: ['hr-nihonbashi'],
    verificationTasks: [
      'Open the Asoview ticket in the app at the hotel, not at the gate: it is phone-only, needs a live connection, and the seller warns some handsets cannot display it.',
      'Check feet, socks, shoes and pack fit against what the first walking day produced. Tokyo is the best place on the route to replace any of them, and Fujisawa and Odawara are not.',
    ],
    tiredDaySummary: 'The point of this day is diagnosis, not rest. Whatever the first thirteen miles revealed, today is when it gets fixed.',
  }),

  day({ id: 'd-2026-10-22', date: '2026-10-22', kind: 'walk', walkingDayNumber: 2, label: 'Walk 2 — Kawasaki to Fujisawa', plan: 'Kawasaki → Kanagawa → Hodogaya → Totsuka → Fujisawa-juku.', from: 'Kawasaki-juku', to: 'Fujisawa-juku', nominalDistanceKm: 31.4, likelyDoorToDoorKm: 34.0, terrain: 'Urban pavement throughout.', railRedundancy: 'high', sleepBase: 'Fujisawa', stationIds: ['st-kawasaki','st-kanagawa','st-hodogaya','st-totsuka','st-fujisawa'], bailoutWaypointIds: ['wp-rail-totsuka','wp-rail-fujisawa'], startLightGuidance: 'First full pavement day. Feet and pack govern pace, not the clock.', tiredDaySummary: 'Dense rail. Stopping anywhere is cheap today.' }),
  day({ id: 'd-2026-10-23', date: '2026-10-23', kind: 'walk', walkingDayNumber: 3, label: 'Walk 3 — Fujisawa to Odawara', plan: 'Fujisawa → Hiratsuka → Oiso → Odawara-juku.', from: 'Fujisawa-juku', to: 'Odawara-juku', nominalDistanceKm: 32.4, likelyDoorToDoorKm: 34.5, terrain: 'Coastal pavement, mild grades.', railRedundancy: 'high', sleepBase: 'Odawara', stationIds: ['st-fujisawa','st-odawara'], bailoutWaypointIds: ['wp-rail-odawara'], startLightGuidance: 'Finish below Hakone. Do not borrow against the mountain day.', safetyNotes: ['Arriving at Odawara tired is a legitimate reason to spend a recovery token here rather than start Hakone short of sleep.'], tiredDaySummary: 'Finish at Odawara. Tomorrow is the hard one.' }),

  day({
    id: 'd-2026-10-24', date: '2026-10-24', kind: 'walk', walkingDayNumber: 4,
    label: 'Walk 4 — Odawara over Hakone to Lake Ashi',
    plan: 'Odawara → Hakone-Yumoto → Hatajuku → (Hiryu Falls / Ashinoyu hybrid) → the Lake Ashi shore at Moto-Hakone, 1.20 km short of the Sekisho. Stops at the top: the climb without the descent.',
    from: 'Odawara-juku', to: 'Lake Ashi shore (Moto-Hakone)',
    fromWaypointId: 'wp-rail-odawara', toWaypointId: 'wp-bus-moto-hakone',
    nominalDistanceKm: 15.5, likelyDoorToDoorKm: 17.3,
    terrain: 'Roughly 640 m of ascent on the east slope, much of it stone-paved trail, then a steep western descent.',
    elevationWarning: 'The largest single climb and descent on the route. Wet stone is the specific hazard, not the gradient.',
    startLightGuidance: 'First-light start. This is the day where losing two hours in the morning changes what is safe in the afternoon.',
    railRedundancy: 'low',
    sleepBase: 'Lake Ashi (Moto-Hakone)',
    sleepBaseNote: 'Booked at the lake, which is why this day stops at the checkpoint instead of descending to Mishima. No railway crosses the historic pass: Odawara and Mishima are both Shinkansen stops, but a mid-crossing exit means reaching a trailhead or a bus stop, not a station.',
    stationIds: ['st-odawara', 'st-hakone', 'st-mishima'],
    bailoutWaypointIds: ['wp-rail-odawara', 'wp-bus-hatajuku', 'wp-bus-moto-hakone', 'wp-rail-mishima'],
    hazardWaypointIds: ['wp-hazard-hakone-pass-ic', 'wp-hazard-hiryu-trail'],
    weatherSensitive: [
      'Hiryu Falls nature trail: Kanagawa Prefecture advises against use during or just after rain; sections are prone to crumbling.',
      'Upper west-slope old road reopened 2026-03-30 after typhoon restoration; Kannami Town asks walkers to avoid it in rain and for several days after. Route 1 is the designated wet-weather detour — and Route 1 is where the shoulder problem is.',
    ],
    safetyNotes: [
      'Hakone Pass IC on the west slope: Route 1, Hakone Shindo, the old-road approaches and the Ashinoko Skyline access converge. The pedestrian margin is green paint on a highway shoulder. There is no curb and no barrier. Paint is not protection.',
      'Published accounts describe several hundred metres of Route 1 without sidewalk plus an unprotected crossing near the Hakone Shindo merge.',
      'This is one of the two lowest-rail-redundancy days on the route. Suzuka is the other.',
    ],
    editorialPrompts: [
      'Which road counts. The hybrid line trades exact Edo alignment for an older road and less traffic — that trade is the subject, not a failure of continuity.',
      'The checkpoint: permission, status, and controlled movement.',
    ],
    hiroshigeRefIds: ['hr-hakone', 'hr-mishima'],
    verificationTasks: [
      'Check current trail notices for the Hiryu Falls nature trail and the restored west-slope old road within days of the crossing.',
      'Map the Hakone Pass IC micro-route continuously: green-shoulder exposure, the old-road/golf-road loop, and the Yasuragi-no-Mori wooded connector reported May 2026.',
      'Confirm east-side and west-side bus timetables as the actual mid-crossing exit.',
    ],
    tiredDaySummary: 'Biggest climb, worst shoulder, fewest trains. Start at first light. If the mountain is wet, the recovery token moves here — that is what it is for.',
  }),

  day({ id: 'd-2026-10-25', date: '2026-10-25', kind: 'walk', walkingDayNumber: 5, label: 'Walk 5 — Lake Ashi to Fuji', plan: 'Lake Ashi shore → Hakone Sekisho (first thing, in the morning, when it is open) → Hakone Pass → Mishima → Numazu → Hara → past Yoshiwara-juku to the Fuji hotel. Starts at 725 m and descends the west slope.', from: 'Lake Ashi shore (Moto-Hakone)', to: 'Fuji lodging, 818 m past Yoshiwara-juku', nominalDistanceKm: 42.0, likelyDoorToDoorKm: 42.9, terrain: 'Long descent off the pass, then sustained pavement.', railRedundancy: 'high', sleepBase: 'Fuji', sleepBaseNote: 'The route passes 62 m from the door, so the day ends at the bed rather than walking to it. Longest day of the trip after Walk 7.', stationIds: ['st-mishima','st-yui'], bailoutWaypointIds: ['wp-rail-mishima','wp-rail-yui'], startLightGuidance: 'Opens with the Hakone west descent on cold legs. The descent, not the distance, is what to pace.', tiredDaySummary: 'Shortened to Yoshiwara so the Lake Ashi remainder spreads onto Walks 6 and 7 instead of landing here. The Tokaido Main Line parallels most of it, so stopping early and riding in is cheap.' }),

  day({
    id: 'd-2026-10-26', date: '2026-10-26', kind: 'walk', walkingDayNumber: 6,
    label: 'Walk 6 — Fuji over Satta to Shizuoka',
    plan: 'Fuji → Kambara → Yui → Satta Pass → Okitsu → Ejiri → past Fuchu-juku to the Shizuoka hotel, 1,091 m further on.',
    from: 'Fuji lodging', to: 'Shizuoka, 1,091 m past Fuchu-juku',
    nominalDistanceKm: 41.9, likelyDoorToDoorKm: 42.0,
    terrain: 'Two short climbs (Satta, Utsunoya) inside a long pavement day.',
    elevationWarning: 'Modest elevation. Satta is the only climb; Mariko and Utsunoya moved to Walk 7 when the endpoint came back to Fuchu.',
    startLightGuidance: 'Early start. The research stops, not the distance, are what will eat the daylight.',
    railRedundancy: 'high',
    sleepBase: 'Shizuoka',
    sleepBaseNote: 'The route passes 26 m from the door. Fuchu-juku and JR Shizuoka Station are both passed 1,091 m earlier.',
    stationIds: ['st-yui', 'st-fuchu', 'st-mariko', 'st-okabe'],
    bailoutWaypointIds: ['wp-rail-yui', 'wp-rail-shizuoka', 'wp-rail-fujieda'],
    weatherSensitive: ['Satta Pass viewpoint is weather-dependent and the reason to be there.'],
    editorialPrompts: [
      'Satta Pass is the one view on the route that is still composed the way Hiroshige composed it — sea, road, and Fuji stacked in one frame.',
    ],
    hiroshigeRefIds: ['hr-yui-satta'],
    verificationTasks: [
      'Confirm the Satta Pass path is open; it is the one view worth rescheduling for.',
    ],
    tiredDaySummary: 'One climb, then a long flat run into Shizuoka. Rail is dense — moving the endpoint costs little.',
  }),

  day({ id: 'd-2026-10-27', date: '2026-10-27', kind: 'walk', walkingDayNumber: 7, label: 'Walk 7 — Shizuoka over Utsunoya to Shimada', plan: 'Shizuoka → Fuchu-juku → Mariko → Utsunoya → Okabe → Fujieda → Shimada-juku.', from: 'Shizuoka', to: 'Shimada-juku', nominalDistanceKm: 30.3, likelyDoorToDoorKm: 30.4, terrain: 'Utsunoya early, then tea-country hills after the Oi River crossing.', railRedundancy: 'high', sleepBase: 'Shimada', sleepBaseNote: 'Lodging 41 m off the route and 141 m from the Shimada-juku finish — walked in, no transfer. Desk closes at midnight and there is no after-hours check-in. Walking on to Kanaya-juku instead is a day-of option: the route passes 15 m from that platform and one stop brings you back here, which takes 5.4 km off Walk 8.', stationIds: ['st-fuchu','st-mariko','st-okabe'], bailoutWaypointIds: ['wp-rail-fujieda','wp-rail-shimada','wp-rail-kanaya'], hazardWaypointIds: ['wp-utsunoya-tunnel','wp-crossing-oi'], safetyNotes: ['Utsunoya: repair work is scheduled during FY2026. Confirm the tunnel is open as a walking route shortly before the crossing.'], editorialPrompts: ['The Meiji tunnel is the road surviving by changing category — 1876 toll tunnel, rebuilt in brick 1904, now a walking route. Photograph the portal inscription; it reads right to left.', 'This is the tunnel misfiled as Suzuka for eight years. Notice what the place actually looks like before checking it against the memory.', 'The Oi was unbridged by policy, not by engineering limits. The modern crossing is a different kind of decision about who may move.'], hiroshigeRefIds: ['hr-mariko'], verificationTasks: ['Recheck Utsunoya tunnel status against Shizuoka City and Fujieda City notices in October 2026.'], tiredDaySummary: 'Shortest walking day after Walk 8b. Utsunoya early, then a steady run down to Shimada, where the bed is on the road. The Nissaka finish with its 6.7 km rural bus was dropped on 2026-09-24.' }),
  day({ id: 'd-2026-10-28', date: '2026-10-28', kind: 'walk', walkingDayNumber: 8, label: 'Walk 8 — Shimada to Iwata', plan: 'Shimada → Oi River → Kanaya → Sayo-no-Nakayama → Nissaka → Kakegawa → Fukuroi → Mitsuke → Iwata, 255.15 km. Rail three stops into the booked Hamamatsu bed.', from: 'Shimada-juku', to: 'Iwata (255.15 km)', nominalDistanceKm: 39.4, likelyDoorToDoorKm: 39.6, terrain: 'Tea-country hills after the Oi River, then flat pavement.', railRedundancy: 'high', sleepBase: 'Hamamatsu, three JR stops back from Iwata', sleepBaseNote: 'Iwata Station is 181 m off the route — the closest approach of any station between Kanaya and Hamamatsu. Stopping at the 25-mile mark instead leaves 900 m to the platform, so finish at 255.15 km, not later. Toyodacho (13.1 km left for Walk 8b) and Tenryugawa (5.2 km left) are the longer options if the legs are good.', stationIds: ['st-kakegawa','st-hamamatsu'], bailoutWaypointIds: ['wp-rail-kakegawa','wp-rail-aino','wp-rail-fukuroi','wp-rail-iwata','wp-rail-toyodacho','wp-rail-tenryugawa'], hazardWaypointIds: ['wp-tenryu-bridge-access'], startLightGuidance: 'The day the Shimada split was built for. Every exit from Kanaya west is on the JR Tokaido Main Line, so stopping short costs a train ride and nothing else — the Hamamatsu bed is booked for the following night too, and Walk 8b finishes whatever is left.', verificationTasks: ['Tenryu crossing: confirm which span carries the walkway and that the under-bridge approach is open. Verified in Street View 2026-09-13, not on the ground.'], tiredDaySummary: 'Eighth walking day. Reach Iwata, ride in, sleep. Walk 8b carries the last 15.8 km into Hamamatsu in the morning.' }),
  day({ id: 'd-2026-10-29', date: '2026-10-29', kind: 'walk', label: 'Walk 8b — Iwata to Hamamatsu, part recovery', plan: 'Rail three stops back to Iwata, walk the last 15.8 km into Hamamatsu-juku, then laundry, feet, pack repairs, field-system check, and a private visit if it confirms.', from: 'Iwata (255.15 km)', to: 'Hamamatsu-juku', nominalDistanceKm: 15.8, likelyDoorToDoorKm: 16.6, terrain: 'Flat pavement, the Tenryu crossing in the middle.', railRedundancy: 'high', sleepBase: 'Hamamatsu', sleepBaseNote: 'Same bed as the night before; nothing to move. Walk 9 starts on foot from it.', stationIds: ['st-hamamatsu'], bailoutWaypointIds: ['wp-rail-iwata','wp-rail-toyodacho','wp-rail-tenryugawa','wp-rail-hamamatsu'], hazardWaypointIds: ['wp-tenryu-bridge-access'], startLightGuidance: 'A half day, not a rest day, and it was not chosen — Shimada to Hamamatsu is 55.2 km and cannot be one day, so whatever Walk 8 leaves lands here. Finish the walking early enough that the recovery half actually happens.', verificationTasks: ['Tenryu crossing: confirm which span carries the walkway and that the under-bridge approach is open. Verified in Street View 2026-09-13, not on the ground.'], tiredDaySummary: 'The recovery token is spent walking. If Walk 8 reached Tenryugawa instead of Iwata this is only 5.2 km and most of the day is yours.' }),
  day({ id: 'd-2026-10-30', date: '2026-10-30', kind: 'walk', walkingDayNumber: 9, label: 'Walk 9 — Hamamatsu to Toyohashi', plan: 'Hamamatsu → Maisaka → Arai → Shirasuka → Futagawa → Yoshida/Toyohashi.', from: 'Hamamatsu-juku', to: 'Yoshida-juku (Toyohashi)', nominalDistanceKm: 38.7, likelyDoorToDoorKm: 39.4, terrain: 'Exposed bridges across Hamanako.', elevationWarning: null, railRedundancy: 'high', sleepBase: 'Toyohashi', sleepBaseNote: 'The route passes 39 m from the door, 66 m from the Yoshida-juku finish — nearer than Toyohashi Station, which is 883 m away. Onsen on site. Call the property if arriving after 22:00.', stationIds: ['st-hamamatsu','st-arai','st-yoshida'], bailoutWaypointIds: ['wp-rail-hamamatsu','wp-rail-toyohashi'], hazardWaypointIds: ['wp-hazard-hamanako-bridges'], weatherSensitive: ['High wind on the exposed Hamanako bridges is a real stop condition. Rail parallels the whole crossing.'], safetyNotes: ['Verify pedestrian routing and legality across the Hamanako bridges before committing to the day.'], editorialPrompts: ['Imagire/Arai was a water gap and a checkpoint. The bridge replaced the ferry; ask what else it replaced.'], verificationTasks: ['Confirm pedestrian access on every Hamanako bridge segment.'], tiredDaySummary: 'Wind, not distance, is the governing variable. Trains run alongside; a windy day is a train day.' }),
  day({ id: 'd-2026-10-31', date: '2026-10-31', kind: 'walk', walkingDayNumber: 10, label: 'Walk 10 — Toyohashi to Shin-Anjo', plan: 'Toyohashi → Goyu → Akasaka → Fujikawa → Okazaki → Toeicho crossing (Shin-Anjo).', from: 'Yoshida-juku (Toyohashi)', to: 'Toeicho crossing (Shin-Anjo)', nominalDistanceKm: 27.5, likelyDoorToDoorKm: 29.0, terrain: 'Rolling pavement.', railRedundancy: 'high', sleepBase: 'Shin-Anjo', sleepBaseNote: 'The bed is 579 m south of the road at the Toeicho signal, on a street that runs straight down to Shin-Anjo Station. That is the shortest hotel access on the route; finishing at Okazaki-juku instead meant 3.4 km to Okazaki Station.', stationIds: ['st-yoshida','st-okazaki'], bailoutWaypointIds: ['wp-rail-toyohashi','wp-rail-okazaki'], startLightGuidance: 'No longer the light day it was. Extended past Okazaki to take six miles off Walk 11, which has to get back to Nagoya from Manba Ohashi.', tiredDaySummary: 'Flat, rail-dense, and longer than it used to be. Meitetsu runs beside the old road most of the way, so stopping early and riding the last stretch into Shin-Anjo costs little.' }),
  day({ id: 'd-2026-11-01', date: '2026-11-01', kind: 'walk', walkingDayNumber: 11, label: 'Walk 11 — Shin-Anjo to Iwatsuka', plan: 'Shin-Anjo → Chiryu → Narumi → Miya/Atsuta → Saya Kaido → Iwatsuka Station crossing.', from: 'Toeicho crossing (Shin-Anjo)', to: 'Iwatsuka Station crossing', nominalDistanceKm: 32.6, likelyDoorToDoorKm: 34.5, terrain: 'Continuous urban corridor.', railRedundancy: 'high', sleepBase: 'Nagoya / Atsuta', sleepBaseNote: 'Two stations sit on this day. The line passes 191 m from Kanayama Station at 378.71 km — 16.4 mi in, and the hotel is there — so leave the pack at the hotel on the way past, room ready or not, and walk the last 3.0 mi unladen. It finishes 396 m from Iwatsuka Station: step off the road, Higashiyama line to Nagoya, one hop back to Kanayama. Nov 3 reverses it in about twenty minutes. Manba Ohashi, 1.91 km further west, was the finish until 2026-09-16; it has no station, so ending there meant walking that stretch twice or waiting on a bus.', stationIds: ['st-okazaki','st-miya'], bailoutWaypointIds: ['wp-rail-okazaki','wp-rail-atsuta','wp-rail-iwatsuka','wp-rail-haruta'], editorialPrompts: ['Route 1, the rail line, the expressway and the old road occupy one corridor. Several Tokaidos, one strip of ground.'], tiredDaySummary: 'Nineteen miles, urban and rail-dense, the day before a rest day, and the pack only has to be carried for the first sixteen. Finishes at a subway entrance rather than a bridge.', verificationTasks: ['Confirm the Kanayama hotel will hold a pack before check-in on Nov 1. The shape of this day rests on it.', 'Walk 12 carries the Manba stretch but was shortened to Ise-Asahi on 2026-09-16 and now runs 34.6 km, so the Kiso Three Rivers crossing no longer has a threshold to cross. Measure it anyway: it is the largest unmeasured distance on the route.'] }),
  day({ id: 'd-2026-11-02', date: '2026-11-02', kind: 'rest', label: 'Recovery 2 — Nagoya/Atsuta', plan: 'Recovery and research token before the western block.', nominalDistanceKm: 0, sleepBase: 'Nagoya / Atsuta', sleepBaseNote: 'Movable toward the Suzuka gate if the forecast requires it.', editorialPrompts: ['Miya, the missing ferry interval, and how a route contains a gap.'], tiredDaySummary: 'No mileage required. The least forgiving stages start tomorrow.' }),

  day({
    id: 'd-2026-11-03', date: '2026-11-03', kind: 'walk', walkingDayNumber: 12,
    label: 'Walk 12 — Iwatsuka to Ise-Asahi',
    plan: 'Iwatsuka Station crossing → Manba Ohashi → modern Kiso Three Rivers substitute → Kuwana-juku → Machiya Bridge → Outside Ise-Asahi Station.',
    from: 'Iwatsuka Station crossing', to: 'Outside Ise-Asahi Station',
    nominalDistanceKm: 40.2, likelyDoorToDoorKm: null,
    terrain: 'Unresolved. Depends entirely on which crossing is chosen.',
    elevationWarning: null,
    startLightGuidance: 'Do not start this day without having settled the crossing decision in advance. It opens with a twenty-minute subway ride out from Kanayama and the 1.91 km to Manba Ohashi that Walk 11 deliberately left behind, so the first hour is easy and the unknowns are all later.',
    railRedundancy: 'moderate',
    sleepBase: 'Kuwana',
    sleepBaseNote: 'Shortened from Yokkaichi on 2026-09-16. The day ends 55 m from the Ise-Asahi platform on the Kintetsu Nagoya Line, one stop from the Kuwana bed and one stop back out in the morning. Machiya Bridge was the first candidate but sits 2.6 km from any station; the extra 0.6 mi buys a finish you can step onto a train from. The six miles this sheds go onto Walks 13 and 14, which were the two shortest days in the west.',
    stationIds: ['st-miya', 'st-kuwana', 'st-yokkaichi'],
    bailoutWaypointIds: ['wp-rail-atsuta', 'wp-rail-kuwana', 'wp-rail-yokkaichi'],
    hazardWaypointIds: ['wp-crossing-miya-kuwana'],
    safetyNotes: [
      'The 40.2 km figure is the HISTORICAL equivalent: 27.5 km of it is the Seven-ri sea crossing, which no ordinary ferry now reproduces. The safe modern walking line is a different and unmeasured distance.',
      'A land substitute over the Kiso Three Rivers must be checked for pedestrian legality and shoulder quality bridge by bridge.',
    ],
    editorialPrompts: [
      'The road admits it is not a road at the water. Whatever gets chosen here is an answer to "did I walk the whole thing".',
      'Many contemporary walkers take a train between the preserved ferry sites. That is a legible choice, not a failure — but it should be made deliberately.',
    ],
    hiroshigeRefIds: ['hr-miya', 'hr-kuwana'],
    verificationTasks: [
      'Decide explicitly: walk a safe modern land replacement, use transit to enact the historical discontinuity, or split a long substitute across the flex day.',
      'Measure the chosen line on a GPX. This is the largest unresolved distance on the route.',
    ],
    tiredDaySummary: 'The biggest open question on the route, now carried on a twenty-one mile day instead of a twenty-eight. Distance still unknown until the crossing is chosen; the Nov 7 flex day exists partly for this.',
  }),

  day({ id: 'd-2026-11-04', date: '2026-11-04', kind: 'walk', walkingDayNumber: 13, label: 'Walk 13 — Ise-Asahi to Ono-cho', plan: 'Outside Ise-Asahi Station → Yokkaichi → Ishiyakushi → Shono → Kameyama-juku → Ono-cho.', from: 'Outside Ise-Asahi Station', to: 'Ono-cho, Kameyama', nominalDistanceKm: 33.8, likelyDoorToDoorKm: 36.0, terrain: 'Gradual climb toward the Suzuka approach.', railRedundancy: 'moderate', sleepBase: 'Ono-cho, Kameyama', sleepBaseNote: 'The bed is 274 m off the road — walk off the Tokaido into it and back onto it in the morning. No train either way. That is the reason this day stops 1.3 mi short of Seki-juku: finishing at Seki meant a one-stop hop to Kameyama and the 06:02 back out, and the Suzuka day should not open by catching a rural train. Seki-juku itself has little lodging; Seki Station is 408 m from that anchor and Kameyama Station 628 m from its own, both on the JR Kansai Line at roughly hourly, if a fallback is needed.', stationIds: ['st-yokkaichi','st-kameyama','st-seki','st-sakashita'], bailoutWaypointIds: ['wp-rail-yokkaichi','wp-rail-kameyama','wp-rail-seki'], safetyNotes: ['Last day with reasonable rail before Suzuka. Sort out tomorrow’s weather decision tonight, not in the morning — though note that KONAN-01 stops being cancellable at midnight entering Nov 4, so the real decision point is the night of Nov 3, in Kuwana, on a two-day forecast.', 'Nothing about tomorrow morning depends on a timetable now. Set the alarm by the forecast and the sunrise, not by a train.'], tiredDaySummary: 'Ends 274 m off the road with the pass still ahead. Twenty-four miles, then sleep where you stopped.' }),

  day({
    id: 'd-2026-11-05', date: '2026-11-05', kind: 'walk', walkingDayNumber: 14,
    label: 'Walk 14 — Ono-cho over Suzuka to Kosei',
    plan: 'Ono-cho → Seki → Sakashita → Suzuka Pass → Tsuchiyama → Minakuchi → Mikumo → Outside Kosei Station.',
    from: 'Ono-cho, Kameyama', to: 'Outside Kosei Station',
    nominalDistanceKm: 34.1, likelyDoorToDoorKm: 36.5,
    terrain: 'Forested Mie-side ascent to roughly 378 m, then the gentler Shiga-side descent.',
    elevationWarning: 'Modest in absolute height, but exposed, cool, and windy, and the Mie-side approach feels remote. Walking Tokyo-to-Kyoto makes the steep side the ascent.',
    startLightGuidance: 'First-light start and an explicit weather gate, and for once nothing stands between the bed and the road: the night before ends 274 m off the Tokaido, so the start time is yours. This day carries the 6.6 mi from Ono-cho through Seki up to Sakashita as its opening, and the pass falls about a quarter of the way into 25.5 mi. Climb it early; the approach is the warm-up, not an extra.',
    railRedundancy: 'low',
    sleepBase: 'Konan (Kosei)',
    sleepBaseNote: 'The day ends 306 m from the Kosei platform on the JR Kusatsu Line and the bed is about 500 m further on, so the hardest day on the route finishes on foot with no train at the end of it. Shortened from Ishibe-juku on 2026-09-16 to even the last two days and take distance off the pass. If the forecast is bad, Mikumo Station at 306.5 mi is the short version — 21.7 mi instead of 24.2 — and it is one stop east on the same line.',
    stationIds: ['st-sakashita', 'st-tsuchiyama', 'st-minakuchi', 'st-ishibe'],
    bailoutWaypointIds: ['wp-rail-seki', 'wp-rail-kibukawa'],
    hazardWaypointIds: ['wp-hazard-suzuka-pass'],
    weatherSensitive: ['Cold and wind at the saddle. Put the midlayer and shell on before the descent, not after the sweat cools.'],
    safetyNotes: [
      'Modern Route 1 runs through the Suzuka Tunnel below the pass; the old road climbs over the saddle as part of the Tokai Nature Trail. Those are different lines with different exposure.',
      'If the weather is bad, this is what the second recovery token was being held for.',
    ],
    editorialPrompts: ['Direction matters. On the 2018 walk this was a descent from the Shiga side. It will not be the same pass.'],
    verificationTasks: ['Confirm Tokai Nature Trail condition and any closures.', 'Confirm the daylight margin against an actual sunrise time, not an assumed one.'],
    tiredDaySummary: 'Hard mountain day, low rail, the longest in the west at 25.5 mi, and it starts and finishes on foot with no train at either end. First light, weather gate, warm layers before the descent. Nothing recovers after it, so a bad forecast spends the second token here.',
  }),

  day({ id: 'd-2026-11-06', date: '2026-11-06', kind: 'walk', walkingDayNumber: 15, label: 'Walk 15 — Kosei to Sanjo Ohashi', plan: 'Outside Kosei Station → Ishibe → Kusatsu → Otsu → Sanjo Ohashi, Kyoto.', from: 'Outside Kosei Station', to: 'Sanjo Ohashi, Kyoto', nominalDistanceKm: 38.0, likelyDoorToDoorKm: 40.0, terrain: 'Long approach along Biwa, then the final climb into Kyoto.', railRedundancy: 'high', sleepBase: 'Kyoto', stationIds: ['st-ishibe','st-kusatsu','st-otsu','st-sanjo'], bailoutWaypointIds: ['wp-rail-kusatsu','wp-rail-otsu'], startLightGuidance: 'Evened against Walk 14 on 2026-09-16 so the pass day and the Kyoto day are the same length. Flat, rail-dense, and the whole point of the trip is at the end of it. If the flex day is still unused, finishing at Kusatsu or Otsu and arriving on Nov 7 is the cleanest late edit.', editorialPrompts: ['The road begins and ends on bridges over rivers.'], tiredDaySummary: 'Long but rail-dense. Splitting it across Nov 7 costs nothing if the flex day is unspent.' }),

  day({ id: 'd-2026-11-07', date: '2026-11-07', kind: 'flex', label: 'True flex day', plan: 'Unassigned. Absorbs weather, feet, route error, or an overlong western stage.', nominalDistanceKm: 0, sleepBase: 'Kyoto or wherever needed', tiredDaySummary: 'Genuinely unassigned. Converting it to planned mileage repeats the first trip’s mistake.' }),
  day({ id: 'd-2026-11-08', date: '2026-11-08', kind: 'rest', label: 'Kyoto — protected', plan: 'Protected recovery and research day.', nominalDistanceKm: 0, sleepBase: 'Kyoto', tiredDaySummary: 'Protected. Keep separate from route flex if at all possible.' }),
  day({ id: 'd-2026-11-09', date: '2026-11-09', kind: 'travel', label: 'Transfer', plan: 'Shinkansen Kyoto to Tokyo.', sleepBase: 'Tokyo', editorialPrompts: ['The same corridor in two and a half hours. The Tokaido made again.'], tiredDaySummary: 'Unhurried transfer. Exact train chosen later.' }),
  day({ id: 'd-2026-11-10', date: '2026-11-10', kind: 'buffer', label: 'Tokyo buffer', plan: 'Repack, research, contingency.', nominalDistanceKm: 0, sleepBase: 'Tokyo / Haneda area', tiredDaySummary: 'Protected buffer.' }),
  day({ id: 'd-2026-11-11', date: '2026-11-11', kind: 'travel', label: 'Return via Honolulu', plan: 'HND 21:20 to HNL 09:35; 14h24 layover; HNL 23:59 departure.', sleepBase: 'Aircraft', tiredDaySummary: 'Build immigration, ground-transport, and airport-return margins.' }),
  day({ id: 'd-2026-11-12', date: '2026-11-12', kind: 'travel', label: 'Arrival Seattle', plan: 'SEA 07:41.', sleepBase: 'Home', tiredDaySummary: 'Recovery. No commitments assumed.' }),
];

// ---------------------------------------------------------------------------
// Waypoints. Operational features. Hotels here are OBVIOUSLY FICTIONAL
// placeholders so the schema can be exercised without any real booking
// entering a public repository.
// ---------------------------------------------------------------------------
/**
 * Waypoints whose position can be taken from a labelled point on the imported
 * route. Everything not listed here keeps its hand-written estimate and stays
 * at `verification: unverified`.
 */
const WAYPOINT_ANCHORS = {
  'wp-hazard-suzuka-pass': '鈴鹿峠',
  'wp-utsunoya-tunnel': '宇津ノ谷峠',
  'wp-research-satta': '薩埵峠',
  'wp-bus-hatajuku': '畑宿本陣',
  'wp-water-hatajuku': '畑宿本陣',
  'wp-bus-moto-hakone': '箱根関所',
  'wp-crossing-oi': '大井川橋',
  'wp-research-atsuta': '七里の渡',
  'wp-water-seki': '関宿',
  'wp-start-d1': '日本橋',
};

function wp(o) {
  const anchor = o.id in WAYPOINT_ANCHORS ? anchorByJa(WAYPOINT_ANCHORS[o.id]) : null;
  const pos = anchorPos(anchor);
  const base = {
    schemaVersion: 1,
    classification: 'public',
    lastChecked: null,
    operationalNotes: null,
    historicalNotes: null,
    safetyNotes: null,
    links: [],
    dayIds: [],
    ...DEMO,
    ...o,
  };
  // An explicit positionSource wins. Without this the helper stamped
  // 'operator-estimate' over everything that was not projected off a route
  // anchor, which is how a coordinate read from a published station record
  // became indistinguishable from one typed from memory.
  if (!pos) {
    return { ...base, anchorId: null, positionSource: o.positionSource ?? 'operator-estimate' };
  }
  return {
    ...base,
    ...pos,
    anchorId: anchor.properties.id,
    positionSource: 'source-route-anchor',
    source: 'kaidotrail 2026-08-20 (route anchor)',
    confidence: 'medium',
    verification: 'imported',
  };
}

const waypoints = [
  wp({ id: 'wp-start-d1', type: 'day-start', title: 'Nihonbashi — Walk 1 start', lat: 35.6841, lon: 139.7743, dayIds: ['d-2026-10-20'], operationalNotes: 'Route start. Exact start marker unverified.' }),
  wp({ id: 'wp-end-d1', type: 'day-end', title: 'Kawasaki-juku — Walk 1 finish', lat: 35.5308, lon: 139.7029, dayIds: ['d-2026-10-20'], operationalNotes: 'Planned walk endpoint. Distinct from the hotel until lodging is chosen.' }),

  wp({ id: 'wp-rail-shinagawa', type: 'rail-bailout', title: 'Shinagawa Station', lat: 35.62822222, lon: 139.73869444, source: 'ja.wikipedia station coordinates, read 2026-09-16; Fujieda cross-checked against Mapion to 11 m', confidence: 'medium', verification: 'desk-checked', demonstration: false, positionSource: 'reference-lookup', dayIds: ['d-2026-10-20'], operationalNotes: 'Dense service. Bailing out here is trivial.' }),
  wp({ id: 'wp-rail-kawasaki', type: 'rail-bailout', title: 'Kawasaki Station', lat: 35.53138889, lon: 139.69694444, source: 'ja.wikipedia station coordinates, read 2026-09-16; Fujieda cross-checked against Mapion to 11 m', confidence: 'medium', verification: 'desk-checked', demonstration: false, positionSource: 'reference-lookup', dayIds: ['d-2026-10-20'] }),
  wp({ id: 'wp-rail-totsuka', type: 'rail-bailout', title: 'Totsuka Station', lat: 35.40061111, lon: 139.53419444, source: 'ja.wikipedia station coordinates, read 2026-09-16; Fujieda cross-checked against Mapion to 11 m', confidence: 'medium', verification: 'desk-checked', demonstration: false, positionSource: 'reference-lookup', dayIds: ['d-2026-10-22'] }),
  wp({ id: 'wp-rail-fujisawa', type: 'rail-bailout', title: 'Fujisawa Station', lat: 35.33888889, lon: 139.48722222, source: 'ja.wikipedia station coordinates, read 2026-09-16; Fujieda cross-checked against Mapion to 11 m', confidence: 'medium', verification: 'desk-checked', demonstration: false, positionSource: 'reference-lookup', dayIds: ['d-2026-10-22'] }),
  wp({ id: 'wp-rail-odawara', type: 'rail-bailout', title: 'Odawara Station', lat: 35.25583333, lon: 139.15555556, source: 'ja.wikipedia station coordinates, read 2026-09-16; Fujieda cross-checked against Mapion to 11 m', confidence: 'medium', verification: 'desk-checked', demonstration: false, positionSource: 'reference-lookup', dayIds: ['d-2026-10-23', 'd-2026-10-24'], operationalNotes: 'Shinkansen stop. Last dense-rail point before the Hakone crossing.' }),
  wp({ id: 'wp-bus-hatajuku', type: 'rail-bailout', title: 'Hatajuku bus stop (east slope)', lat: 35.2260, lon: 139.0530, dayIds: ['d-2026-10-24'], operationalNotes: 'Bus, not rail. This is the realistic east-slope exit once the trail is committed to. Timetable unverified.' }),
  wp({ id: 'wp-bus-moto-hakone', type: 'rail-bailout', title: 'Moto-Hakone (Lake Ashi) bus', lat: 35.2020, lon: 139.0250, dayIds: ['d-2026-10-24'], operationalNotes: 'West-side services connect to Mishima. The decisive stop-or-continue point of the Hakone day.' }),
  wp({ id: 'wp-rail-mishima', type: 'rail-bailout', title: 'Mishima Station', lat: 35.12633889, lon: 138.91116389, source: 'ja.wikipedia station coordinates, read 2026-09-16; Fujieda cross-checked against Mapion to 11 m', confidence: 'medium', verification: 'desk-checked', demonstration: false, positionSource: 'reference-lookup', dayIds: ['d-2026-10-24', 'd-2026-10-25'], operationalNotes: 'Shinkansen stop.' }),
  wp({ id: 'wp-rail-yui', type: 'rail-bailout', title: 'Yui Station', lat: 35.09719444, lon: 138.55272222, source: 'ja.wikipedia station coordinates, read 2026-09-16; Fujieda cross-checked against Mapion to 11 m', confidence: 'medium', verification: 'desk-checked', demonstration: false, positionSource: 'reference-lookup', dayIds: ['d-2026-10-25', 'd-2026-10-26'] }),
  wp({ id: 'wp-rail-motoyoshiwara', type: 'rail-bailout', title: 'Motoyoshiwara Station (Gakunan)', lat: 35.16197778, lon: 138.69258333, dayIds: ['d-2026-10-25', 'd-2026-10-26'], source: 'ja.wikipedia station coordinates, read 2026-09-17', confidence: 'medium', verification: 'desk-checked', demonstration: false, positionSource: 'reference-lookup', operationalNotes: 'Closest rail to the Walk 5 finish at Yoshiwara-juku — 817 m from the anchor, 189 m off the road. It is the Gakunan Electric Railway, a short local line, so check the service before relying on it; Yoshiwara Station two stops down is the interchange with the JR Tokaido Main Line.' }),
  wp({ id: 'wp-rail-yoshiwara', type: 'rail-bailout', title: 'Yoshiwara Station (JR Tokaido + Gakunan)', lat: 35.14386111, lon: 138.70277778, dayIds: ['d-2026-10-25', 'd-2026-10-26'], source: 'ja.wikipedia station coordinates, read 2026-09-17', confidence: 'medium', verification: 'desk-checked', demonstration: false, positionSource: 'reference-lookup', operationalNotes: 'The real transport node for the Walk 5 finish: JR Tokaido Main Line and the Gakunan terminus. 2.8 km from Yoshiwara-juku but only 158 m off the route further east, so it is easier to reach before finishing than after.' }),
  wp({ id: 'wp-rail-fuji', type: 'rail-bailout', title: 'Fuji Station (JR Tokaido)', lat: 35.15144444, lon: 138.65108611, dayIds: ['d-2026-10-25', 'd-2026-10-26'], source: 'ja.wikipedia station coordinates, read 2026-09-17', confidence: 'medium', verification: 'desk-checked', demonstration: false, positionSource: 'reference-lookup', operationalNotes: 'The rail-linked alternative named in the Walk 5 sleep base. 3.3 km west of Yoshiwara-juku and 503 m off the route, larger than Yoshiwara Station and with more lodging around it.' }),
  wp({ id: 'wp-rail-shizuoka', type: 'rail-bailout', title: 'Shizuoka Station', lat: 34.97161111, lon: 138.38855556, source: 'ja.wikipedia station coordinates, read 2026-09-16; Fujieda cross-checked against Mapion to 11 m', confidence: 'medium', verification: 'desk-checked', demonstration: false, positionSource: 'reference-lookup', dayIds: ['d-2026-10-26'] }),
  wp({ id: 'wp-rail-fujieda', type: 'rail-bailout', title: 'Fujieda Station', lat: 34.84935833, lon: 138.25238056, source: 'ja.wikipedia station coordinates, read 2026-09-16; Fujieda cross-checked against Mapion to 11 m', confidence: 'medium', verification: 'desk-checked', demonstration: false, positionSource: 'reference-lookup', dayIds: ['d-2026-10-26', 'd-2026-10-27'] }),
  wp({ id: 'wp-rail-shimada', type: 'rail-bailout', title: 'Shimada Station', lat: 34.8300583, lon: 138.1742278, dayIds: ['d-2026-10-27', 'd-2026-10-28'], source: 'ja.wikipedia station coordinates, read 2026-09-24', confidence: 'medium', verification: 'desk-checked', demonstration: false, positionSource: 'reference-lookup', operationalNotes: 'NOT an emergency exit — this is where Walk 7 is planned to finish. 343 m from Shimada-juku, with lodging within 440 m of the platform, so the day ends on foot with no transfer. Walk 8 starts here.' }),
  wp({ id: 'wp-rail-kanaya', type: 'rail-bailout', title: 'Kanaya Station (JR Tokaido + Oigawa)', lat: 34.8190833, lon: 138.1254444, dayIds: ['d-2026-10-27', 'd-2026-10-28'], source: 'ja.wikipedia station coordinates, read 2026-09-24', confidence: 'medium', verification: 'desk-checked', demonstration: false, positionSource: 'reference-lookup', operationalNotes: 'The route passes 15 m from the platform — the closest rail on this stretch. One stop back to the Shimada bed, which makes walking on to Kanaya on Walk 7 a day-of option that takes 5.4 km off Walk 8 without changing any booking. OpenStreetMap places this 93 m away; that node is the Oigawa Railway terminus platform, not the JR one.' }),
  wp({ id: 'wp-rail-kakegawa', type: 'rail-bailout', title: 'Kakegawa Station', lat: 34.76974167, lon: 138.01483889, source: 'ja.wikipedia station coordinates, read 2026-09-16; Fujieda cross-checked against Mapion to 11 m', confidence: 'medium', verification: 'desk-checked', demonstration: false, positionSource: 'reference-lookup', dayIds: ['d-2026-10-27', 'd-2026-10-28'] }),
  wp({ id: 'wp-rail-aino', type: 'rail-bailout', title: 'Aino Station', lat: 34.7524194, lon: 137.9616167, dayIds: ['d-2026-10-28'], source: 'ja.wikipedia station coordinates, read 2026-09-24', confidence: 'medium', verification: 'desk-checked', demonstration: false, positionSource: 'reference-lookup', operationalNotes: '969 m off the route at 242.5 km. Local stop; check service before relying on it.' }),
  wp({ id: 'wp-rail-fukuroi', type: 'rail-bailout', title: 'Fukuroi Station', lat: 34.7414333, lon: 137.9256667, dayIds: ['d-2026-10-28'], source: 'ja.wikipedia station coordinates, read 2026-09-24', confidence: 'medium', verification: 'desk-checked', demonstration: false, positionSource: 'reference-lookup', operationalNotes: '721 m off the route at 246.3 km, near Fukuroi-juku. The mid-day exit on Walk 8.' }),
  wp({ id: 'wp-rail-iwata', type: 'rail-bailout', title: 'Iwata Station', lat: 34.7100750, lon: 137.8517250, dayIds: ['d-2026-10-28', 'd-2026-10-29'], source: 'ja.wikipedia station coordinates, read 2026-09-24', confidence: 'medium', verification: 'desk-checked', demonstration: false, positionSource: 'reference-lookup', operationalNotes: 'NOT an emergency exit — the planned Walk 8 finish. 181 m off the route at 255.1 km, the closest approach of any station between Kanaya and Hamamatsu, and three stops on the JR Tokaido Main Line to the booked Hamamatsu room. Walk 8b resumes here. Stopping at the 25-mile mark instead leaves 900 m to the platform, so finish at 255.1 km, not later.' }),
  wp({ id: 'wp-rail-toyodacho', type: 'rail-bailout', title: 'Toyodacho Station', lat: 34.7120222, lon: 137.8200056, dayIds: ['d-2026-10-28', 'd-2026-10-29'], source: 'ja.wikipedia station coordinates, read 2026-09-24', confidence: 'medium', verification: 'desk-checked', demonstration: false, positionSource: 'reference-lookup', operationalNotes: '1,122 m off the route at 257.8 km. Ending Walk 8 here instead of Iwata leaves 13.1 km for Walk 8b rather than 15.8 km, at the cost of 941 m more walking to the platform.' }),
  wp({ id: 'wp-rail-tenryugawa', type: 'rail-bailout', title: 'Tenryugawa Station', lat: 34.7170222, lon: 137.7792361, dayIds: ['d-2026-10-28', 'd-2026-10-29'], source: 'ja.wikipedia station coordinates, read 2026-09-24', confidence: 'medium', verification: 'desk-checked', demonstration: false, positionSource: 'reference-lookup', operationalNotes: '399 m off the route at 265.8 km, just past the Tenryu bridge. The long-day option: reaching here on Walk 8 leaves only 5.2 km for the next morning, which buys back most of the recovery day the Shimada split spends.' }),
  wp({ id: 'wp-rail-hamamatsu', type: 'rail-bailout', title: 'Hamamatsu Station', lat: 34.703425, lon: 137.73440278, source: 'ja.wikipedia station coordinates, read 2026-09-16; Fujieda cross-checked against Mapion to 11 m', confidence: 'medium', verification: 'desk-checked', demonstration: false, positionSource: 'reference-lookup', dayIds: ['d-2026-10-28', 'd-2026-10-30'] }),
  wp({ id: 'wp-rail-toyohashi', type: 'rail-bailout', title: 'Toyohashi Station', lat: 34.76281083, lon: 137.38165083, source: 'ja.wikipedia station coordinates, read 2026-09-16; Fujieda cross-checked against Mapion to 11 m', confidence: 'medium', verification: 'desk-checked', demonstration: false, positionSource: 'reference-lookup', dayIds: ['d-2026-10-30', 'd-2026-10-31'] }),
  wp({ id: 'wp-rail-okazaki', type: 'rail-bailout', title: 'Okazaki Station', lat: 34.92561083, lon: 137.157315, source: 'ja.wikipedia station coordinates, read 2026-09-16; Fujieda cross-checked against Mapion to 11 m', confidence: 'medium', verification: 'desk-checked', demonstration: false, positionSource: 'reference-lookup', dayIds: ['d-2026-10-31', 'd-2026-11-01'] }),
  wp({ id: 'wp-rail-atsuta', type: 'rail-bailout', title: 'Atsuta / Jingu-mae', lat: 35.12580556, lon: 136.91247222, source: 'ja.wikipedia station coordinates, read 2026-09-16; Fujieda cross-checked against Mapion to 11 m', confidence: 'medium', verification: 'desk-checked', demonstration: false, positionSource: 'reference-lookup', dayIds: ['d-2026-11-01', 'd-2026-11-03'] }),
  wp({ id: 'wp-rail-shinanjo', type: 'rail-bailout', title: 'Shin-Anjo Station (Meitetsu)', lat: 34.9870732, lon: 137.0851868, dayIds: ['d-2026-10-31', 'd-2026-11-01'], source: 'ja.wikipedia station coordinates, read 2026-09-16', confidence: 'medium', verification: 'desk-checked', demonstration: false, positionSource: 'reference-lookup', operationalNotes: 'NOT an emergency exit — this is where Walk 10 is planned to finish. The Toeicho crossing is 579 m north of the platform on a street that runs straight down to it, and the bed is a minute from the station. Walk 11 starts from the same crossing. It is recorded as a bailout so the app can find it mid-day as well.' }),
  wp({ id: 'wp-rail-ise-asahi', type: 'rail-bailout', title: 'Ise-Asahi Station (Kintetsu Nagoya Line)', lat: 35.03832913, lon: 136.66895409, dayIds: ['d-2026-11-03', 'd-2026-11-04'], source: 'Mapion station record, read 2026-09-16', confidence: 'medium', verification: 'desk-checked', demonstration: false, positionSource: 'reference-lookup', operationalNotes: 'NOT an emergency exit — this is where Walk 12 is planned to finish, and the Tokaido passes about 55 m north of the platform, which was measured against a section traced at 31 m spacing. Kuwana is two stations back up the line and is the bed for Nov 3; Walk 13 starts here again on the morning of Nov 4. Recorded as a bailout so the app can find it mid-day as well.' }),
  wp({ id: 'wp-rail-kosei', type: 'rail-bailout', title: 'Kosei Station (JR Kusatsu Line)', lat: 35.00062488, lon: 136.08234279, dayIds: ['d-2026-11-05', 'd-2026-11-06'], source: 'Mapion station record, read 2026-09-16', confidence: 'medium', verification: 'desk-checked', demonstration: false, positionSource: 'reference-lookup', operationalNotes: 'NOT an emergency exit — this is where Walk 14 is planned to finish, 306 m off the road, with the bed about 500 m beyond it. It is also the first rail on the Shiga side that is actually near the route: Kibukawa, the recorded bailout for the Suzuka day, is 8.4 km away. Walk 15 starts here.' }),
  wp({ id: 'wp-rail-iwatsuka', type: 'rail-bailout', source: 'Mapion station record, read 2026-09-16', confidence: 'medium', verification: 'desk-checked', demonstration: false, positionSource: 'reference-lookup', title: 'Iwatsuka Station (Higashiyama subway)', lat: 35.158478, lon: 136.854389, dayIds: ['d-2026-11-01', 'd-2026-11-03'], operationalNotes: 'The answer to the Manba Ohashi return. The route passes 396 m from this station at 383.11 km, 1.91 km BEFORE the Walk 11 finish, so the walk back from Manba is about 2.3 km along ground already walked. Higashiyama line to Nagoya Station, then one hop to Kanayama. Two city bus routes, Kan-Nakamura 1 and Nakamura 12, also run between the Manba Ohashi stop and this station, but the walk is short enough that no timetable governs the evening. Bus routes read off a route-map site on 2026-09-16, not the operator: verify before relying on the bus rather than the legs.' }),
  wp({ id: 'wp-rail-haruta', type: 'rail-bailout', source: 'Mapion station record, read 2026-09-16', confidence: 'medium', verification: 'desk-checked', demonstration: false, positionSource: 'reference-lookup', title: 'Haruta Station (JR Kansai Main Line)', lat: 35.143235, lon: 136.813560, dayIds: ['d-2026-11-01', 'd-2026-11-03'], operationalNotes: 'Second option from Manba, 2.0 km off the route and on the JR Kansai Main Line rather than the subway. City bus Nakamura 12 runs Manba Ohashi to Haruta Station directly. Useful on Nov 3 heading west as well as Nov 1 heading back.' }),
  wp({ id: 'wp-rail-kuwana', type: 'rail-bailout', title: 'Kuwana Station', lat: 35.06738889, lon: 136.68411111, source: 'ja.wikipedia station coordinates, read 2026-09-16; Fujieda cross-checked against Mapion to 11 m', confidence: 'medium', verification: 'desk-checked', demonstration: false, positionSource: 'reference-lookup', dayIds: ['d-2026-11-03'] }),
  wp({ id: 'wp-rail-yokkaichi', type: 'rail-bailout', title: 'Yokkaichi Station', lat: 34.96308333, lon: 136.62963889, source: 'ja.wikipedia station coordinates, read 2026-09-16; Fujieda cross-checked against Mapion to 11 m', confidence: 'medium', verification: 'desk-checked', demonstration: false, positionSource: 'reference-lookup', dayIds: ['d-2026-11-03', 'd-2026-11-04'] }),
  wp({ id: 'wp-rail-kameyama', type: 'rail-bailout', title: 'Kameyama Station', lat: 34.850326, lon: 136.450347, dayIds: ['d-2026-11-04'], source: 'Mapion station record, read 2026-09-16', confidence: 'medium', verification: 'desk-checked', demonstration: false, positionSource: 'reference-lookup', operationalNotes: 'Real position. The fixture carried 34.856, 136.452 until 2026-09-16 — a hand-typed estimate 649 m from the platform, which is where the "Kameyama-juku is 0.2 km from its station" figure came from. It is 628 m.' }),
  wp({ id: 'wp-rail-seki', type: 'rail-bailout', title: 'Seki Station', lat: 34.849180, lon: 136.394532, dayIds: ['d-2026-11-04', 'd-2026-11-05'], source: 'Mapion station record, read 2026-09-16', confidence: 'medium', verification: 'desk-checked', demonstration: false, positionSource: 'reference-lookup', operationalNotes: 'Real position, 351 m off the route and 408 m from the Seki-juku anchor. The fixture carried 34.853, 136.400 until 2026-09-16 — lon typed to one decimal, 655 m from the platform. JR Kansai Line: about 19 trains a day toward Kameyama on weekdays, last 22:43; back out at 06:02, 06:40, 07:06, 08:03. Read from a timetable site on 2026-09-16, before the March revision.' }),
  wp({ id: 'wp-rail-kibukawa', type: 'rail-bailout', title: 'Kibukawa Station (Shiga side)', lat: 34.95210556, lon: 136.15393333, source: 'ja.wikipedia station coordinates, read 2026-09-16; Fujieda cross-checked against Mapion to 11 m', confidence: 'medium', verification: 'desk-checked', demonstration: false, positionSource: 'reference-lookup', dayIds: ['d-2026-11-05'], operationalNotes: 'First rail on the descent side of Suzuka. Position approximate.' }),
  wp({ id: 'wp-rail-kusatsu', type: 'rail-bailout', title: 'Kusatsu Station', lat: 35.0224, lon: 135.96163611, source: 'ja.wikipedia station coordinates, read 2026-09-16; Fujieda cross-checked against Mapion to 11 m', confidence: 'medium', verification: 'desk-checked', demonstration: false, positionSource: 'reference-lookup', dayIds: ['d-2026-11-06'] }),
  wp({ id: 'wp-rail-sanjo', type: 'rail-bailout', title: 'Sanjo Ohashi — Keihan Sanjo Station', lat: 35.00911389, lon: 135.772275, dayIds: ['d-2026-11-06'], source: 'ja.wikipedia station coordinates, read 2026-09-17', confidence: 'medium', verification: 'desk-checked', demonstration: false, positionSource: 'reference-lookup', operationalNotes: 'The end of the road. Keihan Sanjo sits 41 m from the terminus anchor, at the east end of the bridge itself — so for this one the station and the destination are the same place, and nothing about arriving here is a bailout. Recorded because Otsu Station, 8.4 km back, was otherwise the nearest rail the app knew about on the last day.' }),
  wp({ id: 'wp-rail-otsu', type: 'rail-bailout', title: 'Otsu Station', lat: 35.00297222, lon: 135.86489722, source: 'ja.wikipedia station coordinates, read 2026-09-16; Fujieda cross-checked against Mapion to 11 m', confidence: 'medium', verification: 'desk-checked', demonstration: false, positionSource: 'reference-lookup', dayIds: ['d-2026-11-06'] }),

  wp({ id: 'wp-hazard-hakone-pass-ic', type: 'hazard', title: 'Hakone Pass IC — highway shoulder', lat: 35.1830, lon: 139.0090, dayIds: ['d-2026-10-24'], safetyNotes: 'Route 1, Hakone Shindo, old-road approaches and the Ashinoko Skyline access converge. Several hundred metres without sidewalk plus an unprotected crossing near the Shindo merge. The green pedestrian paint is paint: no curb, no barrier, no separation. Kevin and Kai ran this section in 2018.', operationalNotes: 'Alternatives to map continuously before departure: the old-road/golf-road loop, and the wooded connector between the Hakone Yasuragi-no-Mori bus stop and Roadside Station Hakone-toge reported May 2026.', links: [{ label: 'Account of the junction', url: 'https://ossanpo.hatenablog.com/entry/hakone' }, { label: 'Wooded connector report (May 2026)', url: 'https://busmagazine.bestcarweb.jp/feature/column/209862' }] }),
  wp({ id: 'wp-hazard-hiryu-trail', type: 'hazard', title: 'Hiryu Falls — Ashinoyu nature trail', lat: 35.2230, lon: 139.0400, dayIds: ['d-2026-10-24'], safetyNotes: 'Steep 2.3 km maintained nature trail. Kanagawa Prefecture advises against use during or just after rain; parts are prone to crumbling.', operationalNotes: 'Part of the preferred hybrid east-slope line: Old Tokaido to Hatajuku, then this trail toward Ashinoyu and Lake Ashi. Position approximate.' }),
  wp({ id: 'wp-utsunoya-tunnel', type: 'category-change', title: 'Meiji Utsunoya Tunnel', lat: 34.9450, lon: 138.2860, dayIds: ['d-2026-10-26'], historicalNotes: 'Opened 1876 as Japan’s first toll tunnel; rebuilt in brick 1904; present passage about 203 m. The portal inscription reads right-to-left. A Meiji-period transformation of the corridor, not the Edo path.', operationalNotes: 'Currently presented as a walking route, but repair work is scheduled during FY2026. Recheck status shortly before crossing.', safetyNotes: 'Confirm open before relying on it; the alternative adds distance to an already crowded day.', links: [{ label: 'Shizuoka City', url: 'https://www.city.shizuoka.lg.jp/s5984/s005526.html' }, { label: 'Fujieda City trail notices', url: 'https://www.city.fujieda.shizuoka.jp/soshiki/sports_bunka/kankokoryu/oshirase/19928.html' }] }),
  // Verified in Street View by Kevin, 2026-09-13, after the desk's revisit check
  // flagged 423 m of apparent detour here and it was nearly straightened as an
  // artifact. It is not an artifact. Three spans cross the Tenryu — one two-way
  // road and two one-way highway sections — and only one carries a walkway,
  // which cannot be reached from the approach. This is the kind of thing no map
  // states and a line cannot explain about itself.
  wp({ id: 'wp-tenryu-bridge-access', type: 'category-change', title: 'Tenryu crossing — only one span has a walkway', lat: 34.7284, lon: 137.8114, dayIds: ['d-2026-10-28'], safetyNotes: 'Do not attempt the nearest span. Of the three bridge sections here only one carries a pedestrian walkway; the others are one-way highway.', operationalNotes: 'Reach the walkway by continuing under the bridge and looping back around — about 423 m, and it looks like a mistake on the map. The route line already follows it. The out-and-back just before it goes to the historic Tenryu ferry site, which is where the Tokaido ran; skipping that spur is a fair trade on a tired day, the bridge access is not.', historicalNotes: 'The Tokaido crossed the Tenryu by ferry. Hiroshige\'s Mitsuke print is that crossing.' }),
  wp({ id: 'wp-hazard-hamanako-bridges', type: 'hazard', title: 'Hamanako bridge crossings', lat: 34.6930, lon: 137.5850, dayIds: ['d-2026-10-30'], safetyNotes: 'Exposed to wind. Pedestrian legality and shoulder quality unverified bridge by bridge.', operationalNotes: 'Rail parallels the entire crossing, so a wind day is cheap to abandon. Position approximate.' }),
  wp({ id: 'wp-crossing-oi', type: 'river-crossing', title: 'Oi River crossing', lat: 34.8300, lon: 138.1600, dayIds: ['d-2026-10-27'], historicalNotes: 'Deliberately unbridged under Edo policy. Travellers were carried across.' }),
  wp({ id: 'wp-crossing-miya-kuwana', type: 'ferry-gap', title: 'Miya to Kuwana — Seven-ri gap', lat: 35.0950, lon: 136.8000, dayIds: ['d-2026-11-03'], historicalNotes: 'The historical table assigns 27.5 km to a sea crossing between Miya and Kuwana. No ordinary ferry reproduces it now.', operationalNotes: 'Three legible options: a safe modern land line over the Kiso Three Rivers, transit between the preserved ferry sites, or splitting a long substitute across the Nov 7 flex day. Undecided. Position is a placeholder mid-gap, not a route point.', safetyNotes: 'Any land substitute needs pedestrian legality and shoulder quality checked bridge by bridge before it is walked.', links: [{ label: 'Nagoya City — Seven-ri ferry', url: 'https://www.city.nagoya.jp/atsuta/miryoku/1022287/1022299/1022302.html' }] }),
  wp({ id: 'wp-hazard-suzuka-pass', type: 'hazard', title: 'Suzuka Pass', lat: 34.8770, lon: 136.3060, dayIds: ['d-2026-11-05'], safetyNotes: 'Roughly 378 m saddle. Exposed, cool, windy; the Mie-side approach feels remote. Low rail redundancy on both sides.', operationalNotes: 'Route 1 passes below through the Suzuka Tunnel; the old road climbs over as part of the Tokai Nature Trail. Westbound makes the steep Mie side the ascent.' }),

  wp({ id: 'wp-research-satta', type: 'research', title: 'Satta Pass viewpoint', lat: 35.0930, lon: 138.5330, dayIds: ['d-2026-10-26'], historicalNotes: 'One of the most reproduced viewpoints on the road.', operationalNotes: 'Weather-dependent and the reason to be there. Position approximate.' }),
  wp({ id: 'wp-research-atsuta', type: 'research', title: 'Miya-juku ferry site, Atsuta', lat: 35.1280, lon: 136.9080, dayIds: ['d-2026-11-01', 'd-2026-11-02'], historicalNotes: 'Preserved eastern landing of the Seven-ri crossing.' }),

  wp({ id: 'wp-water-hatajuku', type: 'water', title: 'Hatajuku — water and food', lat: 35.2262, lon: 139.0535, dayIds: ['d-2026-10-24'], operationalNotes: 'DEMONSTRATION PLACEMARK. Availability and hours entirely unverified. Do not plan the Hakone day around this.' }),
  wp({ id: 'wp-water-seki', type: 'water', title: 'Seki-juku — last resupply before Suzuka', lat: 34.8500, lon: 136.3930, dayIds: ['d-2026-11-04', 'd-2026-11-05'], operationalNotes: 'DEMONSTRATION PLACEMARK. Availability and hours entirely unverified.' }),

  wp({ id: 'wp-hotel-demo-kawasaki', type: 'hotel', title: 'EXAMPLE HOTEL — Kawasaki (fictional)', lat: 35.5320, lon: 139.6990, dayIds: ['d-2026-10-20'], operationalNotes: 'FICTIONAL PLACEHOLDER. No booking exists. Real lodging is private data and belongs in an imported private file, never in this repository. See PRIVACY-AND-THREAT-MODEL.md.' }),
  wp({ id: 'wp-hotel-demo-mishima', type: 'hotel', title: 'EXAMPLE HOTEL — Mishima (fictional)', lat: 35.1270, lon: 138.9130, dayIds: ['d-2026-10-24'], operationalNotes: 'FICTIONAL PLACEHOLDER. No booking exists.' }),
];

// ---------------------------------------------------------------------------
// Hiroshige image metadata. METADATA ONLY — no image files are bundled and no
// image is republished. Rights status must be verified per institution before
// any image is displayed. See DATA-SCHEMAS.md.
// ---------------------------------------------------------------------------
function hr(o) {
  return {
    schemaVersion: 1,
    series: 'The Fifty-three Stations of the Tokaido (Hoeido edition, c. 1833-34)',
    artist: 'Utagawa Hiroshige',
    institution: null,
    sourceUrl: null,
    rightsStatus: 'unverified',
    imageAvailableOffline: false,
    orientation: null,
    viewpointLat: null,
    viewpointLon: null,
    viewpointConfidence: 'unknown',
    notes: null,
    classification: 'public',
    ...DEMO,
    ...o,
  };
}

const hiroshige = [
  hr({ id: 'hr-nihonbashi', stationId: 'st-nihonbashi', title: 'Nihonbashi — Morning Scene (title unverified)', notes: 'Placeholder record. Print title, edition, institution and rights all still to be established.' }),
  hr({ id: 'hr-kawasaki', stationId: 'st-kawasaki', title: 'Kawasaki — the Rokugo ferry (title unverified)', notes: 'Placeholder record. The ferry is now a bridge; whether a comparable viewpoint survives is unresearched.' }),
  hr({ id: 'hr-hakone', stationId: 'st-hakone', title: 'Hakone — view of the lake (title unverified)', notes: 'Placeholder record. Widely understood to be compressed and dramatised rather than a literal viewpoint. Do not claim an exact standing position.' }),
  hr({ id: 'hr-mishima', stationId: 'st-mishima', title: 'Mishima — morning mist (title unverified)', notes: 'Placeholder record.' }),
  hr({ id: 'hr-yui-satta', stationId: 'st-yui', title: 'Yui — Satta Pass (title unverified)', notes: 'Placeholder record. One of the few where a modern comparison viewpoint is plausibly identifiable, but this is unverified.' }),
  hr({ id: 'hr-mariko', stationId: 'st-mariko', title: 'Mariko — tea house (title unverified)', notes: 'Placeholder record.' }),
  hr({ id: 'hr-miya', stationId: 'st-miya', title: 'Miya — festival scene (title unverified)', notes: 'Placeholder record.' }),
  hr({ id: 'hr-kuwana', stationId: 'st-kuwana', title: 'Kuwana — the harbour (title unverified)', notes: 'Placeholder record.' }),
];

// ---------------------------------------------------------------------------
const trip = {
  schemaVersion: 1,
  id: 'tokaido-2026',
  title: 'Tokaido — Tokyo to Kyoto',
  direction: 'Tokyo to Kyoto',
  timezone: 'Asia/Tokyo',
  departSeattle: '2026-10-18',
  arriveTokyo: '2026-10-19',
  orientationDay: '2026-10-20',
  routeStart: '2026-10-21',
  routeEnd: '2026-11-07',
  kyotoDay: '2026-11-08',
  returnDate: '2026-11-12',
  walkingDayCount: 15,
  recoveryDayCount: 1,
  flexDayCount: 1,
  workingRouteKmMin: 500,
  workingRouteKmMax: 525,
  nominalHistoricalKm: 495.5,
  navigational: false,
  demonstration: true,
  notice:
    'MIXED PROVENANCE, NOTHING VERIFIED. The route comes from a real GPS-traced source (kaidotrail, CC BY-SA 4.0) and has not been checked on the ground by anyone on this trip; its last 6 km into Kyoto are missing. Day distances still come from a balancing draft of historical post-station figures, and hazards, bailouts and lodging are placeholders — the hotels are fictional. Every record carries its own provenance. Do not navigate from this.',
  source: 'STATUS.md and DAILY-SCHEDULE-DRAFT.md, tokaido-reset, 2026-08-16 to 2026-08-17; route from kaidotrail 2026-08-20',
};

const waypointCollection = {
  type: 'FeatureCollection',
  features: waypoints.map((w) => {
    const { lat, lon, ...rest } = w;
    return {
      type: 'Feature',
      id: w.id,
      geometry: { type: 'Point', coordinates: [lon, lat] },
      properties: { ...rest, navigational: false, demonstration: true },
    };
  }),
};

const files = {
  'trip.json': trip,
  'days.json': { schemaVersion: 1, dataVersion: DATA_VERSION, demonstration: true, navigational: false, days },
  'stations.json': { schemaVersion: 1, dataVersion: DATA_VERSION, demonstration: true, navigational: false, complete: false, note: 'Deliberate subset. Building the full fifty-three-station ledger is later work.', stations },
  'hiroshige.json': { schemaVersion: 1, dataVersion: DATA_VERSION, demonstration: true, note: 'Metadata only. No images are bundled or republished. Rights status must be verified per institution before any image is displayed.', images: hiroshige },
  'waypoints.geojson': waypointCollection,
};

const index = {
  schemaVersion: 1,
  dataVersion: DATA_VERSION,
  generated: GENERATED,
  demonstration: true,
  navigational: false,
  notice: trip.notice,
  generatedBy: 'scripts/build-fixtures.mjs',
  routeFilesGeneratedBy: 'scripts/import-kaidotrail.mjs',
  routeFiles: ['route-meta.json', 'route.geojson', 'anchors.geojson'],
  files: Object.entries(files).map(([name, body]) => {
    const text = JSON.stringify(body);
    return { path: name, bytes: Buffer.byteLength(text), records: Array.isArray(body) ? body.length : undefined };
  }),
};

for (const [name, body] of Object.entries({ 'index.json': index, ...files })) {
  const text = JSON.stringify(body, null, 2) + '\n';
  writeFileSync(join(OUT, name), text);
  console.log(`wrote data/${name} (${Buffer.byteLength(text)} bytes)`);
}
