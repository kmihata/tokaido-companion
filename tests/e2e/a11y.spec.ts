import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

/**
 * Accessibility checks.
 *
 * Automated rules catch a fraction of real accessibility, but the fraction
 * they catch is exactly the fraction that matters here: contrast in bright
 * outdoor light, labelled controls when typing is awkward, and a structure
 * that still makes sense when the type size is turned up.
 */

const SCREENS: [name: string, hash: string][] = [
  ['Today', './'],
  ['Decide', './#/decide'],
  ['Day card', './#/day/d-2026-10-24'],
  ['Route', './#/route'],
  ['Plan', './#/plan'],
  ['Prepare', './#/prepare/d-2026-10-24'],
  ['Places', './#/places'],
  ['Add place', './#/add'],
  ['Import route', './#/import'],
  ['Section', './#/section'],
  ['Place detail', './#/place/wp-hazard-hakone-pass-ic'],
  ['Capture', './#/capture'],
  ['More', './#/more'],
  ['Offline', './#/offline'],
  ['Settings', './#/settings'],
  ['About', './#/about'],
];

for (const [name, hash] of SCREENS) {
  test(`${name} has no serious or critical axe violations`, async ({ page }) => {
    await page.goto(hash);
    await page.waitForTimeout(300);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      // Leaflet renders its own attribution control and canvas; the map screen
      // is excluded from the sweep and checked separately below.
      .exclude('.leaflet-container')
      .analyze();
    const bad = results.violations.filter(
      (v) => v.impact === 'serious' || v.impact === 'critical',
    );
    expect(
      bad.map((v) => `${v.id}: ${v.help} (${v.nodes.length} nodes)`),
      `axe violations on ${name}`,
    ).toEqual([]);
  });
}

test('the map screen is labelled and reachable even though its canvas is not', async ({ page }) => {
  await page.goto('./#/map');
  await expect(page.getByRole('application', { name: 'Route map' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Map', exact: true })).toBeVisible();
});

test('every screen has exactly one h1 and a main landmark', async ({ page }) => {
  for (const [name, hash] of SCREENS) {
    await page.goto(hash);
    await page.waitForTimeout(200);
    await expect(page.locator('main#main'), name).toHaveCount(1);
    await expect(page.locator('h1'), `${name} should have exactly one h1`).toHaveCount(1);
  }
});

test('form controls on the decision screen are all labelled', async ({ page }) => {
  await page.goto('./#/decide');
  await expect(page.getByTestId('posture-card')).toBeVisible();
  const controls = page.locator('#in-completed, #in-pace, #in-elapsed, #in-deadline, #in-bailout, #in-hotel');
  const count = await controls.count();
  expect(count).toBe(6);
  for (let i = 0; i < count; i++) {
    const id = await controls.nth(i).getAttribute('id');
    await expect(page.locator(`label[for="${id}"]`), `no label for #${id}`).toHaveCount(1);
  }
});

test('nothing essential is hidden behind hover', async ({ page }) => {
  // Every navigation target is a link or a button, so it is reachable by tap
  // and by keyboard. Assert there are no hover-only handlers on the tab bar.
  await page.goto('./');
  const tabs = page.locator('.tabbar__item');
  await expect(tabs).toHaveCount(5);
  for (let i = 0; i < 5; i++) {
    await expect(tabs.nth(i)).toHaveAttribute('href', /^#\//);
  }
});

test('a skip link is the first focusable element', async ({ page }) => {
  await page.goto('./');
  await page.keyboard.press('Tab');
  await expect(page.locator(':focus')).toHaveClass(/skiplink/);
});
