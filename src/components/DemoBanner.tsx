import type { ReactNode } from 'react';
import { useAppState } from '../state/AppState';

/**
 * The not-for-navigation warning.
 *
 * Shown on the shell and repeated, in short form, on every screen that displays
 * a distance, a coordinate, or a route line. Repetition is the point: a warning
 * seen once on first launch is not present at dusk on day four.
 *
 * The wording must track what is actually true. It used to say the route was a
 * schematic sketch; since the real source route was imported on 2026-08-20 that
 * would be crying wolf, and a warning that overstates gets ignored. The detail
 * now comes from `route-meta.json`, so it changes when the data does.
 *
 * What does NOT change is the headline: nothing here is verified for
 * navigation. `tests/unit/fixtures.test.ts` asserts that.
 */
export const NAV_WARNING_HEADLINE = 'Unverified route — not for navigation';

export const NAV_WARNING_FALLBACK =
  'Nothing in this build has been checked on the ground. Distances, hazards, ' +
  'bailouts and lodging are unverified. Navigate with a real map.';

export function DemoBanner({ inline = false }: { inline?: boolean }): ReactNode {
  const { dataset } = useAppState();
  const detail = dataset?.routeMeta.notice ?? NAV_WARNING_FALLBACK;

  return (
    <div
      className={inline ? 'demobanner demobanner--inline' : 'demobanner'}
      role="note"
      data-testid="demo-banner"
    >
      <strong>{NAV_WARNING_HEADLINE}</strong>
      {inline ? null : (
        <p style={{ margin: '6px 0 0' }} data-testid="demo-banner-detail">
          {detail}
        </p>
      )}
    </div>
  );
}
