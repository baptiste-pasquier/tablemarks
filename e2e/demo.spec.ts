// The README GIF's journey. In CI it is one more journey, asserted and never captured; with
// `PLAYWRIGHT_DEMO_FRAME_DIR` set (`npm run test:demo`) each step also writes one GIF frame.
import { existsSync } from 'node:fs'
import { mkdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'
import { addBySearch, logVisit, openApp, placeCard, placeDetail, submitQuery } from './app'
import { PLACES } from './osm'

const DEMO_PAUSE_MS = 350
const demoFrameDir = process.env.PLAYWRIGHT_DEMO_FRAME_DIR
// Real OpenStreetMap tiles (© OpenStreetMap contributors, ODbL — the frames keep the attribution)
// for the 5×4 block the map shows at its fixed position and zoom, and Plus Jakarta Sans (SIL OFL,
// licence in `OFL.txt` beside it), so the frames look like the app rather than like the blank tile
// and whatever font the OS has.
const ASSET_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'demo-assets')
const FONT_URL = 'https://fonts.gstatic.com/demo/plus-jakarta-sans-latin.woff2'
const FONT_CSS = `@font-face {
  font-family: 'Plus Jakarta Sans';
  font-weight: 400 800;
  src: url(${FONT_URL}) format('woff2');
}`
const CORS = { 'access-control-allow-origin': '*' }
// A Friday evening: opening hours read "Open until…" in every run, whatever day it is.
const DEMO_START = Date.parse('2026-10-09T19:00:00+02:00')

async function captureFrame(page: Page, fileName: string) {
  if (!demoFrameDir) {
    return
  }

  await mkdir(demoFrameDir, { recursive: true })
  await page.screenshot({
    path: path.join(demoFrameDir, fileName),
  })
}

async function settleFrame(page: Page) {
  // Leaflet animates its pans and fades its tiles in, and modals transition: a short pause gives
  // each frame a stable visual state before the screenshot is written.
  // eslint-disable-next-line playwright/no-wait-for-timeout
  await page.waitForTimeout(DEMO_PAUSE_MS)
}

/**
 * Serves the tiles and the font from `e2e/demo-assets/`. Page routes win over the guard's context
 * route, so only this journey sees them: every other spec keeps the blank tile. Anything not on
 * disk falls back to the guard, and is returned so the test fails on it rather than on a frame
 * with a hole in its map.
 */
async function serveDemoAssets(page: Page): Promise<string[]> {
  const missing: string[] = []
  await page.route('https://tile.openstreetmap.org/**', async (route) => {
    const tile = new URL(route.request().url()).pathname.slice(1)
    const file = path.join(ASSET_DIR, 'tiles', tile)
    if (!existsSync(file)) {
      missing.push(tile)
      return route.fallback()
    }
    return route.fulfill({ body: await readFile(file), contentType: 'image/png', headers: CORS })
  })
  await page.route('https://fonts.googleapis.com/**', (route) =>
    route.fulfill({ body: FONT_CSS, contentType: 'text/css', headers: CORS }),
  )
  await page.route(FONT_URL, async (route) =>
    route.fulfill({
      body: await readFile(path.join(ASSET_DIR, path.basename(FONT_URL))),
      contentType: 'font/woff2',
      headers: CORS,
    }),
  )
  return missing
}

/**
 * Reloads, then waits for every image (the tiles above all) to be drawn. Everything the setup made
 * is in IndexedDB, and the sort in localStorage, so the page comes back the same, but rendered
 * fresh: a page that has opened and closed dialogs repaints the area they covered piecemeal, and
 * its antialiased edges then differ by a shade from one run to the next. The pointer is parked on
 * the header, where it hovers nothing.
 */
async function freshOverview(page: Page, tick: () => Promise<void>) {
  await page.mouse.move(1, 1)
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Tablemarks' })).toBeVisible()
  await page.waitForFunction(() => [...document.images].every((image) => image.complete))
  // Leaflet fades each tile in by `Date.now()`: under the fixed clock a tile stays transparent
  // until the clock moves on.
  await tick()
}

/**
 * Fixes the clock, and returns the step that moves it on by one minute. Never the wall clock: each
 * record gets its own `updated`, and every date and "Open until…" the frames show is the same in
 * every run.
 */
async function startClock(page: Page): Promise<() => Promise<void>> {
  let minute = 0
  const tick = () => page.clock.setFixedTime(DEMO_START + minute++ * 60_000)
  await tick()
  return tick
}

/** The collection the frames show, made without a frame: seven places, four of them visited. */
async function seedCollection(page: Page, tick: () => Promise<void>) {
  await openApp(page)
  // Distance, not the default Date: visits sort by their day, so same-day visits would tie and
  // fall back to the order of their random ids. The position is fixed, and so is this order.
  await page.getByRole('button', { name: 'Distance', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Nearest first' })).toBeVisible()
  for (const place of [
    PLACES.chezMarcel,
    PLACES.leServan,
    PLACES.bellaNotte,
    PLACES.sakura,
    PLACES.boulangerie,
    PLACES.cafeDesArts,
    PLACES.petitZinc,
  ]) {
    await tick()
    await addBySearch(page, place.name)
  }
  for (const [name, verdict] of [
    [PLACES.chezMarcel.name, 'Go back'],
    [PLACES.bellaNotte.name, 'Worth a detour'],
    [PLACES.cafeDesArts.name, 'Go back'],
    [PLACES.petitZinc.name, 'Once was enough'],
  ]) {
    await tick()
    await logVisit(page, name, verdict)
  }
}

test.setTimeout(90_000)

test('records the README demo flow', async ({ page }) => {
  const tick = await startClock(page)
  const missingAssets = await serveDemoAssets(page)

  await seedCollection(page, tick)
  await freshOverview(page, tick)
  await expect(placeCard(page, PLACES.chezMarcel.name)).toContainText('Go back')
  await settleFrame(page)
  await captureFrame(page, '01-list-and-map.png')

  // Second, not last: the map behind it is unchanged, so this frame costs the GIF only the list
  // and the pins — a full map frame costs it about 400 KB.
  const french = page.getByRole('button', { name: 'French', exact: true })
  await french.click()
  await expect(placeCard(page, PLACES.chezMarcel.name)).toBeVisible()
  await expect(placeCard(page, PLACES.leServan.name)).toBeVisible()
  await expect(placeCard(page, PLACES.sakura.name)).toBeHidden()
  await page.mouse.move(1, 1)
  await settleFrame(page)
  await captureFrame(page, '02-category-filter.png')
  await french.click()
  await expect(placeCard(page, PLACES.sakura.name)).toBeVisible()

  // A pasted link resolves to the place with its OpenStreetMap card before anything is saved;
  // the verdict is then logged on that same place, from its detail.
  await tick()
  const { name, lat, lng } = PLACES.napoli
  const link = `https://www.google.com/maps/place/${name.replaceAll(' ', '+')}/@${lat},${lng},17z`
  const add = await submitQuery(page, link)
  await expect(add.getByText('Found on OpenStreetMap')).toBeVisible()
  await expect(add.getByText('Open until 23:00')).toBeVisible()
  await settleFrame(page)
  await captureFrame(page, '03-add-by-link.png')

  // Adding opens the saved place straight on its detail.
  await add.getByRole('button', { name: 'Add', exact: true }).click()
  const detail = await placeDetail(page, name)
  await expect(detail.getByRole('link', { name: 'Call' })).toBeVisible()
  await expect(detail.getByRole('link', { name: 'Website' })).toBeVisible()
  await tick()
  await detail.getByRole('button', { name: 'I’m here now' }).click()
  await expect(detail.getByText('How was it?')).toBeVisible()
  await settleFrame(page)
  await captureFrame(page, '04-verdict.png')

  await detail.getByRole('button', { name: 'Go back', exact: true }).click()
  await expect(detail.getByText('How was it?')).toBeHidden()
  await expect(detail.getByText('No visits yet')).toBeHidden()
  await settleFrame(page)
  await captureFrame(page, '05-visit-logged.png')

  await page.keyboard.press('Escape')
  await expect(detail).toBeHidden()
  await expect(placeCard(page, name)).toContainText('Go back')

  expect(missingAssets, 'requests the demo makes that e2e/demo-assets/ cannot answer').toEqual([])
})
