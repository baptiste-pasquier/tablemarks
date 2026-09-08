/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// Two build targets, one source tree. The target discriminator is the Vite **mode**:
//
//   private (default) — `npm run build`                            → full PWA, served at the site root
//   demo              — `npm run build -- --mode demo --base=/tablemarks/` → no service worker, no manifest
//
// `--base` is deliberately NOT hardcoded here: the GitHub Pages workflow passes it on the
// command line so the container build stays at the root and needs no edit-and-revert.
export default defineConfig(({ mode }) => {
  const isDemo = mode === 'demo'

  return {
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        // The public demo ships no service worker and no web manifest (which is what removes the
        // install prompt). `disable` still resolves the virtual `virtual:pwa-register/react` module
        // to a no-op stub, so src/features/pwa/ReloadPrompt needs no conditional import or guard.
        // Plain disabling rather than `selfDestroying`: nothing has ever been published to the Pages
        // subpath, so no returning visitor can hold a worker to unregister — and `selfDestroying`
        // would leave the manifest in place.
        disable: isDemo,
        registerType: 'prompt',
        injectRegister: false, // registered manually via useRegisterSW in src/features/pwa/ReloadPrompt
        includeAssets: ['favicon.ico', 'apple-touch-icon-180x180.png', 'logo.svg'],
        manifest: {
          name: 'Tablemarks',
          short_name: 'Tablemarks',
          description: 'Save and find your favorite places on a map.',
          theme_color: '#d4561f',
          background_color: '#ffffff',
          display: 'standalone',
          // No `start_url`: the plugin defaults it to the resolved base, so a subpath build launches
          // at the subpath. A hardcoded '/' would override that and launch at the origin root.
          icons: [
            { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
            { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
            { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
          navigateFallback: 'index.html',
          // Defensive: the resolve-short-link API runs cross-origin (PocketBase), so navigateFallback
          // never intercepts it today — but this keeps the SPA shell off any same-origin /api/ path if
          // PocketBase is ever co-hosted.
          navigateFallbackDenylist: [/^\/api\//],
          cleanupOutdatedCaches: true,
          runtimeCaching: [
            {
              // config.json carries the PocketBase URL and is fetched at runtime. It has no `json`
              // extension in globPatterns, so it is never precached — without this entry an installed
              // app has no offline path to it at all.
              //
              // NetworkFirst, not CacheFirst: the container serves this file with `no-store` because
              // the backend URL must be re-readable after a redeploy. CacheFirst would pin the first
              // value it ever saw on every installed client, permanently. NetworkFirst falls back to
              // the cached copy only when the network does not answer.
              urlPattern: ({ url, sameOrigin }) => sameOrigin && url.pathname.endsWith('/config.json'),
              handler: 'NetworkFirst',
              options: {
                cacheName: 'runtime-config',
                networkTimeoutSeconds: 5,
                expiration: { maxEntries: 1 },
                cacheableResponse: { statuses: [200] },
              },
            },
            {
              // Cache OSM tiles the user actually views (progressive, no prefetch) so browsed areas
              // render offline. CacheFirst is correct since {z}/{x}/{y} tiles are immutable.
              urlPattern: ({ url }) => url.hostname === 'tile.openstreetmap.org',
              handler: 'CacheFirst',
              options: {
                cacheName: 'osm-tiles',
                expiration: {
                  maxEntries: 500, // ~500 256px tiles ≈ 10-20 MB — a few browsed neighborhoods, well clear of quota
                  maxAgeSeconds: 60 * 60 * 24 * 7, // 7 days — aligns with OSM's cache-header expectation
                  purgeOnQuotaError: true,
                },
                // Only cache 200s. Tiles are fetched in CORS mode (TileLayer crossOrigin) so responses
                // are non-opaque — without that, opaque (status 0) responses get padded to ~7 MB each
                // and the entry cap would not bound storage.
                cacheableResponse: { statuses: [200] },
              },
            },
          ],
        },
        devOptions: { enabled: false },
      }),
    ],
    test: {
      globals: true,
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
      // Scope collection to src/. Agent worktrees under .claude/worktrees/ are full checkouts of
      // this repo, so the default glob collected their src/ copies too — tripling the suite and
      // reporting failures from other branches' code as if they were this tree's.
      include: ['src/**/*.test.{ts,tsx}'],
    },
  }
})
