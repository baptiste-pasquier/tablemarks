---
title: End-to-end tests with Playwright - Plan
type: feat
date: 2026-09-27
topic: e2e-playwright
status: ready
---

# End-to-end tests with Playwright Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Playwright suite that runs seven real user journeys against the public demo build, blocks a pull request in CI when one breaks, and never touches the real network.

**Architecture:** `playwright.config.ts` builds the demo target and serves it with `vite preview` on port 4174 under `/tablemarks/`. An `auto` fixture in `e2e/fixtures.ts` puts one catch-all `context.route` on every browser context: localhost passes, Nominatim / OSM tiles / Google Fonts get canned replies from `mockFor`, anything else is recorded and aborted, and the test fails at teardown if anything was recorded. Journeys drive the UI through role- and label-based helpers in `e2e/app.ts`.

**Tech Stack:** `@playwright/test` 1.63, `eslint-plugin-playwright` 2.12, `@types/node` 24, GitHub Actions.

**Spec:** `docs/journal/specs/2026-09-27-e2e-playwright-design.md`

## Global Constraints

- Target under test: the demo build, `vite build --mode demo --base=/tablemarks/` then `vite preview --base=/tablemarks/ --port 4174 --strictPort`; `baseURL` is `http://localhost:4174/tablemarks/`.
- Projects: `chromium` (`devices['Desktop Chrome']`) and `mobile-webkit` (`devices['iPhone 15']`). `mobile.spec.ts` runs on `mobile-webkit` only; every other spec runs on both.
- `use`: `locale: 'en-US'`, `timezoneId: 'Europe/Paris'`, `geolocation: { latitude: 48.853, longitude: 2.3499 }`, `permissions: ['geolocation']`, `trace: 'on-first-retry'`.
- `forbidOnly` and `retries: 2` on CI only; `fullyParallel: true`; no `workers` override.
- No real network: every external request is mocked or fails the test. A new external host means a new branch in `mockFor`, never a live call.
- Selectors: `getByRole`, `getByLabel`, `getByText` only — no CSS class, no `locator('..')`, no bare tag. Visible strings are the `en` translations in `src/i18n/locales/en/translation.json`.
- Every mocked cross-origin reply carries `access-control-allow-origin: *` — Nominatim is read with `fetch` and tiles load with `crossOrigin="anonymous"`, so without it the browser drops the mock.
- Repo style (`AGENTS.md`): relative imports, `import type` for type-only imports, `function` declarations for named module functions, no `any`.
- CI actions pinned by SHA with the version as a comment; `node-version-file: '.nvmrc'`; never `lts/*`.
- Commit messages carry no AI attribution footer.
- Spec deviations, decided while planning (the spec is updated in Task 1's commit):
  - Nominatim fixtures are a typed module, `e2e/osm.ts`, rather than `fixtures/*.json`.
  - The tile is an inline 1×1 PNG rather than `fixtures/tile.png`.
  - `Modal` gains `role="dialog"` (Task 2). Nothing marks the panel as a dialog today, so a verdict button inside the place detail and the same-named filter chip behind it are indistinguishable to `getByRole`.

## Review Focus

- **An unmocked host reached from a second browser context** (the import side of journey 5) must still fail the test. Pinned: `freshPage` installs the same guard and asserts at its own teardown (Task 5).
- **The guard must never block the app's own origin**, whatever loopback spelling the browser uses (`localhost`, `127.0.0.1`, `[::1]`). Pinned: `guard.spec.ts` checks `mockFor`/`isLocal` for all three (Task 1).
- **A name Nominatim does not know** must reach the user as "No matching places found.", not hang or leak a request. Pinned: an extra test in `add-by-search.spec.ts` (Task 3).
- **A refused short link** must create nothing and send nothing to Nominatim. Pinned: journey 2b asserts both the empty list and zero Nominatim requests (Task 3).
- **A filter chip and a verdict button share a name** ("Go back"); a locator must never hit the wrong one. Pinned: every in-modal action is scoped to `getByRole('dialog')` (Task 2 adds the role), and chips are only clicked with no dialog open (Task 4).

---

## File structure

| Path                                  | Responsibility                                                                  |
| ------------------------------------- | ------------------------------------------------------------------------------- |
| `playwright.config.ts`                | Projects, context options, `webServer` building and serving the demo target    |
| `e2e/tsconfig.json`                   | Type-checks `e2e/` and the config (the root `tsconfig.json` includes only `src/`) |
| `e2e/osm.ts`                          | The places the specs know, and Nominatim's reply for a request URL             |
| `e2e/fixtures.ts`                     | `mockFor`, `isLocal`, `installNetworkGuard`, the extended `test` (`network`, `freshPage`) |
| `e2e/app.ts`                          | UI helpers: open the app, switch pane, add a place, open a place, log a visit, filter, close a dialog |
| `e2e/guard.spec.ts`                   | The guard itself: what it mocks, what it blocks, that the app loads clean      |
| `e2e/add-by-search.spec.ts`           | Journey 1 (+ the no-match case)                                                 |
| `e2e/add-by-link.spec.ts`             | Journey 2a and 2b                                                               |
| `e2e/visit-verdict.spec.ts`           | Journey 3                                                                       |
| `e2e/persistence.spec.ts`             | Journey 4                                                                       |
| `e2e/portability.spec.ts`             | Journey 5                                                                       |
| `e2e/delete-place.spec.ts`            | Journey 6                                                                       |
| `e2e/mobile.spec.ts`                  | Journey 7 (`mobile-webkit` only)                                                |
| `src/features/ui/Modal.tsx` (+ test)  | `role="dialog"` + `aria-modal="true"` on the panel                             |
| `.github/workflows/e2e.yml`           | The CI job                                                                      |

---

### Task 1: Tooling, network guard, and a clean app load

**Files:**
- Create: `playwright.config.ts`, `e2e/tsconfig.json`, `e2e/osm.ts`, `e2e/fixtures.ts`, `e2e/guard.spec.ts`
- Modify: `package.json` (scripts, devDependencies), `eslint.config.ts`, `.gitignore`, `.prettierignore`, `.dockerignore`, `docs/journal/specs/2026-09-27-e2e-playwright-design.md` (deviations)

**Interfaces:**
- Produces (used by every later task):
  - `e2e/osm.ts`: `interface Place { name: string; lat: number; lng: number; osmId: number }`, `const PLACES: { chezMarcel: Place; leServan: Place }`, `function nominatimReply(url: URL): unknown` (`undefined` = endpoint not mocked).
  - `e2e/fixtures.ts`: `interface NetworkLog { mocked: string[]; violations: string[] }`, `function isLocal(url: URL): boolean`, `function mockFor(url: URL): Fulfill | null`, `function installNetworkGuard(context: BrowserContext): Promise<NetworkLog>`, `const test` (fixtures `network: NetworkLog`, auto; `freshPage: Page`), re-exported `expect`.

- [ ] **Step 1: Install the dependencies and the two browsers**

```bash
npm install -D @playwright/test@^1.63.0 eslint-plugin-playwright@^2.12.0 @types/node@^24
npx playwright install chromium webkit
```

Expected: `package.json` gains the three devDependencies; the browsers download.

- [ ] **Step 2: Add the scripts**

In `package.json` `scripts`, change `type-check` and add `test:e2e` right after `test:watch`:

```json
    "test:watch": "vitest",
    "test:e2e": "playwright test",
    "type-check": "tsc --noEmit && tsc --noEmit -p e2e",
```

- [ ] **Step 3: Write `playwright.config.ts`**

```ts
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
    command: `npx vite build --mode demo --base=${BASE} && npx vite preview --base=${BASE} --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}${BASE}`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
})
```

- [ ] **Step 4: Write `e2e/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2023", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "types": ["node"],
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "verbatimModuleSyntax": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true
  },
  "include": ["./**/*.ts", "../playwright.config.ts"]
}
```

- [ ] **Step 5: Scope ESLint**

In `eslint.config.ts`, add the import after `pluginVitest`:

```ts
import pluginPlaywright from 'eslint-plugin-playwright'
```

Change the `app/react` block's `files` so the React rules stay on the app — a Playwright fixture's `use` callback reads as React's `use` hook to `rules-of-hooks`:

```ts
  {
    name: 'app/react',
    files: ['src/**/*.{ts,tsx}'],
```

Append after the `app/tests` block:

```ts
  // End-to-end specs and their helpers. `flat/recommended` also turns `no-empty-pattern` off, for
  // the `async ({}, use) =>` shape Playwright fixtures take.
  {
    name: 'e2e/playwright',
    files: ['e2e/**/*.ts'],
    extends: [pluginPlaywright.configs['flat/recommended']],
  },
```

- [ ] **Step 6: Ignore the reports**

Append to `.gitignore`:

```
# Playwright output (npm run test:e2e)
playwright-report/
test-results/
```

Append to `.prettierignore`:

```
# Playwright output: generated, never hand-edited.
playwright-report/
test-results/
```

Append to `.dockerignore` (after the `docs`/`scripts` group):

```
e2e
playwright-report
test-results
```

- [ ] **Step 7: Write the failing guard spec, `e2e/guard.spec.ts`**

```ts
import { expect, isLocal, mockFor, test } from './fixtures'

test.describe('network guard', () => {
  test('passes the app’s own origin, whatever loopback spelling', () => {
    expect(isLocal(new URL('http://localhost:4174/tablemarks/'))).toBe(true)
    expect(isLocal(new URL('http://127.0.0.1:4174/tablemarks/'))).toBe(true)
    expect(isLocal(new URL('http://[::1]:4174/tablemarks/'))).toBe(true)
    expect(isLocal(new URL('https://example.com/'))).toBe(false)
  })

  test('mocks OpenStreetMap and Google Fonts, and nothing else', () => {
    expect(mockFor(new URL('https://tile.openstreetmap.org/12/2074/1409.png'))).not.toBeNull()
    expect(mockFor(new URL('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans'))).not.toBeNull()
    expect(
      mockFor(new URL('https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=1&lon=2')),
    ).not.toBeNull()
    expect(mockFor(new URL('https://nominatim.openstreetmap.org/status'))).toBeNull()
    expect(mockFor(new URL('https://example.com/'))).toBeNull()
  })

  test('records and blocks a request to an unmocked host', async ({ page, network }) => {
    await page.goto('./')
    const outcome = await page.evaluate(() =>
      fetch('https://example.com/probe').then(
        () => 'reached',
        () => 'blocked',
      ),
    )
    expect(outcome).toBe('blocked')
    expect(network.violations).toEqual(['https://example.com/probe'])
    // Emptied so this test's own teardown — which fails on any violation — passes.
    network.violations.length = 0
  })

  test('the app loads with every external request mocked', async ({ page, network }) => {
    await page.goto('./')
    await expect(page.getByRole('heading', { name: 'Tablemarks' })).toBeVisible()
    await expect(page.getByText('No places yet')).toBeVisible()
    await expect
      .poll(() => network.mocked.some((u) => u.startsWith('https://fonts.googleapis.com/')))
      .toBe(true)
  })
})
```

- [ ] **Step 8: Run it to verify it fails**

Run: `npx playwright test e2e/guard.spec.ts --project=chromium`
Expected: FAIL — `Cannot find module './fixtures'` (or equivalent resolution error).

- [ ] **Step 9: Write `e2e/osm.ts`**

```ts
// Canned OpenStreetMap replies. Nothing under e2e/ reaches the real Nominatim: a test that depends
// on it fails without a bug, and OSM's usage policy asks test suites not to call it.

export interface Place {
  name: string
  lat: number
  lng: number
  osmId: number
}

/** Every place a spec may search for — more than a kilometre apart, so dedup never merges two. */
export const PLACES = {
  chezMarcel: { name: 'Chez Marcel', lat: 48.8566, lng: 2.3522, osmId: 1001 },
  leServan: { name: 'Le Servan', lat: 48.8625, lng: 2.3811, osmId: 1002 },
} as const satisfies Record<string, Place>

const KNOWN: readonly Place[] = Object.values(PLACES)

/** A `jsonv2` row for an eatery, shaped like what `candidateFrom` reads (`src/capture/osmTags.ts`). */
function eateryRow(p: Place) {
  return {
    display_name: `${p.name}, 12 Rue de l'Exemple, 75011 Paris, France`,
    name: p.name,
    lat: String(p.lat),
    lon: String(p.lng),
    osm_type: 'node',
    osm_id: p.osmId,
    category: 'amenity',
    type: 'restaurant',
    address: { house_number: '12', road: "Rue de l'Exemple", postcode: '75011', city: 'Paris' },
    extratags: { cuisine: 'french' },
  }
}

/** A non-eatery row, so a name search also exercises the "other results" filtering. */
function streetRow(p: Place) {
  return {
    display_name: `Passage ${p.name}, Paris, France`,
    name: `Passage ${p.name}`,
    lat: String(p.lat + 0.01),
    lon: String(p.lng),
    osm_type: 'way',
    osm_id: p.osmId + 5000,
    category: 'highway',
    type: 'residential',
  }
}

/**
 * Nominatim's reply for a request URL, or `undefined` for an endpoint nothing mocks (the guard then
 * counts it as a violation). `/search` with `bounded=1` is `matchNear` checking a pasted link's
 * position: it answers with the eatery alone, at the place's own coordinates.
 */
export function nominatimReply(url: URL): unknown {
  const place = KNOWN.find((p) => p.name === url.searchParams.get('q'))
  switch (url.pathname) {
    case '/search':
      if (!place) return []
      return url.searchParams.get('bounded') === '1'
        ? [eateryRow(place)]
        : [eateryRow(place), streetRow(place)]
    case '/reverse':
      return { display_name: "12 Rue de l'Exemple, 75011 Paris, France" }
    case '/lookup': {
      const id = Number(url.searchParams.get('osm_ids')?.slice(1))
      const found = KNOWN.find((p) => p.osmId === id)
      return found ? [eateryRow(found)] : []
    }
    default:
      return undefined
  }
}
```

- [ ] **Step 10: Write `e2e/fixtures.ts`**

```ts
// The one `test` every spec imports. Its `network` fixture is automatic: no spec can opt out of
// the guard, and no spec has to remember it.
import { test as base, expect, type BrowserContext, type Page, type Route } from '@playwright/test'
import { nominatimReply } from './osm'

/** What the guard saw: external requests it answered, and the ones nothing mocks. */
export interface NetworkLog {
  mocked: string[]
  violations: string[]
}

type Fulfill = NonNullable<Parameters<Route['fulfill']>[0]>

const LOCAL_HOSTS: ReadonlySet<string> = new Set(['localhost', '127.0.0.1', '[::1]'])

// Nominatim is read with `fetch` and tiles load with `crossOrigin="anonymous"`: without this header
// the browser discards the mocked reply exactly as it would a real one.
const CORS = { 'access-control-allow-origin': '*' }

// 1×1 transparent PNG. Leaflet stretches it over the 256 px tile; nothing asserts on pixels.
const TILE_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
)

export function isLocal(url: URL): boolean {
  return LOCAL_HOSTS.has(url.hostname)
}

/** The canned reply for an external URL, or null when nothing mocks it. */
export function mockFor(url: URL): Fulfill | null {
  switch (url.hostname) {
    case 'nominatim.openstreetmap.org': {
      const body = nominatimReply(url)
      return body === undefined ? null : { json: body, headers: CORS }
    }
    case 'tile.openstreetmap.org':
      return { body: TILE_PNG, contentType: 'image/png', headers: CORS }
    // `index.html` links the Plus Jakarta Sans stylesheet; an empty one means no font file is ever
    // requested from fonts.gstatic.com, so that host needs no mock of its own.
    case 'fonts.googleapis.com':
      return { body: '', contentType: 'text/css', headers: CORS }
    default:
      return null
  }
}

/**
 * One catch-all route per context: local passes, a mocked host is answered, anything else is
 * recorded and aborted. Recorded, not just aborted — the app swallows some failures
 * (`reverseGeocode(...).catch(() => undefined)`), so an abort alone would go unnoticed.
 */
export async function installNetworkGuard(context: BrowserContext): Promise<NetworkLog> {
  const log: NetworkLog = { mocked: [], violations: [] }
  await context.route('**/*', async (route) => {
    const url = new URL(route.request().url())
    if (isLocal(url)) return route.continue()
    const mock = mockFor(url)
    if (mock) {
      log.mocked.push(url.href)
      return route.fulfill(mock)
    }
    log.violations.push(url.href)
    return route.abort('blockedbyclient')
  })
  return log
}

export const test = base.extend<{ network: NetworkLog; freshPage: Page }>({
  network: [
    async ({ context }, use) => {
      const log = await installNetworkGuard(context)
      await use(log)
      expect(log.violations, 'requests to unmocked external hosts').toEqual([])
    },
    { auto: true },
  ],
  // A second, empty browser context (export in one, import in the other). Inside a test,
  // `browser.newContext()` takes the project's `use` options — device, locale, baseURL,
  // geolocation — so this page differs from `page` only by its storage. Same guard, same teardown
  // check: a guard that could be forgotten on a second context would guarantee nothing.
  freshPage: async ({ browser }, use) => {
    const context = await browser.newContext()
    const log = await installNetworkGuard(context)
    await use(await context.newPage())
    await context.close()
    expect(log.violations, 'requests to unmocked external hosts (fresh context)').toEqual([])
  },
})

export { expect }
```

- [ ] **Step 11: Run the guard spec on both projects**

Run: `npx playwright test e2e/guard.spec.ts`
Expected: 8 passed (4 tests × 2 projects). The first run includes the demo build (up to ~1 min).

If "the app loads" fails with a violation, the message lists the URL: add its host to `mockFor` only if the app legitimately calls it, and record the finding for the Task 7 journal entry.

- [ ] **Step 12: Prove the teardown check can fail**

Temporarily delete the line `network.violations.length = 0` in the "records and blocks" test.
Run: `npx playwright test e2e/guard.spec.ts --project=chromium -g "records and blocks"`
Expected: FAIL with `requests to unmocked external hosts` listing `https://example.com/probe`.
Restore the line; rerun; expected PASS.

- [ ] **Step 13: Run the static gate**

Run: `npm run type-check && npx eslint . && npx prettier . --check`
Expected: all clean. (`npm run format` fixes formatting if Prettier reports a file.)

- [ ] **Step 14: Record the spec deviations**

In `docs/journal/specs/2026-09-27-e2e-playwright-design.md`:
- in the Decisions table, replace the `App changes` row's decision with `One: `Modal` gains `role="dialog"` so specs can scope to it (see the plan); map markers already expose `role="img"` with the place name`;
- in the Files tree, replace the `fixtures/*.json` and `fixtures/tile.png` lines with `osm.ts   the known places and Nominatim's reply for a URL (typed, not JSON)` and note the tile is an inline 1×1 PNG in `fixtures.ts`;
- in "Network guard and mocks", replace "Named mocks registered on top (Playwright runs the last registered matching route first)" with "One catch-all route that dispatches by host through `mockFor`".

- [ ] **Step 15: Commit**

```bash
git add package.json package-lock.json playwright.config.ts e2e/ eslint.config.ts .gitignore .prettierignore .dockerignore docs/journal/specs/2026-09-27-e2e-playwright-design.md
git commit -m "test(e2e): Playwright on the demo build, with a network guard"
```

---

### Task 2: `Modal` is a dialog

**Files:**
- Modify: `src/features/ui/Modal.tsx` (the panel `div`, ~line 78)
- Test: `src/features/ui/Modal.test.tsx`

**Interfaces:**
- Produces: every `Modal` panel has `role="dialog"` and `aria-modal="true"`; Tasks 3–6 locate it with `page.getByRole('dialog')`.

- [ ] **Step 1: Write the failing test** — add inside `describe('Modal', …)`:

```tsx
  it('exposes its panel as a modal dialog', () => {
    render(<Modal onClose={vi.fn()}>Content</Modal>)
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog).toHaveTextContent('Content')
  })
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/features/ui/Modal.test.tsx -t "modal dialog"`
Expected: FAIL — `Unable to find an accessible element with the role "dialog"`.

- [ ] **Step 3: Add the role** — in `Modal.tsx`, the panel element becomes:

```tsx
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
```

- [ ] **Step 4: Run the whole unit suite**

Run: `npm test`
Expected: PASS, including every existing test that queries inside a modal.

- [ ] **Step 5: Commit**

```bash
git add src/features/ui/Modal.tsx src/features/ui/Modal.test.tsx
git commit -m "fix(ui): expose Modal panels as dialogs"
```

---

### Task 3: UI helpers, journeys 1 and 2

**Files:**
- Create: `e2e/app.ts`, `e2e/add-by-search.spec.ts`, `e2e/add-by-link.spec.ts`

**Interfaces:**
- Consumes: `test`, `expect`, `network` from `e2e/fixtures.ts`; `PLACES` from `e2e/osm.ts`; `role="dialog"` from Task 2.
- Produces (`e2e/app.ts`), used by Tasks 4–6:
  - `openApp(page: Page): Promise<void>`
  - `showList(page: Page): Promise<void>`, `showMap(page: Page): Promise<void>` (no-ops on desktop)
  - `placeCard(page: Page, name: string): Locator`
  - `submitQuery(page: Page, text: string): Promise<Locator>` (returns the Add-a-place dialog)
  - `addBySearch(page: Page, name: string): Promise<void>`
  - `openPlace(page: Page, name: string): Promise<Locator>` (returns the detail dialog)
  - `logVisit(page: Page, name: string, verdict: string): Promise<void>`
  - `toggleFilter(page: Page, label: string): Promise<void>`
  - `openSettings(page: Page): Promise<Locator>`
  - `closeDialog(page: Page): Promise<void>`

- [ ] **Step 1: Write the journey specs first**

`e2e/add-by-search.spec.ts`:

```ts
import { expect, test } from './fixtures'
import { addBySearch, openApp, placeCard, showMap, submitQuery } from './app'
import { PLACES } from './osm'

test.beforeEach(async ({ page }) => {
  await openApp(page)
})

test('a place added by name search shows in the list and on the map', async ({ page }) => {
  const { name } = PLACES.chezMarcel
  await addBySearch(page, name)
  await expect(placeCard(page, name)).toContainText('To try')
  await showMap(page)
  await expect(page.getByRole('img', { name })).toBeVisible()
})

test('a name nothing matches says so', async ({ page }) => {
  const dialog = await submitQuery(page, 'Nowhere Bistro')
  await expect(dialog.getByText('No matching places found.')).toBeVisible()
})
```

`e2e/add-by-link.spec.ts`:

```ts
import { expect, test } from './fixtures'
import { closeDialog, openApp, placeCard, submitQuery } from './app'
import { PLACES } from './osm'

test.beforeEach(async ({ page }) => {
  await openApp(page)
})

test('a full Google Maps link creates the place', async ({ page }) => {
  const { name, lat, lng } = PLACES.leServan
  const link = `https://www.google.com/maps/place/${name.replaceAll(' ', '+')}/@${lat},${lng},17z`
  const dialog = await submitQuery(page, link)
  await expect(dialog.getByText('Found on OpenStreetMap')).toBeVisible()
  await dialog.getByRole('button', { name: 'Add', exact: true }).click()
  await expect(dialog).toBeHidden()
  await expect(placeCard(page, name)).toBeVisible()
})

test('a short maps.app.goo.gl link is refused without a backend, and nothing is sent', async ({
  page,
  network,
}) => {
  const dialog = await submitQuery(page, 'https://maps.app.goo.gl/abc123')
  await expect(dialog.getByRole('note')).toContainText('this app runs without one')
  expect(network.mocked.filter((u) => u.startsWith('https://nominatim.'))).toEqual([])
  await closeDialog(page)
  await expect(page.getByText('No places yet')).toBeVisible()
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx playwright test e2e/add-by-search.spec.ts e2e/add-by-link.spec.ts --project=chromium`
Expected: FAIL — `Cannot find module './app'`.

- [ ] **Step 3: Write `e2e/app.ts`**

```ts
// What a person does in the app, in the words the app shows them. Every locator is a role, a label
// or a visible `en` string — never a class — so a restyle cannot break a journey.
import { expect, type Locator, type Page } from '@playwright/test'

/** Below Tailwind's `md` breakpoint the app shows one pane at a time behind the List/Map switch. */
function isMobile(page: Page): boolean {
  return (page.viewportSize()?.width ?? 1280) < 768
}

async function switchView(page: Page, view: 'List' | 'Map'): Promise<void> {
  if (!isMobile(page)) return
  await page.getByRole('navigation', { name: 'View' }).getByRole('button', { name: view }).click()
}

export async function showList(page: Page): Promise<void> {
  await switchView(page, 'List')
}

export async function showMap(page: Page): Promise<void> {
  await switchView(page, 'Map')
}

export async function openApp(page: Page): Promise<void> {
  await page.goto('./')
  await expect(page.getByRole('heading', { name: 'Tablemarks' })).toBeVisible()
}

/** A place's list card. Hidden when the place is filtered out, deleted, or the map pane is showing. */
export function placeCard(page: Page, name: string): Locator {
  return page.getByRole('listitem').filter({ hasText: name })
}

/** Escape closes every `Modal`; a panel with two ✕ buttons (Settings) needs no disambiguation. */
export async function closeDialog(page: Page): Promise<void> {
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toBeHidden()
}

/** Opens "Add a place", types or pastes `text`, and presses Search. Returns the dialog. */
export async function submitQuery(page: Page, text: string): Promise<Locator> {
  await showList(page)
  await page.getByRole('button', { name: '+ Add a place' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Paste a Google Maps link, or type a place name').fill(text)
  await dialog.getByRole('button', { name: 'Search' }).click()
  return dialog
}

export async function addBySearch(page: Page, name: string): Promise<void> {
  const dialog = await submitQuery(page, name)
  // A result card's name starts with the place's; the non-eatery row starts with "Passage".
  await dialog.getByRole('button', { name: new RegExp(`^${name}`) }).click()
  await dialog.getByRole('button', { name: 'Add', exact: true }).click()
  await expect(dialog).toBeHidden()
  await expect(placeCard(page, name)).toBeVisible()
}

export async function openPlace(page: Page, name: string): Promise<Locator> {
  await showList(page)
  await placeCard(page, name).getByRole('button').click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('heading', { name })).toBeVisible()
  return dialog
}

/** "I'm here now" with a verdict: logs today's visit, then closes the detail. */
export async function logVisit(page: Page, name: string, verdict: string): Promise<void> {
  const dialog = await openPlace(page, name)
  await dialog.getByRole('button', { name: 'I’m here now' }).click()
  await dialog.getByRole('button', { name: verdict, exact: true }).click()
  // The picker leaves once the visit is written; closing earlier could race the write.
  await expect(dialog.getByText('How was it?')).toBeHidden()
  await closeDialog(page)
}

/** Toggles one status or verdict chip: in the overlay on desktop, in the pill's sheet on a phone. */
export async function toggleFilter(page: Page, label: string): Promise<void> {
  if (!isMobile(page)) {
    await page.getByRole('button', { name: label, exact: true }).click()
    return
  }
  await page.getByRole('button', { name: /^Filters · \d+$/ }).click()
  const sheet = page.getByRole('dialog')
  await sheet.getByRole('button', { name: label, exact: true }).click()
  await sheet.getByRole('button', { name: 'See results' }).click()
  await expect(sheet).toBeHidden()
}

export async function openSettings(page: Page): Promise<Locator> {
  await page.getByRole('button', { name: 'Open settings' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('heading', { name: 'Settings' })).toBeVisible()
  return dialog
}
```

- [ ] **Step 4: Run the journeys on both projects**

Run: `npx playwright test e2e/add-by-search.spec.ts e2e/add-by-link.spec.ts`
Expected: 8 passed.

If the map assertion fails on `mobile-webkit` only, WebKit is not exposing the marker's inner `role="img"`: add `alt: m.name` and `title: m.name` to the `<Marker>` props in `src/features/map/MapView.tsx` (Leaflet sets `role="button"` on the icon), assert with `page.getByRole('button', { name, exact: true })` instead, and note it for the Task 7 journal entry.

- [ ] **Step 5: Prove a journey can fail**

Temporarily change `'To try'` to `'Go back'` in the first test.
Run: `npx playwright test e2e/add-by-search.spec.ts --project=chromium`
Expected: FAIL on `toContainText`. Revert; rerun; expected PASS.

- [ ] **Step 6: Lint, then commit**

Run: `npx eslint e2e && npx prettier e2e --check && npm run type-check`
Expected: clean.

```bash
git add e2e/app.ts e2e/add-by-search.spec.ts e2e/add-by-link.spec.ts
git commit -m "test(e2e): add a place by name search and by Google Maps link"
```

---

### Task 4: Journeys 3 and 4 — verdict and filters, persistence

**Files:**
- Create: `e2e/visit-verdict.spec.ts`, `e2e/persistence.spec.ts`

**Interfaces:**
- Consumes: `openApp`, `addBySearch`, `placeCard`, `logVisit`, `toggleFilter` from `e2e/app.ts`; `PLACES`.

- [ ] **Step 1: Write `e2e/visit-verdict.spec.ts`**

```ts
import { expect, test } from './fixtures'
import { addBySearch, logVisit, openApp, placeCard, toggleFilter } from './app'
import { PLACES } from './osm'

test.beforeEach(async ({ page }) => {
  await openApp(page)
  await addBySearch(page, PLACES.chezMarcel.name)
  await addBySearch(page, PLACES.leServan.name)
})

test('a visit with a verdict replaces "To try", and the filters find it', async ({ page }) => {
  const marcel = placeCard(page, PLACES.chezMarcel.name)
  const servan = placeCard(page, PLACES.leServan.name)
  await expect(marcel).toContainText('To try')

  await logVisit(page, PLACES.chezMarcel.name, 'Go back')
  await expect(marcel).toContainText('Go back')
  await expect(marcel).not.toContainText('To try')

  await toggleFilter(page, 'Go back')
  await expect(marcel).toBeVisible()
  await expect(servan).toBeHidden()

  await toggleFilter(page, 'Go back')
  await toggleFilter(page, 'To try')
  await expect(servan).toBeVisible()
  await expect(marcel).toBeHidden()
})
```

- [ ] **Step 2: Write `e2e/persistence.spec.ts`**

```ts
import { expect, test } from './fixtures'
import { addBySearch, logVisit, openApp, placeCard } from './app'
import { PLACES } from './osm'

test('places and verdicts survive a reload', async ({ page }) => {
  const { name } = PLACES.chezMarcel
  await openApp(page)
  await addBySearch(page, name)
  await logVisit(page, name, 'Worth a detour')

  // Same page, same context: IndexedDB is the only thing that can bring these back.
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Tablemarks' })).toBeVisible()
  await expect(placeCard(page, name)).toContainText('Worth a detour')
})
```

- [ ] **Step 3: Run both on both projects**

Run: `npx playwright test e2e/visit-verdict.spec.ts e2e/persistence.spec.ts`
Expected: 4 passed.

- [ ] **Step 4: Prove the persistence test can fail**

Temporarily change the verdict asserted after the reload from `'Worth a detour'` to `'Go back'`.
Run: `npx playwright test e2e/persistence.spec.ts --project=chromium`
Expected: FAIL on `toContainText` after the reload. Revert; rerun; expected PASS.

- [ ] **Step 5: Lint, then commit**

Run: `npx eslint e2e && npx prettier e2e --check && npm run type-check`

```bash
git add e2e/visit-verdict.spec.ts e2e/persistence.spec.ts
git commit -m "test(e2e): verdict, status and verdict filters, persistence across reload"
```

---

### Task 5: Journeys 5 and 6 — export/import, delete

**Files:**
- Create: `e2e/portability.spec.ts`, `e2e/delete-place.spec.ts`

**Interfaces:**
- Consumes: `freshPage` from `e2e/fixtures.ts`; `openApp`, `addBySearch`, `logVisit`, `placeCard`, `openPlace`, `openSettings`, `closeDialog` from `e2e/app.ts`.

- [ ] **Step 1: Write `e2e/portability.spec.ts`**

```ts
import { expect, test } from './fixtures'
import { addBySearch, closeDialog, logVisit, openApp, openSettings, placeCard } from './app'
import { PLACES } from './osm'

test('an export imported into an empty browser brings back the same places', async ({
  page,
  freshPage,
}, testInfo) => {
  const marcel = PLACES.chezMarcel.name
  const servan = PLACES.leServan.name
  await openApp(page)
  await addBySearch(page, marcel)
  await addBySearch(page, servan)
  await logVisit(page, marcel, 'Go back')

  const settings = await openSettings(page)
  const downloading = page.waitForEvent('download')
  await settings.getByRole('button', { name: 'Export collection' }).click()
  const file = testInfo.outputPath('tablemarks-export.json')
  await (await downloading).saveAs(file)

  await openApp(freshPage)
  await expect(freshPage.getByText('No places yet')).toBeVisible()
  const panel = await openSettings(freshPage)
  await panel.getByLabel('Import a backup file').setInputFiles(file)
  await expect(panel).toContainText('Import 2 places and 1 visit?')
  await panel.getByRole('button', { name: 'Confirm import' }).click()
  await expect(panel).toContainText('Imported: 2 added, 0 updated, 0 unchanged.')
  await closeDialog(freshPage)

  await expect(placeCard(freshPage, marcel)).toContainText('Go back')
  await expect(placeCard(freshPage, servan)).toContainText('To try')
})
```

- [ ] **Step 2: Write `e2e/delete-place.spec.ts`**

```ts
import { expect, test } from './fixtures'
import { addBySearch, openApp, openPlace, placeCard } from './app'
import { PLACES } from './osm'

test('a place is deleted from its detail, and only once confirmed', async ({ page }) => {
  const { name } = PLACES.chezMarcel
  await openApp(page)
  await addBySearch(page, name)

  const detail = await openPlace(page, name)
  await detail.getByRole('button', { name: 'Delete this place' }).click()
  await expect(detail.getByText('This can’t be undone.')).toBeVisible()
  await detail.getByRole('button', { name: 'Cancel' }).click()
  await expect(detail.getByText('This can’t be undone.')).toBeHidden()

  await detail.getByRole('button', { name: 'Delete this place' }).click()
  await detail.getByRole('button', { name: 'Delete', exact: true }).click()
  await expect(detail).toBeHidden()
  await expect(placeCard(page, name)).toBeHidden()
  await expect(page.getByText('No places yet')).toBeVisible()
})
```

- [ ] **Step 3: Run both on both projects**

Run: `npx playwright test e2e/portability.spec.ts e2e/delete-place.spec.ts`
Expected: 4 passed.

If `freshPage` fails on `page.goto('./')` with an invalid-URL error, or `freshPage` renders in another language, `browser.newContext()` did not take the project options on this Playwright version. Build them explicitly in `freshPage` from `testInfo.project.use`:

```ts
  freshPage: async ({ browser }, use, testInfo) => {
    const { baseURL, locale, timezoneId, geolocation, permissions, viewport, userAgent,
      deviceScaleFactor, isMobile, hasTouch } = testInfo.project.use
    const context = await browser.newContext({ baseURL, locale, timezoneId, geolocation,
      permissions, viewport, userAgent, deviceScaleFactor, isMobile, hasTouch })
```

and record the finding for the Task 7 journal entry.

- [ ] **Step 4: Prove the import assertion can fail**

Temporarily change `'2 added'` to `'3 added'`.
Run: `npx playwright test e2e/portability.spec.ts --project=chromium`
Expected: FAIL on the summary. Revert; rerun; expected PASS.

- [ ] **Step 5: Lint, then commit**

Run: `npx eslint e2e && npx prettier e2e --check && npm run type-check`

```bash
git add e2e/portability.spec.ts e2e/delete-place.spec.ts
git commit -m "test(e2e): export then import into a fresh browser, delete a place"
```

---

### Task 6: Journey 7 — mobile list/map switch and the filters pill

**Files:**
- Create: `e2e/mobile.spec.ts`

**Interfaces:**
- Consumes: `openApp`, `addBySearch`, `placeCard` from `e2e/app.ts`; the `mobile-webkit`-only `testMatch` from `playwright.config.ts`.

- [ ] **Step 1: Write `e2e/mobile.spec.ts`**

```ts
// Runs on `mobile-webkit` only (see `MOBILE_ONLY` in playwright.config.ts): the switch and the
// pill exist below the `md` breakpoint alone.
import { expect, test } from './fixtures'
import { addBySearch, openApp, placeCard } from './app'
import { PLACES } from './osm'

test('the List/Map switch and the "Filters · N" pill', async ({ page }) => {
  const { name } = PLACES.chezMarcel
  await openApp(page)
  await addBySearch(page, name)

  const nav = page.getByRole('navigation', { name: 'View' })
  const list = nav.getByRole('button', { name: 'List' })
  const map = nav.getByRole('button', { name: 'Map' })
  await expect(list).toHaveAttribute('aria-pressed', 'true')

  await map.click()
  await expect(map).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('img', { name })).toBeVisible()
  await expect(placeCard(page, name)).toBeHidden()

  const pill = page.getByRole('button', { name: /^Filters · \d+$/ })
  await expect(pill).toHaveText('Filters · 0')
  await pill.click()
  const sheet = page.getByRole('dialog')
  await sheet.getByRole('button', { name: 'To try', exact: true }).click()
  await sheet.getByRole('button', { name: 'See results' }).click()
  await expect(sheet).toBeHidden()
  await expect(pill).toHaveText('Filters · 1')

  await list.click()
  await expect(pill).toHaveText('Filters · 1')
  await expect(placeCard(page, name)).toBeVisible()
})
```

- [ ] **Step 2: Run it, and check the project split**

Run: `npx playwright test e2e/mobile.spec.ts`
Expected: 1 passed, on `mobile-webkit` only.

Run: `npx playwright test --list | grep mobile.spec`
Expected: every line is `[mobile-webkit]`; none is `[chromium]`.

- [ ] **Step 3: Run the whole suite and time it**

Run: `time npm run test:e2e`
Expected: 25 passed (guard 8, search 4, link 4, verdict 2, persistence 2, portability 2, delete 2, mobile 1), in well under five minutes including the build.

- [ ] **Step 4: Lint, then commit**

Run: `npx eslint e2e && npx prettier e2e --check`

```bash
git add e2e/mobile.spec.ts
git commit -m "test(e2e): mobile list/map switch and filters pill"
```

---

### Task 7: CI workflow and documentation

**Files:**
- Create: `.github/workflows/e2e.yml`
- Modify: `AGENTS.md` (Commands block), `docs/how-to/development.md` (Scripts table, Testing), `README.md` (commands table)
- Create (only if Tasks 1–5 recorded a non-obvious finding): `docs/journal/solutions/conventions/2026-09-27-e2e-network-guard.md`

- [ ] **Step 1: Write `.github/workflows/e2e.yml`**

```yaml
# End-to-end journeys against the public demo target — the build GitHub Pages serves.
#
# Separate from ci.yml because it is the slow gate: it needs two browsers and a build, and ci.yml
# should keep answering in the time it takes today. It runs on pull requests (not drafts) and on
# `main`, which is where a broken journey would otherwise first be seen: on the deployed demo.
#
# To actually block a merge, the "End-to-end" job must also be a required status check in the
# branch protection of `main` — a repository setting, not something this file can declare.
name: E2E

on:
  push:
    branches: [main]
  pull_request:
    types: [opened, synchronize, reopened, ready_for_review]

# An E2E job only reads the code.
permissions:
  contents: read

# A new push supersedes an in-flight run for the same ref.
concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  e2e:
    name: End-to-end (demo build, Chromium + iPhone WebKit)
    # A draft is still being written; `ready_for_review` above runs it once it is not.
    if: github.event_name != 'pull_request' || !github.event.pull_request.draft
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - name: Check out the repository
        uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1

      # Same source of truth as ci.yml: the major in `.nvmrc`.
      - name: Set up Node
        uses: actions/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7.0.0
        with:
          node-version-file: '.nvmrc'
          cache: npm

      - name: Install dependencies
        run: npm ci

      # Only the two browsers the projects use, with their system libraries.
      - name: Install Playwright browsers
        run: npx playwright install --with-deps chromium webkit

      # playwright.config.ts's webServer builds the demo target and serves it; nothing to build here.
      - name: End-to-end tests
        run: npm run test:e2e

      - name: Upload the Playwright report
        if: failure()
        uses: actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a # v7.0.1
        with:
          name: playwright-report
          path: playwright-report/
          retention-days: 14
```

- [ ] **Step 2: Check the pinned SHAs are the tags they claim**

Run:

```bash
gh api repos/actions/checkout/git/ref/tags/v7.0.1 --jq .object.sha
gh api repos/actions/setup-node/git/ref/tags/v7.0.0 --jq .object.sha
gh api repos/actions/upload-artifact/git/ref/tags/v7.0.1 --jq .object.sha
```

Expected: `3d3c42e5…`, `82076278…`, `043fb46d…` respectively. A mismatch means the comment or the SHA is wrong — fix the file, never the check.

- [ ] **Step 3: `AGENTS.md` — Commands block**

Add after the `npx vitest run …` line:

```bash
npm run test:e2e                          # Playwright on the demo build (needs `npx playwright install chromium webkit`)
```

Then run `wc -c AGENTS.md`. Expected: under 8192. The PR description says the budget still held, so no line had to go (7942 bytes before this line). If it exceeds 8192, shorten an existing line of `AGENTS.md` until it fits, and name that line in the PR description.

- [ ] **Step 4: `docs/how-to/development.md`**

In the Scripts table, add after the `npm run test:watch` row and update `type-check`:

```markdown
| `npm run test:e2e`   | Playwright end-to-end suite: builds the demo target, serves it, and runs `e2e/` on Chromium desktop and iPhone WebKit |
| `npm run type-check` | Type-check the app and `e2e/` (`tsc --noEmit`, twice)                                                                  |
```

In `## Testing`, add after the IndexedDB bullet:

```markdown
- **End-to-end:** `npm run test:e2e` runs the journeys in `e2e/` against the demo build, on Chromium desktop and iPhone WebKit. Install the browsers once with `npx playwright install chromium webkit`; after a failure, `npx playwright show-report` opens the report (traces are kept on the first retry in CI).
- **No real network in E2E:** `e2e/fixtures.ts` answers Nominatim, the OSM tiles and Google Fonts with canned replies, and fails the test on any other external request. A new external host means a new branch in `mockFor`, never a live call.
```

Replace the runtime bullet's end so it no longer claims the map is unverified:

```markdown
- **What's verified at runtime, not in jsdom:** the live PocketBase round-trip and the Google OAuth popup. Leaflet map rendering has no layout in jsdom (`MapContainer` is stubbed in component tests); the E2E suite covers it in a real browser.
```

Run `npx prettier docs/how-to/development.md --write` to realign the table.

- [ ] **Step 5: `README.md` — commands table**

Add after the `npm test` row:

```markdown
| `npm run test:e2e`   | Run the end-to-end journeys         |
```

Run `npx prettier README.md --write`.

- [ ] **Step 6: Journal entry, only if earned**

If Tasks 1–5 recorded a finding (an extra external host, `browser.newContext()` ignoring project options, WebKit hiding the marker role), write `docs/journal/solutions/conventions/2026-09-27-e2e-network-guard.md` following `docs/journal/solutions/README.md`'s schema: the symptom, what was measured, the fix, and the file it lives in. If nothing was recorded, skip it and say so in the PR description.

- [ ] **Step 7: Full gate**

Run:

```bash
npm run check:docs && npm run type-check && npx eslint . && npx prettier . --check && npm test && npm run test:e2e
```

Expected: every command exits 0; `test:e2e` reports 25 passed.

- [ ] **Step 8: Commit**

```bash
git add .github/workflows/e2e.yml AGENTS.md docs/how-to/development.md README.md docs/journal/solutions/
git commit -m "ci(e2e): run the Playwright journeys on pull requests and main"
```
