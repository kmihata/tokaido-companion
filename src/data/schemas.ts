/**
 * Runtime schemas for the PUBLIC dataset.
 *
 * These validate what ships in public/data/. Every record carries provenance
 * (source, confidence, verification) because the whole point of this app is
 * that Kevin can see how much any given number is worth before acting on it.
 *
 * Schemas are permissive about extra keys on public data (forward
 * compatibility with a richer future dataset) and STRICT about private data —
 * see privateSchema.ts, where an unexpected key is a reason to refuse.
 */
import { z } from 'zod';

export const Confidence = z.enum(['demonstration', 'low', 'medium', 'high', 'verified']);
export const Verification = z.enum([
  'unverified',
  'imported',
  'manually-traced',
  'desk-checked',
  'street-view-checked',
  'field-checked',
  'rejected',
]);

/** Where a coordinate actually came from. */
/**
 * Where a coordinate actually came from.
 *
 * `reference-lookup` was added 2026-09-16. Until then anything not projected off
 * the route anchors was `operator-estimate`, which conflated two very different
 * things: a position read off a published station record, and a position someone
 * typed from memory. Twenty-one of the twenty-three rail bailouts were the
 * second kind — Seki Station carried a longitude of 136.4, to one decimal, and
 * sat 655 m from the platform. Those metres were feeding hotel decisions.
 */
export const PositionSource = z.enum([
  'source-route-anchor',
  'reference-lookup',
  'operator-estimate',
  'field-mark',
]);
export const Classification = z.enum(['public', 'private']);

export const LinkSchema = z.object({
  label: z.string(),
  url: z.string(),
});

const provenance = {
  source: z.string(),
  confidence: Confidence,
  verification: Verification,
  lastChecked: z.string().nullable().default(null),
  classification: Classification.default('public'),
};

// ---------------------------------------------------------------------------

export const TripSchema = z.object({
  schemaVersion: z.number(),
  id: z.string(),
  title: z.string(),
  direction: z.string(),
  timezone: z.string(),
  departSeattle: z.string(),
  arriveTokyo: z.string(),
  orientationDay: z.string(),
  routeStart: z.string(),
  routeEnd: z.string(),
  kyotoDay: z.string(),
  returnDate: z.string(),
  walkingDayCount: z.number(),
  recoveryDayCount: z.number(),
  flexDayCount: z.number(),
  workingRouteKmMin: z.number(),
  workingRouteKmMax: z.number(),
  nominalHistoricalKm: z.number(),
  navigational: z.boolean(),
  demonstration: z.boolean(),
  notice: z.string(),
  source: z.string(),
});

export const DayKind = z.enum(['walk', 'rest', 'flex', 'travel', 'orientation', 'buffer']);
export const RailRedundancy = z.enum(['high', 'moderate', 'low']);

export const DaySchema = z.object({
  schemaVersion: z.number(),
  id: z.string(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  kind: DayKind,
  label: z.string(),
  plan: z.string(),
  walkingDayNumber: z.number().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  fromWaypointId: z.string().optional(),
  toWaypointId: z.string().optional(),
  nominalDistanceKm: z.number().nullable().optional(),
  likelyDoorToDoorKm: z.number().nullable().optional(),
  terrain: z.string().nullable().optional(),
  elevationWarning: z.string().nullable().optional(),
  startLightGuidance: z.string().nullable().optional(),
  railRedundancy: RailRedundancy.optional(),
  sleepBase: z.string().optional(),
  sleepBaseNote: z.string().optional(),
  stationIds: z.array(z.string()).default([]),
  bailoutWaypointIds: z.array(z.string()).default([]),
  hazardWaypointIds: z.array(z.string()).default([]),
  weatherSensitive: z.array(z.string()).default([]),
  safetyNotes: z.array(z.string()).default([]),
  editorialPrompts: z.array(z.string()).default([]),
  hiroshigeRefIds: z.array(z.string()).default([]),
  verificationTasks: z.array(z.string()).default([]),
  tiredDaySummary: z.string(),
  provisional: z.boolean(),
  source: z.string(),
});

export const DaysFileSchema = z.object({
  schemaVersion: z.number(),
  dataVersion: z.string(),
  demonstration: z.boolean(),
  navigational: z.boolean(),
  days: z.array(DaySchema),
});

export const StationSchema = z.object({
  id: z.string(),
  number: z.number().nullable(),
  name: z.string(),
  modern: z.string(),
  lat: z.number(),
  lon: z.number(),
  kind: z.literal('tokaido-station'),
  notes: z.string(),
  visibility: z.string(),
  anchorId: z.string().nullable().default(null),
  positionSource: PositionSource.default('operator-estimate'),
  ...provenance,
});

export const StationsFileSchema = z.object({
  schemaVersion: z.number(),
  dataVersion: z.string(),
  demonstration: z.boolean(),
  navigational: z.boolean(),
  complete: z.boolean(),
  note: z.string(),
  stations: z.array(StationSchema),
});

export const WaypointType = z.enum([
  'day-start',
  'day-end',
  'rail-bailout',
  'hazard',
  'water',
  'food',
  'resupply',
  'research',
  'hiroshige-viewpoint',
  'hotel',
  'medical',
  'pharmacy',
  'landmark',
  'river-crossing',
  'ferry-gap',
  'pass',
  'tunnel',
  'bridge',
  'category-change',
]);

export const WaypointPropsSchema = z.object({
  schemaVersion: z.number(),
  id: z.string(),
  type: WaypointType,
  title: z.string(),
  dayIds: z.array(z.string()).default([]),
  operationalNotes: z.string().nullable().default(null),
  historicalNotes: z.string().nullable().default(null),
  safetyNotes: z.string().nullable().default(null),
  links: z.array(LinkSchema).default([]),
  navigational: z.boolean(),
  demonstration: z.boolean(),
  anchorId: z.string().nullable().default(null),
  positionSource: PositionSource.default('operator-estimate'),
  ...provenance,
});

export const PointFeatureSchema = z.object({
  type: z.literal('Feature'),
  id: z.string().optional(),
  geometry: z.object({
    type: z.literal('Point'),
    coordinates: z.tuple([z.number(), z.number()]),
  }),
  properties: WaypointPropsSchema,
});

export const WaypointsFileSchema = z.object({
  type: z.literal('FeatureCollection'),
  features: z.array(PointFeatureSchema),
});

/**
 * The canonical route is an ORDERED COLLECTION OF PATHS, not one LineString.
 *
 * A path is a continuous stretch of one kind. Gaps — the Seven-ri ferry
 * crossing, an unmapped approach, a stretch excluded for safety — are paths
 * with no geometry, so a discontinuity can be stated rather than drawn. A
 * variant is an alternative alignment between two anchors, and activating one
 * can resolve a gap: the Saya Kaido closes the Miya–Kuwana crossing on land.
 *
 * Day boundaries, annotations and hazards are POSITIONS ALONG a path, never
 * separate pieces of geometry. Moving a day boundary changes two numbers; it
 * does not re-cut the route. See ARCHITECTURE.md.
 */
export const PathKind = z.enum(['walking', 'transit', 'ferry-gap', 'unresolved', 'excluded', 'connector']);

export const AnchorKind = z.enum([
  'post-station',
  'landmark',
  'bridge',
  'pass',
  'checkpoint',
  'rail',
  'junction',
  'ferry-site',
]);

export const PathSummarySchema = z.object({
  id: z.string(),
  order: z.number(),
  title: z.string(),
  kind: PathKind,
  lengthKm: z.number().nullable(),
  startAnchorId: z.string().nullable(),
  endAnchorId: z.string().nullable(),
  note: z.string().optional(),
  resolvedByVariantId: z.string().optional(),
});

export const VariantSummarySchema = z.object({
  id: z.string(),
  title: z.string(),
  rationale: z.string(),
  divergeAnchorId: z.string(),
  /** Null when the variant runs on to the end rather than rejoining. */
  rejoinAnchorId: z.string().nullable(),
  replacesPathId: z.string().optional(),
  lengthKm: z.number(),
  active: z.boolean(),
  source: z.string(),
  confidence: Confidence,
  verification: Verification,
  lastChecked: z.string().nullable(),
});

export const RouteMetaSchema = z.object({
  schemaVersion: z.number(),
  dataVersion: z.string(),
  generated: z.string(),
  routeId: z.string(),
  title: z.string(),
  direction: z.string(),
  navigational: z.literal(false),
  demonstration: z.boolean(),
  verification: Verification,
  notice: z.string(),
  source: z.object({
    name: z.string(),
    url: z.string(),
    repository: z.string().optional(),
    licence: z.string(),
    attribution: z.string(),
    retrieved: z.string(),
    represents: z.string(),
    hasElevation: z.boolean(),
    provenanceFile: z.string(),
  }),
  totals: z.object({
    activeWalkingKm: z.number(),
    eastKm: z.number(),
    sayaKm: z.number(),
    westKm: z.number(),
    missingKyotoApproachKmEstimate: z.number(),
    note: z.string(),
  }),
  knownWork: z.array(z.string()),
  paths: z.array(PathSummarySchema),
  variants: z.array(VariantSummarySchema),
  anchorCount: z.number(),
});

export const RouteFeatureSchema = z.object({
  type: z.literal('Feature'),
  id: z.string().optional(),
  geometry: z.object({
    type: z.literal('LineString'),
    coordinates: z.array(z.tuple([z.number(), z.number()])).min(2),
  }),
  properties: z.object({
    schemaVersion: z.number(),
    id: z.string(),
    featureRole: z.enum(['path', 'variant']),
    order: z.number(),
    title: z.string(),
    kind: PathKind,
    lengthKm: z.number(),
    startAnchorId: z.string().nullable(),
    endAnchorId: z.string().nullable(),
    active: z.boolean().optional(),
    replacesPathId: z.string().optional(),
    rationale: z.string().optional(),
    navigational: z.literal(false),
    demonstration: z.boolean(),
    ...provenance,
  }),
});

export const RouteFileSchema = z.object({
  type: z.literal('FeatureCollection'),
  features: z.array(RouteFeatureSchema).min(1),
});

export const AnchorPropsSchema = z.object({
  id: z.string(),
  titleJa: z.string(),
  title: z.string(),
  romanised: z.boolean(),
  kind: AnchorKind,
  stationNumber: z.number().nullable(),
  nakasendoNumber: z.number().nullable(),
  pathId: z.string(),
  indexOnPath: z.number(),
  /** Distance from the start of its path, km. The linear-referencing handle. */
  alongKm: z.number(),
  navigational: z.literal(false),
  demonstration: z.boolean(),
  ...provenance,
});

export const AnchorFeatureSchema = z.object({
  type: z.literal('Feature'),
  id: z.string().optional(),
  geometry: z.object({
    type: z.literal('Point'),
    coordinates: z.tuple([z.number(), z.number()]),
  }),
  properties: AnchorPropsSchema,
});

export const AnchorsFileSchema = z.object({
  type: z.literal('FeatureCollection'),
  features: z.array(AnchorFeatureSchema).min(1),
});

export const HiroshigeSchema = z.object({
  schemaVersion: z.number(),
  id: z.string(),
  stationId: z.string(),
  title: z.string(),
  series: z.string(),
  artist: z.string(),
  institution: z.string().nullable(),
  sourceUrl: z.string().nullable(),
  /**
   * `unverified` is the only value this build ever emits. No image may be
   * displayed or cached until this says otherwise for that specific work and
   * that specific reproduction.
   */
  rightsStatus: z.enum(['unverified', 'public-domain', 'licensed', 'restricted']),
  imageAvailableOffline: z.boolean(),
  orientation: z.string().nullable(),
  viewpointLat: z.number().nullable(),
  viewpointLon: z.number().nullable(),
  viewpointConfidence: z.enum(['unknown', 'speculative', 'probable', 'documented']),
  notes: z.string().nullable(),
  ...provenance,
});

export const HiroshigeFileSchema = z.object({
  schemaVersion: z.number(),
  dataVersion: z.string(),
  demonstration: z.boolean(),
  note: z.string(),
  images: z.array(HiroshigeSchema),
});

export const DataIndexSchema = z.object({
  schemaVersion: z.number(),
  dataVersion: z.string(),
  generated: z.string(),
  demonstration: z.boolean(),
  navigational: z.boolean(),
  notice: z.string(),
  generatedBy: z.string(),
  files: z.array(
    z.object({ path: z.string(), bytes: z.number(), records: z.number().optional() }),
  ),
});

export type Trip = z.infer<typeof TripSchema>;
export type Day = z.infer<typeof DaySchema>;
export type Station = z.infer<typeof StationSchema>;
export type WaypointProps = z.infer<typeof WaypointPropsSchema>;
export type PointFeature = z.infer<typeof PointFeatureSchema>;
export type RouteFeature = z.infer<typeof RouteFeatureSchema>;
export type RouteMeta = z.infer<typeof RouteMetaSchema>;
export type PathSummary = z.infer<typeof PathSummarySchema>;
export type VariantSummary = z.infer<typeof VariantSummarySchema>;
export type AnchorProps = z.infer<typeof AnchorPropsSchema>;
export type AnchorFeature = z.infer<typeof AnchorFeatureSchema>;
export type HiroshigeRef = z.infer<typeof HiroshigeSchema>;
export type DataIndex = z.infer<typeof DataIndexSchema>;
