// End-to-end suite: real journeys against the public demo target, the build GitHub Pages serves.
//
// The demo is what this runs on, not the dev server: it is the public target, it ships no service
// worker (so no cache can make a stale build pass), and it has no backend (so the suite needs no
// PocketBase). It is served from the repository subpath, exactly as Pages serves it, which is what
// keeps a root-absolute asset path from passing here and breaking there.
import { defineConfig, devices } from '@playwright/test'

// Not 4173: that is `vite preview`'s default, and a preview of the private build left running on
// it would otherwise be reused as if it were the demo.
const PORT = 4174
const BASE = '/tablemarks/'
const MOBILE_ONLY = /mobile\.spec\.ts$/
// Not `dist`: that is the real production build, and this suite's build must never overwrite it.
const OUT_DIR = 'dist-e2e'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never' }]]
    : [['list'], ['html', { open: 'never' }]],
  outputDir: 'test-results',
  use: {
    baseURL: `http://localhost:${PORT}${BASE}`,
    // The asserted strings are the `en` translations; i18next would otherwise follow the machine.
    locale: 'en-US',
    // Visit days are local calendar days: a fixed zone keeps "today" the same on every runner.
    timezoneId: 'Europe/Paris',
    // A fixed, granted position: without it the distance sort changes from one run to the next.
    geolocation: { latitude: 48.853, longitude: 2.3499 },
    permissions: ['geolocation'],
    trace: 'on-first-retry',
  },
  // The app is used mostly on a phone, so the phone is a first-class project, not an extra.
  projects: [
    { name: 'chromium', testIgnore: MOBILE_ONLY, use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile-webkit', use: { ...devices['iPhone 15'] } },
  ],
  webServer: {
    command: `npx vite build --mode demo --base=${BASE} --outDir ${OUT_DIR} && npx vite preview --base=${BASE} --outDir ${OUT_DIR} --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}${BASE}`,
    // Always false: the build takes seconds, and reusing a leftover server on this port would
    // silently serve a stale build instead of failing loudly (--strictPort) on a busy port.
    reuseExistingServer: false,
    timeout: 180_000,
  },
})
