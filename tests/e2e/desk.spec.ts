import { test, expect } from '@playwright/test';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Page } from '@playwright/test';

/**
 * Export the section the desk itself says is worst, then densify what came out
 * and feed it back.
 *
 * A fixture pinned to a named section is wrong here: this suite broke twice
 * because the section it named got retraced and left the worklist. The subject
 * is "the worst section", which is a moving target by design. Round-tripping
 * the app's own export also tests more than a static file would — if the
 * exporter and the importer ever disagree, this is where it shows.
 */
async function exportAndDensify(page: Page): Promise<string> {
  const wait = page.waitForEvent('download');
  await page.getByTestId('desk-export').click();
  const download = await wait;
  const raw = join(mkdtempSync(join(tmpdir(), 'desk-')), 'exported.gpx');
  await download.saveAs(raw);

  const xml = readFileSync(raw, 'utf8');
  const seg = /<trkseg>([\s\S]*?)<\/trkseg>/.exec(xml);
  if (!seg) throw new Error('the exported section had no track segment');
  const pts = [...seg[1]!.matchAll(/lat="(-?[\d.]+)"[^>]*lon="(-?[\d.]+)"/g)].map(
    (m) => [Number(m[2]), Number(m[1])] as [number, number],
  );
  const dense: [number, number][] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]!;
    const b = pts[i + 1]!;
    for (let k = 0; k < 4; k++) {
      dense.push([a[0] + ((b[0] - a[0]) * k) / 4, a[1] + ((b[1] - a[1]) * k) / 4]);
    }
  }
  dense.push(pts.at(-1)!);

  const body = dense
    .map(([lon, lat]) => `<trkpt lat="${lat.toFixed(6)}" lon="${lon.toFixed(6)}"></trkpt>`)
    .join('\n');
  const out = join(mkdtempSync(join(tmpdir(), 'desk-')), 'traced.gpx');
  writeFileSync(
    out,
    `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="test"><trk><name>densified</name><trkseg>\n${body}\n</trkseg></trk></gpx>\n`,
  );
  return out;
}

/**
 * The desk is a separate entry point, not a screen of the field app, so it
 * gets its own spec. These run on desktop only: the desk is never meant to be
 * opened on a phone, and testing it at 390px would assert a promise the
 * project is deliberately not making.
 */
test.describe('the desk', () => {
  test.skip(
    () => test.info().project.name !== 'desktop',
    'the desk is desktop-only by design',
  );

  test('opens and reads progress off the shipped route', async ({ page }) => {
    await page.goto('./desk.html');
    await expect(page.getByRole('heading', { name: 'Samwise Desk' })).toBeVisible();
    // Counts are derived from point spacing, not from stored bookkeeping, so
    // they survive a cleared cache.
    await expect(page.locator('.desk__head')).toContainText(/\d+ baked/);
    await expect(page.locator('.desk__head')).toContainText(/\d+ still to do/);
  });

  test('shows finished sections instead of dropping them off the list', async ({ page }) => {
    await page.goto('./desk.html');
    // The list was capped at forty rows and done work sorts to the bottom, so
    // the header could report dozens baked while the list showed none of them.
    const done = page.getByTestId('worklist-done');
    await expect(done).toBeVisible();
    await expect(done).toContainText(/Done — \d+ of \d+ sections/);
    await done.locator('summary').click();
    await expect(done.locator('li')).not.toHaveCount(0);
  });

  test('keeps finished work out of the main list', async ({ page }) => {
    await page.goto('./desk.html');
    const rows = page.getByTestId('worklist').locator('> li');
    await expect(rows.first()).toBeVisible();
    const text = (await rows.allInnerTexts()).join(' ');
    expect(text).not.toMatch(/BAKED|baked/);
  });

  test('ranks the worklist worst-first', async ({ page }) => {
    await page.goto('./desk.html');
    const rows = page.getByTestId('worklist').locator('> li');
    await expect(rows.first()).toBeVisible();
    const spacings = (await rows.allInnerTexts()).map((t) => Number(/(\d+) m spacing/.exec(t)?.[1] ?? 0));
    const untouched = spacings.filter((v) => v > 60);
    expect(untouched).toEqual([...untouched].sort((a, b) => b - a));
  });

  test('shows the whole loop for one section, in order', async ({ page }) => {
    await page.goto('./desk.html');
    await page.getByTestId('worklist').locator('> li button').first().click();
    const steps = page.getByTestId('steps');
    await expect(steps).toContainText('Export');
    await expect(steps).toContainText('Trace');
    await expect(steps).toContainText('Import');
    await expect(steps).toContainText('Adopt');
    await expect(steps).toContainText('Bake');
    await expect(page.getByTestId('next-step')).toContainText(/Export it/);
  });

  test('accepting a section takes it off the list and keeps the reason', async ({ page }) => {
    await page.goto('./desk.html');
    const rows = page.getByTestId('worklist').locator('> li');
    const title = (await rows.first().locator('.wl__title').innerText()).trim();
    await rows.first().locator('button').first().click();

    // The reason is required: a status that overrides the measured spacing has
    // to say why, or it is indistinguishable from having given up on it.
    await expect(page.getByTestId('accept-submit')).toBeDisabled();
    await page.getByTestId('accept-reason').fill('straight road, line sits on it to 0.4 m');
    await expect(page.getByTestId('accept-submit')).toBeEnabled();
    await page.getByTestId('accept-submit').click();

    await expect(page.getByTestId('next-step')).toContainText(/0\.4 m/);
    // Gone from the worklist, and still gone after a reload — the decision
    // outlives the page, which is the whole point of storing it.
    await expect(rows.filter({ hasText: title })).toHaveCount(0);
    await page.reload();
    await expect(page.getByTestId('worklist').locator('> li').filter({ hasText: title })).toHaveCount(0);
    const done = page.getByTestId('worklist-done');
    await done.locator('summary').click();
    await expect(done).toContainText(title);
  });

  test('an imported trace shows what it does to the days before adopting', async ({ page }) => {
    await page.goto('./desk.html');
    await page.getByTestId('worklist').locator('> li button').first().click();
    await page.getByTestId('desk-import').setInputFiles(await exportAndDensify(page));

    // The numbers that decide whether to adopt, shown before adopting.
    await expect(page.getByTestId('desk-preview')).toContainText(/Point spacing/);
    await expect(page.getByTestId('desk-preview')).toContainText(/Whole route/);
    // And the day consequence, which is what hotels get booked against.
    const dayLine = page.getByTestId('day-end-same').or(page.getByTestId('day-end-changed'));
    await expect(dayLine).toBeVisible();
    await expect(page.getByTestId('desk-adopt')).toBeVisible();
  });

  /** Rewrite an exported section's points into a new file. */
  function writeGpx(points: readonly (readonly [number, number])[]): string {
    const body = points
      .map(([lat, lon]) => `<trkpt lat="${lat.toFixed(6)}" lon="${lon.toFixed(6)}"></trkpt>`)
      .join('\n');
    const out = join(mkdtempSync(join(tmpdir(), 'desk-')), 'made.gpx');
    writeFileSync(
      out,
      `<?xml version="1.0"?>\n<gpx version="1.1" creator="t"><trk><name>made</name><trkseg>\n${body}\n</trkseg></trk></gpx>\n`,
    );
    return out;
  }

  function pointsOf(file: string): [number, number][] {
    return [...readFileSync(file, 'utf8').matchAll(/lat="(-?[\d.]+)"[^>]*lon="(-?[\d.]+)"/g)].map(
      (m) => [Number(m[1]), Number(m[2])] as [number, number],
    );
  }

  test('names the fault when a trace walks itself home', async ({ page }) => {
    await page.goto('./desk.html');
    await page.getByTestId('worklist').locator('> li button').first().click();
    const pts = pointsOf(await exportAndDensify(page));

    // The Mitsuke failure: out and back, finishing where it began. It cannot
    // join the route either, but the useful thing to say is what the file does
    // — the join error is the symptom.
    await page
      .getByTestId('desk-import')
      .setInputFiles(writeGpx([...pts, ...pts.slice(0, -1).reverse()]));
    await expect(page.getByTestId('trace-problems')).toContainText(/returns to a point/);
    await expect(page.getByTestId('trace-problems')).toContainText(/finishes close to where it starts/);
  });

  test('warns but still allows adopting when the ends are sound', async ({ page }) => {
    await page.goto('./desk.html');
    await page.getByTestId('worklist').locator('> li button').first().click();
    const pts = pointsOf(await exportAndDensify(page));

    // A detour in the middle, endpoints untouched: this joins the route
    // correctly and is still wrong, which is the case where the operator has to
    // be trusted with the decision rather than blocked.
    const mid = Math.floor(pts.length / 2);
    const excursion = pts.slice(mid, mid + 40);
    const withLoop = [
      ...pts.slice(0, mid),
      ...excursion,
      ...excursion.slice(0, -1).reverse(),
      ...pts.slice(mid),
    ];
    await page.getByTestId('desk-import').setInputFiles(writeGpx(withLoop));
    await expect(page.getByTestId('trace-problems')).toContainText(/returns to a point/);
    await expect(page.getByTestId('desk-adopt')).toContainText('Adopt anyway');
  });

  test('shows how far the line wanders against the ground it covers', async ({ page }) => {
    await page.goto('./desk.html');
    await page.getByTestId('worklist').locator('> li button').first().click();
    await page.getByTestId('desk-import').setInputFiles(await exportAndDensify(page));
    await expect(page.getByTestId('trace-sinuosity')).toContainText(/× the straight line/);
    await expect(page.getByTestId('trace-problems')).toHaveCount(0);
  });

  test('refuses a file holding more than one track', async ({ page }) => {
    await page.goto('./desk.html');
    await page.getByTestId('worklist').locator('> li button').first().click();
    await page.getByTestId('desk-import').setInputFiles({
      name: 'two-tracks.gpx',
      mimeType: 'application/gpx+xml',
      buffer: Buffer.from(
        '<?xml version="1.0"?><gpx version="1.1" creator="t">' +
          '<trk><trkseg><trkpt lat="35.0" lon="139.0"></trkpt><trkpt lat="35.1" lon="139.1"></trkpt></trkseg></trk>' +
          '<trk><trkseg><trkpt lat="35.2" lon="139.2"></trkpt><trkpt lat="35.3" lon="139.3"></trkpt></trkseg></trk></gpx>',
      ),
    });
    await expect(page.getByTestId('desk-problem')).toContainText(/2 separate tracks/);
  });

  test('nudges you to bake, because the device is not a safe home', async ({ page }) => {
    await page.goto('./desk.html');
    await page.getByTestId('worklist').locator('> li button').first().click();
    await page.getByTestId('desk-import').setInputFiles(await exportAndDensify(page));
    await page.getByTestId('desk-adopt').click();
    await expect(page.getByTestId('bake-reminder')).toContainText(/cleared cache/);
  });

  test('the field app does not carry a link to the desk', async ({ page }) => {
    await page.goto('./#/route');
    await expect(page.locator('a[href*="desk"]')).toHaveCount(0);
  });
});
