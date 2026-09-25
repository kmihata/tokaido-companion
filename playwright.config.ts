import { defineConfig, devices } from '@playwright/test';

/**
 * Browser tests run against the PRODUCTION BUILD served by `vite preview`,
 * at the GitHub Pages subpath. Testing the dev server would prove nothing
 * about the two things most likely to break in deployment: the subpath and
 * the service worker.
 */
const PORT = 4173;
const BASE = '/tokaido-companion/';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'line' : [['list']],
  timeout: 45_000,
  use: {
    baseURL: `http://localhost:${PORT}${BASE}`,
    trace: 'retain-on-failure',
  },
  projects: [
    {
      // The production device is an iPhone. Desktop is secondary, so the
      // default project is the phone.
      name: 'iphone',
      use: { ...devices['iPhone 13'], browserName: 'chromium' },
    },
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: `npm run preview -- --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}${BASE}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
