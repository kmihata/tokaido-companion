/**
 * Schema and import guard for PRIVATE field data.
 *
 * Private data never enters this repository and never leaves the device
 * except through an export Kevin performs deliberately. It arrives as a local
 * file he chooses from the file picker, is validated here, and is written to
 * IndexedDB. Nothing uploads it anywhere. See PRIVACY-AND-THREAT-MODEL.md.
 *
 * The schema is STRICT: an unrecognised key is a refusal, not a warning. The
 * reasoning is that a file with unexpected structure is more likely to be the
 * wrong file than a newer one, and silently storing the wrong file on a phone
 * is the failure mode worth preventing.
 */
import { z } from 'zod';

/** What this build writes. */
export const PRIVATE_SCHEMA_VERSION = 2;
/**
 * What this build reads. Version 1 files still import: every field added in 2
 * has a default, so a v1 lodging record parses unchanged and simply carries
 * empty values for the new ones. Refusing Kevin's existing file in the week
 * before departure would be a worse outcome than a few blank fields.
 */
export const SUPPORTED_PRIVATE_SCHEMA_VERSIONS = [1, 2] as const;
export const PRIVATE_KIND = 'tokaido-private-data';

/** Refuse anything larger than this. A private trip file has no business being big. */
export const MAX_PRIVATE_BYTES = 2 * 1024 * 1024;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD');

/**
 * A deadline needs its time AND its offset.
 *
 * WHY the regex insists on an offset: a free-cancellation window closes at a
 * wall-clock moment in Japan, and the device reading it is in Japan while the
 * person who typed it was in Seattle. "2026-10-16" is sixteen hours of
 * ambiguity around a decision that costs money, and two of the real deadlines
 * close before departure. `Z` is accepted; a bare local time is not.
 */
const isoInstant = z
  .string()
  .regex(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(Z|[+-]\d{2}:\d{2})$/,
    'expected an ISO timestamp WITH a zone offset, e.g. 2026-10-16T23:59:00+09:00',
  );

export const PrivateLodgingSchema = z.strictObject({
  id: z.string().min(1),
  dayId: z.string().min(1).nullable().default(null),
  name: z.string().min(1),
  address: z.string().default(''),
  /** Kept as text, never dialled. The app shows it to be read and copied. */
  phone: z.string().default(''),
  checkIn: isoDate.nullable().default(null),
  checkOut: isoDate.nullable().default(null),
  lat: z.number().min(-90).max(90).nullable().default(null),
  lon: z.number().min(-180).max(180).nullable().default(null),
  /** Date-only, from v1. Kept so old files import; the app marks it imprecise. */
  cancellationDeadline: isoDate.nullable().default(null),
  /** The real one: exact instant with offset. Preferred wherever both exist. */
  cancellationDeadlineIso: isoInstant.nullable().default(null),
  /** What it costs after the free window closes, in Kevin's own words. */
  laterExposure: z.string().default(''),
  /** Where the booking is managed — the place to go to change it. */
  bookingSource: z.string().default(''),
  /** Paid, due at property, part-paid: whatever the confirmation says. */
  paymentState: z.string().default(''),
  /** Getting there and back to the route: last train, walk from the station. */
  railNotes: z.string().default(''),
  notes: z.string().default(''),
});

export const PrivateTransportSchema = z.strictObject({
  id: z.string().min(1),
  dayId: z.string().min(1).nullable().default(null),
  description: z.string().min(1),
  departsIso: z.string().default(''),
  notes: z.string().default(''),
});

export const PrivateContactSchema = z.strictObject({
  id: z.string().min(1),
  label: z.string().min(1),
  detail: z.string().default(''),
  notes: z.string().default(''),
});

export const PrivateHealthNoteSchema = z.strictObject({
  id: z.string().min(1),
  label: z.string().min(1),
  detail: z.string().default(''),
});

export const PrivateNoteSchema = z.strictObject({
  id: z.string().min(1),
  dayId: z.string().min(1).nullable().default(null),
  title: z.string().default(''),
  body: z.string().default(''),
});

export const PrivateDataSchema = z.strictObject({
  schemaVersion: z.literal(PRIVATE_SCHEMA_VERSION),
  kind: z.literal(PRIVATE_KIND),
  label: z.string().min(1).max(160),
  generated: z.string().min(1),
  lodging: z.array(PrivateLodgingSchema).default([]),
  transport: z.array(PrivateTransportSchema).default([]),
  contacts: z.array(PrivateContactSchema).default([]),
  health: z.array(PrivateHealthNoteSchema).default([]),
  notes: z.array(PrivateNoteSchema).default([]),
});

export type PrivateData = z.infer<typeof PrivateDataSchema>;
export type PrivateLodging = z.infer<typeof PrivateLodgingSchema>;

export type ImportResult =
  | { ok: true; data: PrivateData; warnings: string[] }
  | { ok: false; errors: string[] };

/**
 * Validate raw text as a private data file.
 *
 * Rejects, in order: oversized input, unparseable JSON, non-objects, the
 * public demonstration dataset (a very easy file to pick by mistake), a
 * missing or wrong `kind`, a schemaVersion this build does not implement, and
 * finally anything the strict schema does not recognise.
 */
export function parsePrivateData(text: string): ImportResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const bytes = new TextEncoder().encode(text).length;
  if (bytes > MAX_PRIVATE_BYTES) {
    return {
      ok: false,
      errors: [
        `File is ${(bytes / 1024 / 1024).toFixed(1)} MB. The limit is ${MAX_PRIVATE_BYTES / 1024 / 1024} MB. This is almost certainly not a private trip file.`,
      ],
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, errors: ['Not valid JSON.'] };
  }

  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, errors: ['Expected a JSON object at the top level.'] };
  }

  const obj = parsed as Record<string, unknown>;

  if (obj['demonstration'] === true || obj['type'] === 'FeatureCollection') {
    return {
      ok: false,
      errors: [
        'This looks like the public demonstration dataset, not a private file. Importing it here would do nothing useful.',
      ],
    };
  }

  if (obj['kind'] !== PRIVATE_KIND) {
    return {
      ok: false,
      errors: [`Missing or wrong "kind". Expected "${PRIVATE_KIND}", found ${JSON.stringify(obj['kind'] ?? null)}.`],
    };
  }

  const version = obj['schemaVersion'];
  if (!SUPPORTED_PRIVATE_SCHEMA_VERSIONS.includes(version as 1 | 2)) {
    return {
      ok: false,
      errors: [
        `Unsupported schemaVersion ${JSON.stringify(version ?? null)}. This build reads ${SUPPORTED_PRIVATE_SCHEMA_VERSIONS.join(' and ')}. Export from the older build first, or upgrade the file by hand.`,
      ],
    };
  }

  // A v1 file is a v2 file with the newer lodging fields left empty, so it is
  // parsed by the current schema and relabelled rather than kept at 1. The
  // alternative — two shapes alive at once — is how the day-end anchor list
  // came to disagree with itself.
  const result = PrivateDataSchema.safeParse({ ...obj, schemaVersion: PRIVATE_SCHEMA_VERSION });
  if (!result.success) {
    for (const issue of result.error.issues) {
      const path = issue.path.length ? issue.path.join('.') : '(root)';
      errors.push(`${path}: ${issue.message}`);
    }
    return { ok: false, errors };
  }

  const data = result.data;
  const ids = [
    ...data.lodging.map((x) => x.id),
    ...data.transport.map((x) => x.id),
    ...data.contacts.map((x) => x.id),
    ...data.health.map((x) => x.id),
    ...data.notes.map((x) => x.id),
  ];
  const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
  if (dupes.length > 0) {
    warnings.push(`Duplicate ids: ${[...new Set(dupes)].join(', ')}. Later records win.`);
  }
  if (ids.length === 0) {
    warnings.push('The file is structurally valid but contains no records.');
  }
  if (version === 1) {
    warnings.push(
      'Read as a version 1 file and upgraded to version 2. Lodging phone numbers, exact cancellation deadlines, payment state and rail notes are empty until you add them.',
    );
  }
  // Say it per stay, not once, because the whole point is knowing WHICH
  // booking you cannot time precisely.
  const vague = data.lodging.filter((l) => l.cancellationDeadline && !l.cancellationDeadlineIso);
  if (vague.length > 0) {
    warnings.push(
      `${vague.length === 1 ? 'One stay has' : `${vague.length} stays have`} a date-only cancellation deadline and no exact time: ${vague
        .map((l) => l.name)
        .join(', ')}. A date cannot say whether you have until breakfast or until midnight.`,
    );
  }

  return { ok: true, data, warnings };
}

/** Empty document used when nothing has been imported yet. */
export function emptyPrivateData(): PrivateData {
  return {
    schemaVersion: PRIVATE_SCHEMA_VERSION,
    kind: PRIVATE_KIND,
    label: 'No private data imported',
    generated: new Date().toISOString(),
    lodging: [],
    transport: [],
    contacts: [],
    health: [],
    notes: [],
  };
}
