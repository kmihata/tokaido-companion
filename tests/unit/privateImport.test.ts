import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  MAX_PRIVATE_BYTES,
  PRIVATE_KIND,
  PRIVATE_SCHEMA_VERSION,
  emptyPrivateData,
  parsePrivateData,
} from '../../src/data/privateSchema';

const valid = {
  schemaVersion: PRIVATE_SCHEMA_VERSION,
  kind: PRIVATE_KIND,
  label: 'Test file',
  generated: '2026-08-18T00:00:00.000Z',
  lodging: [
    {
      id: 'l1',
      dayId: 'd-2026-10-21',
      name: 'Test Inn',
      address: 'Somewhere',
      checkIn: '2026-10-21',
      checkOut: '2026-10-22',
      lat: 35.53,
      lon: 139.7,
      cancellationDeadline: '2026-10-14',
      notes: '',
    },
  ],
  transport: [],
  contacts: [],
  health: [],
  notes: [],
};

const json = (o: unknown): string => JSON.stringify(o);

describe('parsePrivateData — accepts', () => {
  it('a well-formed file', () => {
    const r = parsePrivateData(json(valid));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.lodging).toHaveLength(1);
      expect(r.data.label).toBe('Test file');
    }
  });

  it('a file with the optional collections omitted, filling in empty arrays', () => {
    const r = parsePrivateData(
      json({ schemaVersion: 1, kind: PRIVATE_KIND, label: 'Minimal', generated: 'now' }),
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.lodging).toEqual([]);
      expect(r.data.notes).toEqual([]);
    }
  });

  it('and warns when a valid file is empty', () => {
    const r = parsePrivateData(
      json({ schemaVersion: 1, kind: PRIVATE_KIND, label: 'Empty', generated: 'now' }),
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.warnings.join(' ')).toMatch(/no records/i);
  });

  it('and warns about duplicate ids without refusing', () => {
    const dup = { ...valid, lodging: [valid.lodging[0]!, { ...valid.lodging[0]!, name: 'Other' }] };
    const r = parsePrivateData(json(dup));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.warnings.join(' ')).toMatch(/duplicate/i);
  });
});

describe('parsePrivateData — refuses', () => {
  const refuses = (label: string, text: string, matcher: RegExp): void => {
    it(label, () => {
      const r = parsePrivateData(text);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.errors.join(' ')).toMatch(matcher);
    });
  };

  refuses('text that is not JSON', 'this is a voice memo, not a file', /not valid json/i);
  refuses('a JSON array', json([valid]), /object at the top level/i);
  refuses('a JSON string', json('hello'), /object at the top level/i);
  refuses('null', 'null', /object at the top level/i);
  refuses('a file with no kind', json({ schemaVersion: 1, label: 'x', generated: 'y' }), /kind/i);
  refuses(
    'a file with the wrong kind',
    json({ ...valid, kind: 'some-other-app-export' }),
    /wrong "kind"/i,
  );
  refuses(
    'a future schema version',
    json({ ...valid, schemaVersion: 2 }),
    /unsupported schemaversion/i,
  );
  refuses(
    'a past schema version',
    json({ ...valid, schemaVersion: 0 }),
    /unsupported schemaversion/i,
  );
  refuses(
    'the public demonstration dataset picked by mistake',
    json({ schemaVersion: 1, dataVersion: '0.1.0-demo', demonstration: true, days: [] }),
    /public demonstration dataset/i,
  );
  refuses(
    'a GeoJSON file picked by mistake',
    json({ type: 'FeatureCollection', features: [] }),
    /public demonstration dataset/i,
  );
  refuses(
    'an unrecognised top-level key, because that is more likely the wrong file than a newer one',
    json({ ...valid, secretPayload: 'anything' }),
    /unrecognized|unexpected|not allowed/i,
  );
  refuses(
    'an unrecognised key inside a record',
    json({ ...valid, lodging: [{ ...valid.lodging[0]!, confirmationNumber: 'ABC123' }] }),
    /unrecognized|unexpected|not allowed/i,
  );
  refuses('a lodging record with no name', json({ ...valid, lodging: [{ id: 'l1' }] }), /name/i);
  refuses(
    'a malformed check-in date',
    json({ ...valid, lodging: [{ ...valid.lodging[0]!, checkIn: '21 Oct' }] }),
    /YYYY-MM-DD/,
  );
  refuses(
    'an out-of-range latitude',
    json({ ...valid, lodging: [{ ...valid.lodging[0]!, lat: 935 }] }),
    /lat/i,
  );
  refuses('an empty label', json({ ...valid, label: '' }), /label/i);

  it('a file larger than the size limit', () => {
    const big = json({ ...valid, label: 'x'.repeat(MAX_PRIVATE_BYTES + 100) });
    const r = parsePrivateData(big);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join(' ')).toMatch(/limit/i);
  });
});

describe('the shipped example file', () => {
  const text = readFileSync(join(process.cwd(), 'examples', 'private-data.example.json'), 'utf8');

  it('is refused as-is, because the _readme key forces a look before importing', () => {
    const r = parsePrivateData(text);
    expect(r.ok).toBe(false);
  });

  it('validates once the _readme key is removed', () => {
    const obj = JSON.parse(text) as Record<string, unknown>;
    delete obj['_readme'];
    const r = parsePrivateData(JSON.stringify(obj));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.label).toMatch(/EXAMPLE/i);
  });
});

describe('emptyPrivateData', () => {
  it('round-trips through the validator', () => {
    const r = parsePrivateData(JSON.stringify(emptyPrivateData()));
    expect(r.ok).toBe(true);
  });
});
