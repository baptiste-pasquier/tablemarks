/**
 * Resolves the PocketBase location at startup from a configuration file served alongside the
 * built assets, so one build deploys to both targets: the private container writes the file at
 * boot, the public demo ships the committed one with an empty URL.
 *
 * Only the bootstrap imports this module — every other consumer reads a synchronous store — so a
 * network dependency stays out of the tests that render the whole app.
 */

import { CONFIG_TIMEOUT_MS } from './configTimeouts'

// Re-exported so this module stays the one import site for configuration reading; the constant
// itself lives next to the service worker's matching deadline, which it is coupled to.
export { CONFIG_TIMEOUT_MS }

/** File name served next to `index.html`. The container entrypoint rewrites it at boot. */
const CONFIG_FILE_NAME = 'config.json'

/** Key the configuration file carries. The container entrypoint writes the same key. */
const POCKETBASE_URL_KEY = 'pocketbaseUrl'

/**
 * Three outcomes, never two. A failed fetch is *not* "no backend configured": collapsing them
 * would make an installed app launched with no network hide sign-in and never recover for the
 * life of that tab.
 */
export type RuntimeConfig =
  /** A backend is configured at this URL. */
  | { readonly status: 'configured'; readonly pocketbaseUrl: string }
  /** The file was read and deliberately declares no backend — a valid state, not an error. */
  | { readonly status: 'absent' }
  /** The configuration could not be read or is not usable. Presence is unknown. */
  | { readonly status: 'unavailable'; readonly reason: string }

export interface LoadRuntimeConfigOptions {
  /** Override the resolution budget. Tests use a short one; production takes the default. */
  timeoutMs?: number
}

/**
 * Path of the configuration file, relative to the app's base URL. A root-absolute path would
 * fetch the Pages 404 page when the demo is served from a repository subpath.
 */
export function runtimeConfigPath(): string {
  const base = import.meta.env.BASE_URL || '/'
  return `${base.endsWith('/') ? base : `${base}/`}${CONFIG_FILE_NAME}`
}

/**
 * Read the runtime configuration. Never rejects, and always settles within `timeoutMs`: a
 * connection that is accepted and then never answers must not leave the page unrendered.
 */
export async function loadRuntimeConfig(options: LoadRuntimeConfigOptions = {}): Promise<RuntimeConfig> {
  const timeoutMs = options.timeoutMs ?? CONFIG_TIMEOUT_MS

  let timer: ReturnType<typeof setTimeout> | undefined
  // A hard bound on top of the abort signal below: the signal cancels the request, but only a
  // race guarantees this promise settles even if the transport ignores the abort.
  const expiry = new Promise<RuntimeConfig>((resolve) => {
    timer = setTimeout(() => resolve(unavailable(`configuration request timed out after ${timeoutMs}ms`)), timeoutMs)
  })

  try {
    return await Promise.race([readConfig(timeoutMs), expiry])
  } finally {
    clearTimeout(timer)
  }
}

/** Fetch and parse. Returns `unavailable` for every failure rather than throwing. */
async function readConfig(timeoutMs: number): Promise<RuntimeConfig> {
  let body: unknown
  try {
    // No `cache` override: HTTP freshness is the server's job (nginx) and the repeat-launch
    // story is the service worker's, so forcing a policy here would fight both.
    const res = await fetch(runtimeConfigPath(), {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(timeoutMs),
    })
    if (!res.ok) return unavailable(`configuration request failed (${res.status})`)
    body = await res.json()
  } catch (err) {
    return unavailable(err instanceof Error ? err.message : 'configuration request failed')
  }
  return interpret(body)
}

function interpret(body: unknown): RuntimeConfig {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return unavailable('configuration body is not a JSON object')
  }
  const raw = (body as Record<string, unknown>)[POCKETBASE_URL_KEY]
  if (typeof raw !== 'string') {
    return unavailable(`configuration is missing a string "${POCKETBASE_URL_KEY}"`)
  }

  const url = raw.trim()
  // An empty URL is a configured state — "this deployment has no backend" — not a missing value.
  if (url === '') return { status: 'absent' }

  const parsed = parseUrl(url)
  if (!parsed) return unavailable(`configured "${POCKETBASE_URL_KEY}" is not a valid URL`)
  if (!isSecureOrLoopback(parsed)) {
    // Treated as a misconfiguration, not as a usable backend: a mistyped `http://` origin would
    // otherwise carry the auth token in the clear.
    return unavailable(`configured "${POCKETBASE_URL_KEY}" must use HTTPS unless it is a loopback address`)
  }

  return { status: 'configured', pocketbaseUrl: url }
}

function parseUrl(url: string): URL | undefined {
  try {
    return new URL(url)
  } catch {
    return undefined
  }
}

/** HTTPS everywhere, with a loopback exemption so local development keeps working over http. */
function isSecureOrLoopback(url: URL): boolean {
  if (url.protocol === 'https:') return true
  if (url.protocol !== 'http:') return false
  const host = url.hostname
  return host === 'localhost' || host === '[::1]' || /^127\.\d+\.\d+\.\d+$/.test(host)
}

function unavailable(reason: string): RuntimeConfig {
  return { status: 'unavailable', reason }
}
