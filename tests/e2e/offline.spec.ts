import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

/**
 * The offline guarantee, exercised for real: install the service worker, cut
 * the network at the browser level, reload, and check that the shell, the day
 * cards, the safety notes and the calculations are all still there.
 */

/**
 * Get to a page the service worker is actually controlling.
 *
 * The very first load is deliberately NOT controlled: the app registers with
 * `clientsClaim: false` and `skipWaiting: false` so a new build can never take
 * over a running field session without being asked. One reload after the
 * worker activates is what hands control over. This is behaviour worth knowing
 * about — the first launch of a fresh install is not yet offline-capable.
 */
async function installServiceWorker(page: Page): Promise<void> {
  await page.goto('./');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller), null, {
    timeout: 20_000,
  });
}

test.describe('offline', () => {
  test('is not controlled on the very first load, and is after one reload', async ({ page }) => {
    await page.goto('./');
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    expect(await page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(false);
    await page.reload();
    await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller), null, {
      timeout: 20_000,
    });
  });

  test('reports readiness once the service worker has installed', async ({ page }) => {
    await installServiceWorker(page);
    await page.goto('./#/offline');
    await expect(page.getByTestId('readiness-card')).toContainText(/Ready for offline use/i, {
      timeout: 20_000,
    });
    await expect(page.getByTestId('asset-list')).toContainText('Data — days.json');
  });

  test('flips the connectivity indicator when the browser reports going offline', async ({
    page,
  }) => {
    await page.goto('./');
    await expect(page.getByTestId('online-chip')).toContainText(/online/i);
    // Chromium under Playwright does not always flip navigator.onLine when the
    // network is cut, so drive the event the hook actually listens for.
    await page.evaluate(() => window.dispatchEvent(new Event('offline')));
    await expect(page.getByTestId('online-chip')).toContainText(/offline/i);
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await expect(page.getByTestId('online-chip')).toContainText(/device online/i);
  });

  test('is explicit that browser caching is not permanent', async ({ page }) => {
    await page.goto('./#/offline');
    await expect(page.getByText(/Browser caching is not permanent/i)).toBeVisible();
    await expect(page.getByText(/evicts storage/i)).toBeVisible();
  });

  test('day cards, safety notes and the calculator survive the network being cut', async ({
    page,
    context,
  }) => {
    await installServiceWorker(page);

    await context.setOffline(true);
    await page.reload();

    await expect(page.getByTestId('demo-banner').first()).toBeVisible();

    await page.goto('./#/day/d-2026-10-24');
    await expect(page.getByRole('heading', { name: /Walk 4 — Odawara over Hakone/i })).toBeVisible();
    await page.getByTestId('toggle-full-card').click();
    await expect(page.locator('.card--stop').getByText(/green paint/i).first()).toBeVisible();

    await page.goto('./#/decide');
    await page.getByTestId('input-pace').fill('4');
    await page.getByTestId('input-completed').fill('10');
    await expect(page.getByTestId('remaining')).not.toContainText('—');
    await expect(page.getByTestId('time-to-finish')).not.toContainText('—');

    await page.goto('./#/places');
    await expect(page.getByRole('link', { name: /Hakone Pass IC/ })).toBeVisible();

    await context.setOffline(false);
  });

  test('a cold start with no network at all still works once installed', async ({
    page,
    context,
  }) => {
    await installServiceWorker(page);
    await context.setOffline(true);
    // Navigate away and back, i.e. as close to a fresh launch as a browser test gets.
    await page.goto('about:blank');
    await page.goto('./#/');
    await expect(page.getByTestId('demo-banner').first()).toBeVisible();
    await expect(page.getByTestId('data-version-chip')).toContainText('0.1.0-demo');
    await context.setOffline(false);
  });

  test('captures still save with no network', async ({ page, context }) => {
    await installServiceWorker(page);
    await context.setOffline(true);
    await page.goto('./#/capture');
    await page.getByTestId('capture-text').fill('Offline capture works.');
    await page.getByTestId('capture-save').click();
    await expect(page.getByTestId('capture-status')).toContainText(/saved to this device/i);
    await context.setOffline(false);
  });
});
