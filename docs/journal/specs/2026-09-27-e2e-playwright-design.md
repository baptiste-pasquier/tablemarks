---
title: End-to-end tests with Playwright - Design
type: design
date: 2026-09-27
topic: e2e-playwright
status: approved
---

# End-to-end tests with Playwright - Design

## Goal

Today a broken journey — adding a place, persistence, import — is only noticed after the public
demo is deployed. A pull request that breaks a real journey must fail in CI instead.

`main` is at #34 (OSM enrichment); the repository has no Playwright and no `e2e/`.

## Decisions

| Question                  | Decision                                                                                                   |
| ------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Target under test         | The demo build (`vite build --mode demo --base=/tablemarks/`, then `vite preview`): no backend, no worker |
| Local vs CI server        | Same command in both, on port `4174` with `--strictPort`, so a preview of the private build on 4173 is never reused by mistake |
| Projects                  | `chromium` (Desktop Chrome) and `mobile-webkit` (iPhone 15)                                               |
| Journey coverage          | Journeys 1–6 on both projects; journey 7 (mobile) on `mobile-webkit` only                                 |
| Network                   | Nothing real. Nominatim, OSM tiles and Google Fonts are mocked; any other external request fails the test |
| Mocking mechanism         | A Playwright fixture with `page.route`/`context.route`, not HAR replay and not an in-app provider swap    |
| Seed data                 | Created through the UI (`addBySearch` helper), never injected into IndexedDB                              |
| Selectors                 | `getByRole` / `getByLabel` only, locale frozen to `en-US`                                                 |
| Determinism               | `timezoneId: 'Europe/Paris'`, fixed `geolocation` with the permission granted                             |
| App changes               | None expected: map markers already expose `role="img"` with the place name (`src/features/map/MapView.tsx`) |

### Why the mocking fixture, not the alternatives

- **HAR replay (`routeFromHAR`)** — recording hits the real OSM, and any change to a query
  parameter breaks the match.
- **Injecting a fake `GeocodeProvider` through `window`** — changes the app for the tests, no
  longer exercises URL construction, and covers neither tiles nor fonts.

The fixture keeps the app's real `fetch` calls and real URLs under test.

## Findings from the code that shaped the design

1. **Google Fonts is a third external host.** `index.html` loads `fonts.googleapis.com` and
   `fonts.gstatic.com`; without a mock the guard fails every test at page load. An empty
   stylesheet is enough.
2. **Markers are already accessible.** `iconForColor` renders
   `<span role="img" aria-label="{name}">`, so `getByRole('img', { name })` works on the map.
   A label is only added if WebKit turns out not to expose it.
3. **The short-link refusal needs no network.** The demo's `public/config.json` has
   `pocketbaseUrl: ""`, which is `absent`, and `capturePaste` refuses a short link before any
   call. A full link does call Nominatim (`matchNear`, a bounded search), which is mocked.
4. **The app swallows some failures** (`reverseGeocode(...).catch(() => undefined)`). A merely
   aborted request would go unnoticed, which is why the guard records violations and fails at
   teardown rather than only aborting.

## Files

```
playwright.config.ts     testDir e2e, fullyParallel, forbidOnly + retries on CI,
                         trace on-first-retry, reporter html (+ github on CI),
                         baseURL http://localhost:4174/tablemarks/,
                         use: locale, timezoneId, geolocation, permissions,
                         projects chromium + mobile-webkit, mobile.spec.ts matched to mobile only,
                         webServer: demo build + vite preview --port 4174 --strictPort
e2e/
  tsconfig.json          standalone (node + @playwright/test types), includes ../playwright.config.ts
  fixtures.ts            extended `test`: network guard + OSM, tile and font mocks
  fixtures/*.json        Nominatim replies (name search, bounded search, reverse)
  fixtures/tile.png      one neutral 256×256 tile
  app.ts                 helpers: openAddPlace, addBySearch, showMap/showList (no-op on desktop)
  add-by-search.spec.ts  add-by-link.spec.ts   visit-verdict.spec.ts
  persistence.spec.ts    portability.spec.ts   delete-place.spec.ts
  mobile.spec.ts
```

Also touched: `package.json` (`test:e2e` = `playwright test`; `type-check` also runs
`tsc -p e2e`; devDependencies `@playwright/test`, `eslint-plugin-playwright`, `@types/node`),
`eslint.config.ts` (Playwright's flat recommended config, scoped to `e2e/**`), `.gitignore` and
`.prettierignore` (`playwright-report/`, `test-results/`), `.github/workflows/e2e.yml`,
`AGENTS.md`, `docs/how-to/development.md`.

## Network guard and mocks

`installNetworkGuard(context)` is one function, called by an `auto: true` fixture on the default
context and by journey 5 on its fresh context — a guard that could be forgotten on a second
context guarantees nothing.

1. A catch-all route: a request to any host other than `localhost` is recorded as a violation
   and aborted.
2. Named mocks registered on top (Playwright runs the last registered matching route first):

| Host / path                              | Reply                                                          |
| ---------------------------------------- | -------------------------------------------------------------- |
| `nominatim…/search` without `bounded=1`  | Name search: for "Chez Marcel", an `amenity=restaurant` row and a street row (exercises the eatery filter) |
| `nominatim…/search?bounded=1`            | `matchNear` for a full link: one eatery row within 75 m        |
| `nominatim…/search`, any other query     | `[]`                                                           |
| `nominatim…/reverse`                     | A fixed address                                                |
| `tile.openstreetmap.org/**`              | `fixtures/tile.png`                                            |
| `fonts.googleapis.com/**`                | Empty `text/css`                                               |
| `fonts.gstatic.com/**`                   | Covered by the empty stylesheet; no font file is ever requested |

At teardown, `expect(violations).toEqual([])` fails the test and lists every unmocked URL.

## Journeys

| #  | Journey                                                                                       | Asserted                                                                                          |
| -- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| 1  | Search "Chez Marcel" → pick the restaurant → "Add"                                            | A list button named "Chez Marcel"; on the map (after `showMap` on mobile) `getByRole('img', { name: 'Chez Marcel' })` |
| 2a | Paste `https://www.google.com/maps/place/…/@48.85…,2.35…` → "Found on OpenStreetMap" → "Add" | The place is in the list                                                                          |
| 2b | Paste `https://maps.app.goo.gl/abc` → "Search"                                                | The `role="note"` carries `shortLinkNeedsBackend`, nothing is created, the guard saw no request   |
| 3  | Two places; one gets "Go back" from its detail                                                | Its badge goes from "To try" to "Go back"; the "Go back" filter keeps only it, "To try" only the other (through the pill's sheet on mobile) |
| 4  | Add a place and a verdict → `page.reload()` in the same context                               | Place and verdict are still there                                                                  |
| 5  | Two places, one verdict → "Export collection" (`waitForEvent('download')`) → fresh context with the same project options and the guard → "Import a backup file" → "Confirm import" | The summary reads "2 added" and both names are listed                                            |
| 6  | Detail → "Delete this place" → "Cancel", then again → "Delete"                                | Still listed after "Cancel"; gone after "Delete" (the "No places yet" empty state)                |
| 7  | `mobile-webkit` only: "Map" then "List" (`aria-pressed`); "Filters · 0" → pick a verdict → "See results" | The pill reads "Filters · 1" on both the list and the map                                  |

Every test starts with an empty IndexedDB (one browser context per test). Journey 5 must build
its fresh context with the project's options (device, locale, `baseURL`, geolocation);
`browser.newContext()` may not inherit them from the config, which is checked against the
Playwright documentation during planning.

## CI — `.github/workflows/e2e.yml`

Modelled on `ci.yml`:

- Triggers: `push` to `main`, and `pull_request` with types
  `opened, synchronize, reopened, ready_for_review`; the job runs under
  `if: github.event_name != 'pull_request' || !github.event.pull_request.draft`.
- `permissions: contents: read`, the same `concurrency` group as `ci.yml`, `timeout-minutes: 15`.
- Steps: checkout, setup-node (`node-version-file: '.nvmrc'`, npm cache), `npm ci`,
  `npx playwright install --with-deps chromium webkit`, `npm run test:e2e` (the `webServer`
  builds the demo).
- `upload-artifact` of `playwright-report/` under `if: failure()`, 14-day retention.
- Every action pinned by SHA with its version as a comment; checkout and setup-node reuse
  `ci.yml`'s SHAs.
- Browsers are not cached: `install --with-deps` takes about a minute, inside the budget.

Making the job a **required check** is a branch-protection setting in GitHub, outside the
repository; the pull request description says so.

## Documentation

- `AGENTS.md` Commands block: one line for `npm run test:e2e`. The file is at 7.8 KB of its
  8 KB budget, so an existing line is shortened and the PR says which.
- `docs/how-to/development.md`: `test:e2e` in the scripts table; in Testing, what E2E covers,
  the network guard, `npx playwright install chromium webkit` and `npx playwright show-report`;
  the "Leaflet map rendering" runtime-only line is qualified, since E2E now covers it.
- `docs/journal/solutions/conventions/`: an entry only if implementation surfaces something
  non-obvious (the Google Fonts host, `browser.newContext()` options).

## Done when

- `npm run test:e2e` passes locally and in CI, in about five minutes or less.
- No external request passes unmocked; the guard guarantees it.
- `test:e2e` is in `AGENTS.md`'s Commands block and in `docs/how-to/development.md`.

## Not copied from groovemark

- Real network calls (its `favorite-creation.spec.ts` queries YouTube and SoundCloud).
- Brittle selectors (`.timestamp-label`, `locator('..')`, bare `h2`).
- Floating-tag actions and `node-version: 'lts/*'`.
- Three desktop browsers with `workers: 1` on CI.
