import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const __dirname = resolve(fileURLToPath(new URL('.', import.meta.url)));
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

/**
 * Base path.
 *
 * The production target is a GitHub Pages *project* site, i.e.
 *   https://<user>.github.io/tokaido-companion/
 * so the app must never assume it is served from the root of a domain.
 *
 * Override with BASE_PATH at build time if the repository is renamed:
 *   BASE_PATH=/some-other-name/ npm run build
 *
 * Must start and end with "/".
 */
const BASE = process.env.BASE_PATH ?? '/tokaido-companion/';

if (!BASE.startsWith('/') || !BASE.endsWith('/')) {
  throw new Error(`BASE_PATH must start and end with "/", received: ${BASE}`);
}

export default defineConfig(() => ({
  // The SAME base in dev, preview and production, deliberately.
  //
  // Serving dev at "/" and production at a subpath hides exactly the bugs this
  // project cannot afford — and `vite preview` reports itself as command
  // "serve", so a command-based switch silently serves a subpath build from the
  // root. Dev therefore runs at http://localhost:5173/tokaido-companion/ too.
  base: BASE,
  build: {
    outDir: 'dist',
    sourcemap: true,
    // Keep the field bundle inspectable and small enough to reason about.
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      // Two entry points, deliberately.
      //
      // `index.html` is the field app: small, offline, one-handed. `desk.html`
      // is route work: a big screen, a keyboard, a network, no hurry. They were
      // one app until 2026-09-13, and the field app was carrying six screens of
      // editing tools that will never be opened on the road, while the editing
      // workflow had no home of its own and lived in Kevin's memory.
      input: {
        index: resolve(__dirname, 'index.html'),
        desk: resolve(__dirname, 'desk.html'),
      },
    },
  },
  plugins: [
    react(),
    VitePWA({
      // "prompt" and NOT "autoUpdate": a working field build is never replaced
      // silently. See OFFLINE-AND-RECOVERY.md.
      registerType: 'prompt',
      injectRegister: null, // registration happens in src/pwa/register.ts
      includeAssets: ['icons/apple-touch-icon.png', 'icons/favicon.svg'],
      manifest: {
        id: BASE,
        name: 'Samwise — Tokaido Field Companion',
        short_name: 'Samwise',
        description:
          'Samwise — offline-first field companion for the Tokyo-to-Kyoto Tokaido walk. Demonstration data only; not for navigation.',
        start_url: '.',
        scope: '.',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#12100e',
        theme_color: '#12100e',
        lang: 'en',
        categories: ['travel', 'navigation', 'utilities'],
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Everything the app needs offline is precached, including the
        // versioned public trip data under public/data/.
        globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest,json,geojson}'],
        // The desk is never precached and never offline. It is a desk tool on a
        // machine with a network; putting it in the field app's cache would put
        // the editing surface on the phone, which is the thing the split
        // exists to prevent — and would cost offline budget for it.
        globIgnores: ['**/*.map', 'examples/**', 'desk.html', 'assets/desk-*'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        navigateFallback: 'index.html',
        // Never hand a desk URL to the field app's fallback: it would answer
        // with the field app and look like the desk had silently vanished.
        navigateFallbackDenylist: [/desk/],
        cleanupOutdatedCaches: true,
        clientsClaim: false, // paired with registerType: 'prompt'
        skipWaiting: false,
        runtimeCaching: [
          {
            // Map tiles are best-effort only. They are NOT part of the offline
            // guarantee: see OFFLINE-AND-RECOVERY.md.
            //
            // The cache name carries a version because Leaflet requests tiles
            // as <img>, so a failure arrives as an opaque status-0 response and
            // is cached exactly like a real tile. When the servers blocked us
            // in September 2026 the "Access blocked" images were cached for
            // thirty days; bumping the name is what actually clears them.
            urlPattern: ({ url }) => url.hostname.endsWith('tile.openstreetmap.org'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'tokaido-map-tiles-v2',
              expiration: { maxEntries: 600, maxAgeSeconds: 60 * 60 * 24 * 30 },
              // 200 only. Status 0 is an opaque response, which is what an
              // uncredentialed <img> tile looks like whether it succeeded or
              // was refused — caching it cached the "Access blocked" image.
              // The tile layer now requests with CORS so the status is real.
              cacheableResponse: { statuses: [200] },
            },
          },
          {
            // Terrain tiles are a planning aid for the passes, so they get a
            // smaller allowance of their own rather than competing with the
            // standard basemap for the same eviction budget.
            urlPattern: ({ url }) => url.hostname.endsWith('tile.opentopomap.org'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'tokaido-terrain-tiles-v2',
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [200] },
            },
          },
        ],
      },
      devOptions: {
        enabled: false,
        type: 'module',
      },
    }),
  ],
}));
