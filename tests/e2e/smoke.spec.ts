import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

/**
 * Day distances come from the shipped fixtures, not from literals in this file.
 * Walk 4 was 31.4 km until 2026-09-25, when its finish came back to the Lake
 * Ashi shore and it became 15.5 — which silently invalidated every hand-computed
 * expectation in the decision tests below. The calculator is what is under test;
 * the day's length is data, and data moves.
 */
const DAYS = (
  JSON.parse(readFileSync('public/data/days.json', 'utf8')) as {
    days: { id: string; nominalDistanceKm?: number | null }[];
  }
).days;
const dayKm = (id: string): number => {
  const km = DAYS.find((d) => d.id === id)?.nominalDistanceKm;
  if (typeof km !== 'number') throw new Error(`no nominalDistanceKm for ${id}`);
  return km;
};
const hhmm = (mins: number): string => `${Math.floor(mins / 60)}h ${Math.round(mins % 60)}m`;

/**
 * Critical mobile flows against the production build at the project subpath.
 */

test.describe('shell and navigation', () => {
  test('loads at the subpath and shows the non-navigational warning first', async ({ page }) => {
    await page.goto('./');
    await expect(page.getByTestId('demo-banner').first()).toBeVisible();
    await expect(page.getByTestId('demo-banner').first()).toContainText(/not for navigation/i);
    await expect(page).toHaveTitle(/Samwise/);
    expect(page.url()).toContain('/tokaido-companion/');
  });

  test('shows connectivity and data version in the status strip', async ({ page }) => {
    await page.goto('./');
    await expect(page.getByTestId('online-chip')).toBeVisible();
    await expect(page.getByTestId('data-version-chip')).toContainText('0.1.0-demo');
  });

  test('every tab is reachable and at least 48px tall', async ({ page }) => {
    await page.goto('./');
    for (const name of ['today', 'decide', 'map', 'capture', 'more']) {
      const tab = page.getByTestId(`tab-${name}`);
      await expect(tab).toBeVisible();
      const box = await tab.boundingBox();
      expect(box, `tab-${name} has no box`).not.toBeNull();
      expect(box!.height, `tab-${name} is only ${box!.height}px tall`).toBeGreaterThanOrEqual(48);
    }
    await page.getByTestId('tab-decide').click();
    await expect(page.getByRole('heading', { name: /continue or stop/i })).toBeVisible();
    await page.getByTestId('tab-capture').click();
    await expect(page.getByRole('heading', { name: 'Capture', exact: true })).toBeVisible();
    await page.getByTestId('tab-more').click();
    await expect(page.getByTestId('more-settings')).toBeVisible();
  });

  test('the page never scrolls sideways on a phone', async ({ page }) => {
    await page.goto('./');
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });

  // These match the day NUMBER, not its endpoint. Walk 4 finished at Mishima
  // until a paid Lake Ashi booking moved it, and four tests broke on the
  // rename while testing deep links and offline rendering — neither of which
  // has anything to do with where a day ends.
  test('a deep link survives a reload, which is what hash routing buys', async ({ page }) => {
    await page.goto('./#/day/d-2026-10-24');
    await expect(page.getByRole('heading', { name: /Walk 4 — Odawara over Hakone/i })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('heading', { name: /Walk 4 — Odawara over Hakone/i })).toBeVisible();
  });
});

test.describe('day card', () => {
  test('leads with the tired-day view and expands to the full card', async ({ page }) => {
    await page.goto('./#/day/d-2026-11-05');
    await expect(page.getByText(/Hard mountain day, low rail/i)).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Still to verify' })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Safety' })).toHaveCount(0);
    await page.getByTestId('toggle-full-card').click();
    await expect(page.getByRole('heading', { name: 'Safety' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Still to verify' })).toBeVisible();
    await expect(page.getByText(/Tokai Nature Trail/i).first()).toBeVisible();
  });

  test('shows the Hakone shoulder hazard as a safety note', async ({ page }) => {
    await page.goto('./#/place/wp-hazard-hakone-pass-ic');
    await expect(page.locator('.card--stop').getByText(/green pedestrian paint is paint/i)).toBeVisible();
    await expect(page.getByTestId('demo-banner').first()).toBeVisible();
  });
});

test.describe('decision support', () => {
  // The browser clock is pinned so the arithmetic is deterministic. Without
  // this the screen compares the real date against an October 2026 sunset and
  // every margin is months wide.
  const AT_0900_JST = new Date('2026-10-24T00:00:00Z');
  const AT_1430_JST = new Date('2026-10-24T05:30:00Z');

  test('refuses to guess without inputs, then computes when given them', async ({ page }) => {
    await page.clock.setFixedTime(AT_0900_JST);
    await page.goto('./#/decide');

    await expect(page.getByRole('heading', { name: /Walk 4 — Odawara over Hakone/i })).toHaveCount(0);
    await expect(page.getByTestId('posture-label')).toContainText(/not enough entered/i);

    const total = dayKm('d-2026-10-24');
    const completed = 3;
    const remaining = total - completed;

    await page.getByTestId('input-pace').fill('4');
    await page.getByTestId('input-completed').fill(String(completed));
    await page.getByTestId('input-deadline').fill('16:56');

    await expect(page.getByTestId('remaining')).toContainText(`${remaining.toFixed(1)} km`);
    await expect(page.getByTestId('time-to-finish')).toContainText(hhmm((remaining / 4) * 60));
    await expect(page.getByTestId('tomorrow-becomes')).toContainText(
      `${(dayKm('d-2026-10-25') + remaining).toFixed(1)} km`,
    );
    await expect(page.getByTestId('posture-label')).toContainText(/continuing fits/i);
    await expect(page.getByTestId('posture-reasons')).toBeVisible();
  });

  test('says the margin is thin when the light is close', async ({ page }) => {
    await page.clock.setFixedTime(AT_1430_JST);
    await page.goto('./#/decide');
    // 14:30 to a 16:56 deadline is 146 minutes; the default 45-minute buffer
    // leaves 101. 'Thin' is a finish margin under an hour, so aim for 5 km left
    // at 4 km/h — 75 minutes of walking, 26 minutes of margin.
    await page.getByTestId('input-pace').fill('4');
    await page.getByTestId('input-completed').fill(String(dayKm('d-2026-10-24') - 5));
    await page.getByTestId('input-deadline').fill('16:56');
    await expect(page.getByTestId('posture-card')).toHaveClass(/card--warn/);
    await expect(page.getByTestId('posture-label')).toContainText(/margin is thin/i);
  });

  test('says stop, and says why, when the light runs out', async ({ page }) => {
    await page.clock.setFixedTime(AT_1430_JST);
    await page.goto('./#/decide');
    await page.getByTestId('input-pace').fill('3');
    await page.getByTestId('input-completed').fill('2');
    await page.getByTestId('input-deadline').fill('16:56');
    await expect(page.getByTestId('posture-card')).toHaveClass(/card--stop/);
    await expect(page.getByTestId('posture-reasons')).toContainText(/buffer/i);
  });

  // Superseded 2026-08-20: bailouts used to be straight-line only, with a
  // "NOT walking distance" caveat. They are now measured along the imported
  // route, and only the short hop off the route to the station is a straight
  // line. The caveat that remains is about the route's own accuracy.
  test('splits the bailout distance into along-route and off-route', async ({ page }) => {
    await page.clock.setFixedTime(AT_1430_JST);
    await page.goto('./#/decide');
    await expect(page.getByTestId('bailout-along')).toContainText(/km/);
    await expect(page.getByTestId('bailout-off')).toContainText(/straight line to the station/i);
    await expect(page.getByText(/cuts corners/i)).toBeVisible();
  });

  test('never presents the posture as a recommendation', async ({ page }) => {
    await page.goto('./#/decide');
    await expect(page.getByTestId('posture-card')).toContainText(/not advice/i);
    await expect(page.getByTestId('posture-card')).toContainText(/decide yourself/i);
  });

  test('warns on every screen while a preview date is set', async ({ page }) => {
    await page.goto('./#/settings');
    await page.getByTestId('date-override').fill('2026-11-05');
    await expect(page.getByTestId('date-override-chip')).toContainText('2026-11-05');
    await page.getByTestId('tab-today').click();
    await expect(page.getByTestId('date-override-chip')).toBeVisible();
  });
});

test.describe('capture', () => {
  test('saves a note to the device and offers an export', async ({ page }) => {
    await page.goto('./#/capture');
    await page.getByTestId('capture-text').fill('Portal inscription reads right to left.');
    await page.getByTestId('capture-save').click();
    await expect(page.getByTestId('capture-status')).toContainText(/saved to this device/i);
    await expect(page.getByRole('heading', { name: /Stored captures \(1\)/ })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Export NDJSON' })).toBeVisible();

    await page.reload();
    await expect(page.getByRole('heading', { name: /Stored captures \(1\)/ })).toBeVisible();
  });

  test('attaches location by default, because the mark is the index', async ({ page }) => {
    await page.goto('./#/capture');
    await expect(page.locator('#cap-loc')).toBeChecked();
  });

  test('says plainly when a capture saved without the fix it promised', async ({ page }) => {
    // No geolocation permission is granted in this context, so the watch never
    // produces a position. The note must still save — losing the thought is
    // worse than losing the coordinate — and must say what it did not get.
    await page.goto('./#/capture');
    await expect(page.locator('#cap-loc')).toBeChecked();
    await page.getByTestId('capture-text').fill('No fix here.');
    await page.getByTestId('capture-save').click();
    await expect(page.getByTestId('capture-status')).toContainText(/WITHOUT coordinates/);
    await expect(page.getByRole('heading', { name: /Stored captures/ })).toBeVisible();
  });

  test('records the coordinates when there is a fix', async ({ page, context }) => {
    await context.grantPermissions(['geolocation']);
    await context.setGeolocation({ latitude: 34.9748, longitude: 138.3831 });
    await page.goto('./#/capture');
    await expect(page.getByTestId('cap-loc-label')).toContainText('34.97480');
    await page.getByTestId('capture-text').fill('Fix here.');
    await page.getByTestId('capture-save').click();
    await expect(page.getByTestId('capture-status')).toContainText(/Saved to this device\./);
    await expect(page.getByTestId('capture-status')).not.toContainText(/WITHOUT/);
  });

  test('still lets the coordinate be refused', async ({ page }) => {
    await page.goto('./#/capture');
    await page.locator('#cap-loc').uncheck();
    await expect(page.locator('#cap-loc')).not.toBeChecked();
    await page.getByTestId('capture-text').fill('Deliberately unplaced.');
    await page.getByTestId('capture-save').click();
    await expect(page.getByTestId('capture-status')).toContainText(/Saved to this device\./);
    await expect(page.getByTestId('capture-status')).not.toContainText(/WITHOUT/);
  });
});

test.describe('AI handoff', () => {
  test('builds an editable packet that leads with a provenance warning', async ({ page }) => {
    await page.goto('./#/day/d-2026-10-26');
    await page.getByRole('group').filter({ hasText: /Preview and edit the packet/ }).locator('summary').click();
    const packet = page.getByTestId('packet-text');
    await expect(packet).toBeVisible();
    const value = await packet.inputValue();
    expect(value.startsWith('PROVENANCE WARNING')).toBe(true);
    expect(value).toContain('Utsunoya');
    expect(value.toLowerCase()).not.toContain('claude');
    expect(value.toLowerCase()).not.toContain('chatgpt');
  });
});

test.describe('private data import', () => {
  test('refuses a file that is not a private data file, and says why', async ({ page }) => {
    await page.goto('./#/settings');
    await page.getByTestId('private-file').setInputFiles({
      name: 'wrong.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify({ hello: 'world' })),
    });
    await expect(page.getByTestId('import-errors')).toContainText(/wrong "kind"/i);
    await expect(page.getByTestId('private-status')).toContainText('none');
  });

  test('refuses the public demonstration dataset', async ({ page }) => {
    await page.goto('./#/settings');
    await page.getByTestId('private-file').setInputFiles({
      name: 'days.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify({ schemaVersion: 1, demonstration: true, days: [] })),
    });
    await expect(page.getByTestId('import-errors')).toContainText(/public demonstration dataset/i);
  });

  test('accepts a valid file and keeps it on the device across a reload', async ({ page }) => {
    await page.goto('./#/settings');
    await page.getByTestId('private-file').setInputFiles({
      name: 'private.json',
      mimeType: 'application/json',
      buffer: Buffer.from(
        JSON.stringify({
          schemaVersion: 1,
          kind: 'tokaido-private-data',
          label: 'E2E fixture',
          generated: '2026-08-18T00:00:00.000Z',
          lodging: [{ id: 'l1', dayId: 'd-2026-10-24', name: 'E2E Inn' }],
        }),
      ),
    });
    await expect(page.getByTestId('private-status')).toContainText('E2E fixture');
    await page.reload();
    await expect(page.getByTestId('private-status')).toContainText('E2E fixture');
  });
});

test.describe('route workbench', () => {
  test('shows the canonical route, its breaks, and its source licence', async ({ page }) => {
    await page.goto('./#/route');
    await expect(page.getByRole('heading', { name: 'Route', exact: true })).toBeVisible();
    // ~527 km of active walking across one stretch, with the Kyoto approach missing.
    await expect(page.getByText(/53[0-9]\.\d km/).first()).toBeVisible();
    await expect(page.getByTestId('route-break-count')).toContainText('0');
    await expect(page.getByText(/Sanjo Ohashi/i).first()).toBeVisible();
    await expect(page.getByText('CC BY-SA 4.0').first()).toBeVisible();
    await expect(page.getByText(/kaidotrail/i).first()).toBeVisible();
  });

  test('offers the Saya Kaido as the active alternative that closes the crossing', async ({ page }) => {
    await page.goto('./#/route');
    await expect(page.getByRole('heading', { name: /Saya Kaido/i })).toContainText(/active/i);
    await expect(page.getByText(/Seven-ri sea crossing/i)).toBeVisible();
  });

  test('exposes the three exports', async ({ page }) => {
    await page.goto('./#/route');
    await expect(page.getByTestId('export-master-gpx')).toBeVisible();
    await expect(page.getByTestId('export-reference-layer')).toBeVisible();
    await expect(page.getByText(/one track per continuous stretch/i)).toBeVisible();
  });

  // Until 2026-08-23 this checked that the map refused to draw across the
  // missing Kyoto approach. That gap was traced and closed, so the route is now
  // continuous and there is nothing to refuse — which is the better outcome.
  test('the map draws one continuous route with nothing left broken', async ({ page }) => {
    await page.goto('./#/map');
    await expect(page.getByText(/one continuous stretch/i)).toBeVisible();
    await expect(page.getByTestId('route-breaks')).toHaveCount(0);
    await expect(page.getByText(/53[0-9]\.\d km/).first()).toBeVisible();
  });

  test('Decide measures bailouts along the route, not as the crow flies', async ({ page }) => {
    await page.goto('./#/settings');
    await page.getByTestId('date-override').fill('2026-10-24');
    await page.goto('./#/decide');
    await expect(page.getByTestId('bailout-along')).toBeVisible();
    await expect(page.getByTestId('bailout-off')).toContainText(/straight line to the station/i);
    await expect(page.getByText(/Measured along the imported route/i)).toBeVisible();
    await expect(page.getByTestId('route-projection')).toBeVisible();
  });
});

test.describe('planning the days', () => {
  test('measures every day on the route and flags the ones past the threshold', async ({ page }) => {
    await page.goto('./#/plan');
    await expect(page.getByRole('heading', { name: 'Plan the days' })).toBeVisible();
    await expect(page.getByTestId('plan-days').locator('> li')).toHaveCount(15);
    await expect(page.getByTestId('plan-total')).toContainText(/53[0-9]\.\d km/);
    await expect(page.getByTestId('plan-mean')).toContainText(/3[45]\.\d km/);

    // Day 12 walked the Saya Kaido in one 51 km push until Walk 11 was extended
    // to Manba Ohashi on 2026-09-13; it is now 42.4. What this screen has to do
    // is measure every day and mark the ones past the threshold — so check that
    // the marks and the numbers agree, rather than naming a day that is only
    // the worst until the next rebalance. The threshold itself is read off the
    // heading, so moving OVER_LONG_KM does not break the test.
    const label = await page.getByText(/Days over \d+ km/).textContent();
    const limit = Number(/(\d+)/.exec(label ?? '')?.[1] ?? 0);
    expect(limit).toBeGreaterThan(0);
    const rows = page.getByTestId('plan-days').locator('> li');
    const texts = await rows.allInnerTexts();
    const flagged = texts.filter((t) => t.includes('⚠'));
    const over = texts.filter((t) => Number(/(\d+\.\d)\s*km/.exec(t)?.[1] ?? 0) > limit);
    expect(flagged.length).toBe(over.length);
    await expect(page.getByTestId('plan-overlong')).toContainText(String(over.length));
  });

  test('moving a boundary changes two days and survives a reload', async ({ page }) => {
    await page.goto('./#/plan');
    const before = await page.getByTestId('plan-day-5').textContent();
    await page.getByTestId('plan-day-5').click();

    const select = page.getByTestId('plan-move-5');
    await expect(select).toBeVisible();
    // Every option states what it does to this day and the next before choosing.
    await expect(select.locator('option').first()).toContainText(/D5 \d+\.\d km, D6 \d+\.\d km/);

    const options = select.locator('option');
    await select.selectOption({ index: Math.max(0, (await options.count()) - 4) });
    await expect(page.getByTestId('plan-message')).toContainText(/now finishes at/i);

    const after = await page.getByTestId('plan-day-5').textContent();
    expect(after).not.toBe(before);
    await expect(page.getByTestId('plan-day-5')).toContainText('moved');

    await page.reload();
    await expect(page.getByTestId('plan-day-5')).toContainText('moved');

    // And it can be put back.
    await page.getByTestId('plan-day-5').click();
    await page.getByRole('button', { name: 'Reset to default' }).click();
    await expect(page.getByTestId('plan-day-5')).not.toContainText('moved');
  });

  test('refuses to reorder the days', async ({ page }) => {
    await page.goto('./#/plan');
    await page.getByTestId('plan-day-5').click();
    const options = page.getByTestId('plan-move-5').locator('option');
    // Candidates are bounded by the previous finish and the next day's finish,
    // so an out-of-order endpoint cannot even be selected.
    const texts = await options.allTextContents();
    for (const t of texts) {
      const m = /D5 (\d+\.\d) km/.exec(t);
      if (m) expect(Number(m[1])).toBeGreaterThan(0);
    }
  });
});

test.describe('prepare tomorrow', () => {
  test('is reachable from Today and defaults to the next walking day', async ({ page }) => {
    await page.goto('./#/settings');
    await page.getByTestId('date-override').fill('2026-10-23');
    await page.getByTestId('tab-today').click();
    await page.getByTestId('prepare-tomorrow').click();
    await expect(page.getByRole('heading', { name: /Prepare day 4/ })).toBeVisible();
    // Day 4 was 31.5 km until it was moved to Lake Ashi. What matters here is
    // that Prepare opened on the right day with a real distance on it.
    await expect(page.getByTestId('prepare-active-km')).toContainText(/\d+\.\d km/);
  });

  test('gates "mark prepared" behind the whole checklist', async ({ page }) => {
    await page.goto('./#/prepare/d-2026-10-24');
    const mark = page.getByTestId('mark-prepared');
    await expect(mark).toBeDisabled();
    await expect(mark).toContainText(/tick every item/i);

    for (const id of [
      'gpx-imported',
      'cue-sheet',
      'footpath-offline',
      'watch',
      'apple-maps',
      'samwise-offline',
      'charged',
      'backed-up',
    ]) {
      await page.getByTestId(`chk-${id}`).check();
    }
    await expect(mark).toBeEnabled();
    await mark.click();
    await expect(page.getByTestId('prepared-at')).toBeVisible();

    await page.reload();
    await expect(page.getByTestId('chk-watch')).toBeChecked();
    await expect(page.getByTestId('prepared-at')).toBeVisible();
  });

  test('never claims it verified an external action', async ({ page }) => {
    await page.goto('./#/prepare/d-2026-10-24');
    await expect(page.getByText(/Samwise cannot see whether Footpath imported/i)).toBeVisible();
    await expect(page.getByText(/your own checks, recorded/i)).toBeVisible();
  });

  test('warns when a day is too long to plan around', async ({ page }) => {
    // Pinned 50-51 km until Walk 11 was extended to Manba Ohashi and Walk 12
    // dropped to 42.4; then the threshold itself moved from 40 to 45. Assert
    // the RULE the screen implements — the warning appears exactly when the day
    // is past whatever limit the warning names — so neither a rebalanced
    // schedule nor a recalibrated threshold reads as a broken screen.
    await page.goto('./#/prepare/d-2026-11-03');
    const shown = await page.getByTestId('prepare-active-km').textContent();
    const km = Number(/(\d+\.\d)\s*km/.exec(shown ?? '')?.[1] ?? 0);
    expect(km).toBeGreaterThan(0);
    const warning = page.getByText(/Over \d+ km\./);
    if ((await warning.count()) > 0) {
      const limit = Number(/(\d+)/.exec((await warning.textContent()) ?? '')?.[1] ?? 0);
      expect(km).toBeGreaterThan(limit);
    } else {
      // No warning means no day-length threshold was crossed. Prove the screen
      // would have shown one by checking it against the Plan screen's limit.
      await page.goto('./#/plan');
      const label = await page.getByText(/Days over \d+ km/).textContent();
      const limit = Number(/(\d+)/.exec(label ?? '')?.[1] ?? 0);
      expect(km).toBeLessThanOrEqual(limit);
    }
  });

  test('offers the day package export', async ({ page }) => {
    await page.goto('./#/prepare/d-2026-10-24');
    await expect(page.getByTestId('export-day-gpx')).toContainText(/Day 4 → GPX/);
    await expect(page.getByText(/save them into a list called/i)).toBeVisible();
  });
});

test.describe('planning snapshots', () => {
  test('saves the plan, restores it, and deletes it', async ({ page }) => {
    await page.goto('./#/plan');

    // Move a boundary so there is something to snapshot.
    await page.getByTestId('plan-day-5').click();
    const select = page.getByTestId('plan-move-5');
    const count = await select.locator('option').count();
    await select.selectOption({ index: Math.max(0, count - 4) });
    await expect(page.getByTestId('plan-day-5')).toContainText('moved');
    const moved = await page.getByTestId('plan-day-5').textContent();

    await page.getByLabel('Label').fill('before splitting day 12');
    await page.getByTestId('snapshot-save').click();
    await expect(page.getByTestId('snapshot-list')).toContainText('before splitting day 12');
    await expect(page.getByTestId('snapshot-list')).toContainText('1 moved day');

    // Change it again, then put it back. The day-5 row is still expanded.
    await page.getByRole('button', { name: 'Reset to default' }).click();
    await expect(page.getByTestId('plan-day-5')).not.toContainText('moved');

    page.once('dialog', (d) => void d.accept());
    await page.getByRole('button', { name: 'Restore' }).first().click();
    await expect(page.getByTestId('plan-day-5')).toContainText('moved');
    expect(await page.getByTestId('plan-day-5').textContent()).toBe(moved);

    await page.getByRole('button', { name: 'Delete' }).first().click();
    await expect(page.getByText('No snapshots yet.')).toBeVisible();
  });
});

test.describe('map presentation', () => {
  test('draws the route in a colour nothing else on the map uses', async ({ page }) => {
    await page.goto('./#/map');
    await page.waitForTimeout(1500);
    // Orienteering magenta, #e5007d. The amber it replaced was the same colour
    // as OSM's highway casings, which the route runs beside for hundreds of km.
    const magenta = await page.evaluate(() => {
      const c = document.querySelector('.leaflet-container canvas') as HTMLCanvasElement | null;
      if (!c) return 0;
      const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
      let n = 0;
      for (let i = 0; i < d.length; i += 4) {
        if (Math.abs(d[i]! - 229) < 30 && d[i + 1]! < 60 && Math.abs(d[i + 2]! - 125) < 40 && d[i + 3]! > 150) n++;
      }
      return n;
    });
    expect(magenta).toBeGreaterThan(500);
  });

  test('switches basemaps, including none at all', async ({ page }) => {
    await page.goto('./#/map');
    await expect(page.getByTestId('basemap-osm')).toHaveAttribute('aria-pressed', 'true');

    await page.getByTestId('basemap-topo').click();
    await expect(page.getByTestId('basemap-topo')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByText(/Worth it for Hakone and Suzuka/i)).toBeVisible();

    await page.getByTestId('basemap-none').click();
    await expect(page.getByText(/What you get with no signal/i)).toBeVisible();
    // The route must still be there with no basemap underneath it.
    await expect(page.locator('.leaflet-container canvas')).toBeVisible();
    await expect(page.locator('.leaflet-tile-pane img')).toHaveCount(0);
  });

  test('labels places in English from our own anchors, not the basemap', async ({ page }) => {
    await page.goto('./#/map/wp-bus-hatajuku');
    await page.waitForTimeout(2500);
    const labels = page.locator('.leaflet-tooltip.maplabel');
    await expect(labels.first()).toBeVisible();
    await expect(page.getByText('Hatajuku Honjin', { exact: true })).toBeVisible();

    // And they survive with no basemap, because they are our data.
    await page.getByTestId('basemap-none').click();
    await page.waitForTimeout(800);
    await expect(page.getByText('Hatajuku Honjin', { exact: true })).toBeVisible();

    await page.getByTestId('toggle-labels').click();
    await expect(page.locator('.leaflet-tooltip.maplabel')).toHaveCount(0);
  });

  test('hides labels when zoomed out, so the whole route stays readable', async ({ page }) => {
    await page.goto('./#/map');
    await page.waitForTimeout(2000);
    await expect(page.locator('.leaflet-tooltip.maplabel')).toHaveCount(0);
  });
});

test.describe('adding your own places', () => {
  test('places a point with the crosshair and uses it as a day finish', async ({ page }) => {
    await page.goto('./#/add');
    await expect(page.getByTestId('map-crosshair')).toBeVisible();
    await page.waitForTimeout(2000);

    // The crosshair reports what is under it, and how far that is off the route.
    await expect(page.getByTestId('crosshair-coords')).not.toContainText('—');

    // Put it somewhere precise instead of panning, then name it.
    await page.getByRole('group').filter({ hasText: /paste coordinates/i }).locator('summary').click();
    // A coordinate taken from the route itself. The old hand-written Odawara
    // estimate is 1 km off the real line — which is what the import fixed.
    await page.getByTestId('place-coords').fill('35.2484, 139.1600');
    await page.getByRole('button', { name: 'Move crosshair there' }).click();
    await expect(page.getByTestId('crosshair-offroute')).toContainText(/0\.0 km/);

    await page.getByTestId('place-title').fill('Stop before the pass');
    await page.getByTestId('place-save').click();

    await expect(page.getByRole('heading', { name: 'Stop before the pass' })).toBeVisible();
    await expect(page.getByTestId('usable-as-day-end')).toContainText('yes');

    // And it can end a day.
    await page.getByTestId('use-as-day-end').selectOption({ index: 3 });
    await page.goto('./#/plan');
    await expect(page.getByTestId('plan-days')).toContainText('Stop before the pass');
  });

  test('keeps lodging private by default and out of every export', async ({ page }) => {
    await page.goto('./#/add');
    await page.waitForTimeout(1500);
    await page.getByTestId('place-type').selectOption('hotel');
    await expect(page.getByTestId('place-private')).toBeChecked();

    await page.getByRole('group').filter({ hasText: /paste coordinates/i }).locator('summary').click();
    await page.getByTestId('place-coords').fill('35.2490, 139.1610');
    await page.getByRole('button', { name: 'Move crosshair there' }).click();
    await page.getByTestId('place-title').fill('REAL BOOKING Odawara');
    await page.getByTestId('place-save').click();

    await expect(page.getByTestId('private-notice')).toBeVisible();
    await expect(page.getByText(/never written to the repository/i)).toBeVisible();

    // It appears in Places, as yours.
    await page.goto('./#/places');
    await expect(page.getByTestId('places-list')).toContainText('REAL BOOKING Odawara');
    await expect(page.getByTestId('places-list')).toContainText('private');
  });

  test('refuses a point with no name', async ({ page }) => {
    await page.goto('./#/add');
    await page.waitForTimeout(1500);
    await page.getByTestId('place-save').click();
    await expect(page.getByTestId('place-errors')).toContainText(/give it a name/i);
  });

  test('warns when snapping would move a point a long way', async ({ page }) => {
    await page.goto('./#/add');
    await page.waitForTimeout(1500);
    await page.getByRole('group').filter({ hasText: /paste coordinates/i }).locator('summary').click();
    // Well north of the route, with "on the route" still ticked.
    await page.getByTestId('place-coords').fill('35.4000, 139.1600');
    await page.getByRole('button', { name: 'Move crosshair there' }).click();
    await expect(page.getByText(/Saving it on the line would move it a long way/i)).toBeVisible();
  });

  test('nudges a day boundary to a point no anchor sits on', async ({ page }) => {
    await page.goto('./#/plan');
    await page.getByTestId('plan-day-3').click();
    const before = await page.getByTestId('plan-day-3').textContent();
    await page.getByTestId('plan-nudge-3').getByRole('button', { name: '-1 km' }).click();
    await expect(page.getByTestId('plan-message')).toContainText(/moved back 1 km/i);
    expect(await page.getByTestId('plan-day-3').textContent()).not.toBe(before);
    await expect(page.getByTestId('plan-day-3')).toContainText(/km along the route/);
  });
});

test.describe('importing route geometry', () => {
  // The Kyoto approach was the worked example until it was traced and baked
  // into the shipped route on 2026-08-23. The realistic case now is replacing a
  // section: the Hakone east slope, where FOUNDATION.md prefers the Hiryu Falls
  // hybrid over the switchbacks the source route takes.
  const HAKONE_GPX = 'tests/e2e/fixtures/hakone-hybrid.gpx';

  test('reads a file, suggests the anchors, and shows what it would change', async ({ page }) => {
    await page.goto('./#/import');
    await page.setInputFiles('[data-testid="import-file"]', HAKONE_GPX);

    await expect(page.getByTestId('import-track')).toContainText(/Hatajuku to the checkpoint/);
    await expect(page.getByTestId('import-track')).toContainText(/81 points/);

    // Both endpoints are matched to real anchors without being hunted for.
    await expect(page.getByTestId('imp-diverge')).toHaveValue(/a-\d+/);
    await expect(page.getByTestId('imp-rejoin')).toHaveValue(/a-\d+/);

    const consequence = page.getByTestId('import-consequence');
    await expect(consequence).toBeVisible();
    // A shorter line across the same ground shortens the route and Day 4. The
    // day's own distance is not asserted: Walk 4 now stops at Lake Ashi, so it
    // is 16.7 km rather than the 31.5 it read when this was written.
    await expect(page.getByTestId('consequence-days')).toContainText(/Day 4: \d+\.\d →/);
  });

  test('adopts the change, and switching it off puts the original back', async ({ page }) => {
    await page.goto('./#/import');
    await page.setInputFiles('[data-testid="import-file"]', HAKONE_GPX);
    await page.getByTestId('import-label').fill('Hiryu Falls hybrid');
    await page.getByTestId('import-adopt').click();

    await expect(page.getByTestId('route-edits')).toContainText('Hiryu Falls hybrid');

    await page.goto('./#/plan');
    const changed = await page.getByTestId('plan-day-4').textContent();

    await page.goto('./#/route');
    await page.getByRole('button', { name: 'Switch off' }).click();
    await page.goto('./#/plan');
    // Switching the edit off restores whatever Day 4 measures without it. The
    // figure itself moves with the schedule — it was 31.5 km before Walk 4's
    // default became Lake Ashi — so assert that it changed back, not to what.
    const restored = await page.getByTestId('plan-day-4').textContent();
    expect(restored).toMatch(/\d+\.\d km/);
    expect(restored).not.toBe(changed);
  });

  test('refuses geometry that does not meet the anchors it claims', async ({ page }) => {
    await page.goto('./#/import');
    await page.setInputFiles('[data-testid="import-file"]', HAKONE_GPX);
    const nihonbashi = await page
      .getByTestId('imp-diverge')
      .locator('option', { hasText: 'Nihonbashi' })
      .first()
      .getAttribute('value');
    await page.getByTestId('imp-diverge').selectOption(nihonbashi!);

    // Assert the behaviour, not the sentence. What must hold is that the screen
    // says the geometry does not reach that anchor and refuses to adopt it; the
    // wording changed on 2026-09-20 when the threshold dropped to 50 m and the
    // message started naming the limit and what to do about it.
    await expect(page.getByTestId('import-validation')).toContainText(/Nihonbashi/);
    await expect(page.getByTestId('import-validation')).toContainText(/starts .* from/i);
    await expect(page.getByTestId('import-adopt')).toBeDisabled();
  });

  test('refuses a file that is not route geometry', async ({ page }) => {
    await page.goto('./#/import');
    await page.setInputFiles('[data-testid="import-file"]', {
      name: 'notes.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify({ hello: 'world' })),
    });
    await expect(page.getByTestId('import-errors')).toContainText(/no linestring/i);
  });
});

test.describe('exporting the day plan', () => {
  test('writes a file with the boundaries and the route version they were measured at', async ({
    page,
  }) => {
    await page.goto('./#/settings');
    const wait = page.waitForEvent('download');
    await page.getByTestId('export-dayplan').click();
    const download = await wait;
    expect(download.suggestedFilename()).toMatch(/^samwise-day-plan-\d{4}-\d{2}-\d{2}\.json$/);
    const stream = await download.createReadStream();
    const text = await new Promise<string>((resolve, reject) => {
      let out = '';
      stream.on('data', (c) => (out += String(c)));
      stream.on('end', () => resolve(out));
      stream.on('error', reject);
    });
    const doc = JSON.parse(text);
    expect(doc.kind).toBe('samwise-day-plan');
    expect(doc.routeDataVersion).toMatch(/traced/);
    expect(Array.isArray(doc.days)).toBe(true);
    expect(doc.days.length).toBeGreaterThan(10);
    // The part that restores the plan, even when nothing has been moved yet.
    expect(doc.overrides).toBeDefined();
  });
});

test.describe('exporting a section', () => {
  test('lists the coarsest sections and defaults to the worst', async ({ page }) => {
    await page.goto('./#/section');
    await expect(page.getByRole('heading', { name: 'Export a section' })).toBeVisible();
    await expect(page.getByTestId('coarse-sections').locator('> li')).toHaveCount(12);
    // Which section is worst moves as retraces land — central Tokyo held the
    // top of this list until it was retraced and baked in, at which point
    // naming it here failed for the good reason that the data had improved.
    // Assert that the list is ranked and that the screen defaults to its head,
    // which is the behaviour; the identity of the head is data.
    const rows = page.getByTestId('coarse-sections').locator('> li');
    const spacings = (await rows.allInnerTexts()).map((t) => Number(/(\d+)\s*m/.exec(t)?.[1] ?? 0));
    expect(spacings.every((v) => v > 0)).toBe(true);
    expect([...spacings]).toEqual([...spacings].sort((a, b) => b - a));
    await expect(rows.first()).not.toContainText(/Nihonbashi/);

    // And that the stats card is showing that head, by name. This line used to
    // assert the card read 'Coarse — worth tracing', which is the band above
    // 120 m — data again, one line below the comment warning about it. Baking
    // Nikko Bridge on 2026-09-21 dropped the worst section left on the route to
    // 119 m, so the head became 'Moderate' and the assertion failed for the
    // best possible reason. What must hold is that the card follows the list.
    const headTitle = (await rows.first().locator('h3').innerText()).trim();
    expect(headTitle.length).toBeGreaterThan(0);
    await expect(page.getByTestId('section-stats')).toContainText(headTitle);
  });

  test('measures whichever section is chosen', async ({ page }) => {
    await page.goto('./#/section');
    const from = page.getByTestId('section-from');
    const odawara = await from.locator('option', { hasText: 'Odawara-juku' }).first().getAttribute('value');
    const mishima = await from.locator('option', { hasText: 'Mishima-juku' }).first().getAttribute('value');
    await from.selectOption(odawara!);
    await page.getByTestId('section-to').selectOption(mishima!);
    await expect(page.getByTestId('section-length')).toContainText(/3[0-9]\.\d km/);
    await expect(page.getByTestId('section-spacing')).toContainText(/\d+ m/);
  });

  test('warns when a section is too big to edit safely', async ({ page }) => {
    await page.goto('./#/section');
    const from = page.getByTestId('section-from');
    const first = await from.locator('option').first().getAttribute('value');
    const last = await page.getByTestId('section-to').locator('option').last().getAttribute('value');
    await from.selectOption(first!);
    await page.getByTestId('section-to').selectOption(last!);
    await expect(page.getByText(/That is a big section/i)).toBeVisible();
  });

  test('is reachable from the Route screen', async ({ page }) => {
    await page.goto('./#/route');
    await page.getByTestId('export-section-link').click();
    await expect(page.getByRole('heading', { name: 'Export a section' })).toBeVisible();
  });
});

test.describe('adjusting an anchor', () => {
  test('lists what looks wrong, or says plainly that nothing does', async ({ page }) => {
    await page.goto('./#/adjust');
    await expect(page.getByRole('heading', { name: 'Adjust an anchor' })).toBeVisible();
    // Named Kusanagi until that section was retraced and the spur ceased to
    // exist. Every flagged anchor can be fixed, and then this list is empty and
    // correct — so assert the two states, not a section that happens to be bad.
    const list = page.getByTestId('adjust-list');
    if (await list.isVisible()) {
      await expect(list.locator('> li').first()).toContainText(/\d+ m detour/);
    } else {
      await expect(page.getByTestId('adjust-none')).toBeVisible();
    }
  });

  test('can always reach an anchor even when nothing is flagged', async ({ page }) => {
    await page.goto('./#/adjust');
    // `count()` does not retry, so it reads the select before the route data
    // has loaded and sees nothing. Assert on the locator, which does.
    await expect(page.getByTestId('adjust-pick').locator('option').nth(1)).toBeAttached();
    const value = await page.getByTestId('adjust-pick').locator('option').nth(1).getAttribute('value');
    expect(value).toBeTruthy();
    await page.goto(`./#/adjust/${value}`);
    await expect(page.getByTestId('adjust-detour')).toBeVisible();
  });

  async function openAnyAnchor(page: Page): Promise<void> {
    await page.goto('./#/adjust');
    const value = await page.getByTestId('adjust-pick').locator('option').nth(1).getAttribute('value');
    await page.goto(`./#/adjust/${value}`);
  }

  test('opens an anchor and shows what it costs', async ({ page }) => {
    await openAnyAnchor(page);
    await expect(page.getByTestId('adjust-detour')).toContainText(/\d+ m/);
    await expect(page.getByTestId('adjust-offroute')).toBeVisible();
    await expect(page.getByTestId('adjust-save')).toBeDisabled();
  });

  test('will not save a move without a reason', async ({ page }) => {
    await openAnyAnchor(page);
    await page.getByTestId('adjust-nudge-50').click();
    await expect(page.getByTestId('adjust-moved')).toContainText(/moved 50 m/);
    await page.getByTestId('adjust-save').click();
    await expect(page.getByTestId('adjust-error')).toContainText(/Say why it moved/i);
  });

  test('saves an adjustment and offers to remove it again', async ({ page }) => {
    await page.goto('./#/adjust');
    const id = await page.getByTestId('adjust-pick').locator('option').nth(1).getAttribute('value');
    await page.goto(`./#/adjust/${id}`);
    await page.getByTestId('adjust-nudge-50').click();
    await page.getByTestId('adjust-note').fill('source trace leaned to the forecourt');
    await page.getByTestId('adjust-save').click();
    // An adjusted anchor is always listed, whether or not it looked wrong.
    await expect(page.getByTestId('adjust-list')).toContainText(/adjusted/);

    await page.goto(`./#/adjust/${id}`);
    await expect(page.getByRole('heading', { name: 'Current adjustment' })).toBeVisible();
    await page.getByTestId('adjust-remove').click();
    await expect(page.getByTestId('adjust-pick')).toBeVisible();
  });

  test('is reachable from the Route screen', async ({ page }) => {
    await page.goto('./#/route');
    await page.getByTestId('adjust-anchor-link').click();
    await expect(page.getByRole('heading', { name: 'Adjust an anchor' })).toBeVisible();
  });
});
