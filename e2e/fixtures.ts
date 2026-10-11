// The one `test` every spec imports. Its `network` fixture is automatic: no spec can opt out of
// the guard, and no spec has to remember it.
import {
  test as base,
  expect,
  type BrowserContext,
  type Page,
  type Route,
  type WebSocketRoute,
} from '@playwright/test'
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

/**
 * The app under test: its own port, whatever loopback spelling the browser uses. Another local
 * service (a PocketBase on 8090, a dev server) is as external as any remote host.
 */
export function isApp(url: URL, app: URL): boolean {
  return LOCAL_HOSTS.has(url.hostname) && url.port === app.port
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
 * One catch-all route per context: the app passes, a mocked host is answered, anything else is
 * recorded and aborted. Recorded, not just aborted — the app swallows some failures
 * (`reverseGeocode(...).catch(() => undefined)`), so an abort alone would go unnoticed.
 */
export async function installNetworkGuard(
  context: BrowserContext,
  baseURL: string | undefined,
): Promise<NetworkLog> {
  if (!baseURL) throw new Error('The network guard needs `use.baseURL` to know the app’s origin')
  const app = new URL(baseURL)
  const log: NetworkLog = { mocked: [], violations: [] }
  await context.route('**/*', async (route) => {
    const url = new URL(route.request().url())
    if (isApp(url, app)) return route.continue()
    const mock = mockFor(url)
    if (mock) {
      log.mocked.push(url.href)
      return route.fulfill(mock)
    }
    log.violations.push(url.href)
    return route.abort('blockedbyclient')
  })
  // `context.route` above never sees a WebSocket upgrade (it only intercepts HTTP requests), so
  // without this a `new WebSocket('wss://…')` to an unmocked host would slip past the guard
  // entirely. The app's own origin is let through to the real server; anything else is recorded
  // exactly like an unmocked fetch. Without `connectToServer()` Playwright mocks the socket as
  // open, so it is closed at once: the page sees a refused connection, as `abort` gives HTTP.
  await context.routeWebSocket(/.*/, async (ws: WebSocketRoute) => {
    const url = new URL(ws.url())
    if (isApp(url, app)) {
      ws.connectToServer()
      return
    }
    log.violations.push(url.href)
    await ws.close({ code: 1008, reason: 'Blocked by the E2E network guard' })
  })
  return log
}

export const test = base.extend<{ network: NetworkLog; freshPage: Page }>({
  network: [
    async ({ context, baseURL }, use) => {
      const log = await installNetworkGuard(context, baseURL)
      await use(log)
      expect(log.violations, 'requests to unmocked external hosts').toEqual([])
    },
    { auto: true },
  ],
  // A second, empty browser context (export in one, import in the other). Inside a test,
  // `browser.newContext()` takes the project's `use` options — device, locale, baseURL,
  // geolocation — so this page differs from `page` only by its storage. Same guard, same teardown
  // check: a guard that could be forgotten on a second context would guarantee nothing.
  freshPage: async ({ browser, baseURL }, use) => {
    const context = await browser.newContext()
    const log = await installNetworkGuard(context, baseURL)
    await use(await context.newPage())
    await context.close()
    expect(log.violations, 'requests to unmocked external hosts (fresh context)').toEqual([])
  },
})

export { expect }
