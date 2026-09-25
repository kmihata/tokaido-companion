import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The shipped data names PLACES, never PROPERTIES.
 *
 * Which building Kevin sleeps in on a given night is private: it is a public
 * record of where a person can be found, on a schedule, for three weeks. The
 * design has always been that hotel identity lives in a private file imported
 * on the device, and the repository says "Shimada" where the private file says
 * which hotel in Shimada.
 *
 * That design did not hold on its own. On 2026-09-25, writing the day plan, I
 * put four real property names straight into `days.json` — a sleepBase, a
 * sleepBaseNote, and both ends of a stage — along with a named personal
 * contact. They were caught by a pre-push audit, not by anything automatic,
 * which is the reason this file exists.
 *
 * The rule is deliberately about shape rather than a list of names: a test that
 * enumerated the hotels would put them in the repository to prevent putting
 * them in the repository.
 */
const DATA = join(process.cwd(), 'public', 'data');
const read = (f: string): unknown => JSON.parse(readFileSync(join(DATA, f), 'utf8')) as unknown;

/**
 * A lodging word CAPITALISED, which is what distinguishes a property's name
 * from a reference to one. "the Tokyo arrival hotel" is a fact about the plan
 * and says nothing about which building; "Hotel Someplace" is the building.
 * All four leaks caught on 2026-09-25 capitalised it, and the generic
 * references in the existing day notes do not.
 *
 * The example above is invented on purpose. An earlier draft of this comment
 * used a real property name, which would have committed one of the four to the
 * repository inside the test written to keep them out of it.
 */
const PROPERTY_NAME =
  /\b(?:Hotel|HOTEL|Inn|INN|Ryokan|RYOKAN|Hostel|HOSTEL|Guesthouse|Minshuku|Lodge|LODGE|Resort|RESORT)\b/;

describe('the shipped data names places, not properties', () => {
  const days = (read('days.json') as { days: Record<string, unknown>[] }).days;

  const FIELDS = ['from', 'to', 'sleepBase', 'sleepBaseNote', 'label', 'plan'] as const;

  it('keeps property names out of every day field that describes where to sleep or stop', () => {
    for (const d of days) {
      for (const f of FIELDS) {
        const v = d[f];
        if (typeof v !== 'string') continue;
        expect(
          PROPERTY_NAME.test(v),
          `day ${String(d.id)} field "${f}" names a property: ${v.slice(0, 120)}`,
        ).toBe(false);
      }
    }
  });

  it('keeps them out of waypoint titles that are not flagged as demonstration', () => {
    // The two EXAMPLE HOTEL placeholders are deliberate and carry
    // `demonstration: true`; they are the thing a real name would replace.
    const wps = (
      read('waypoints.geojson') as {
        features: { properties: { id: string; title: string; demonstration?: boolean } }[];
      }
    ).features;
    for (const w of wps) {
      if (w.properties.demonstration) continue;
      expect(
        PROPERTY_NAME.test(w.properties.title),
        `waypoint ${w.properties.id} names a property: ${w.properties.title}`,
      ).toBe(false);
    }
  });
});
