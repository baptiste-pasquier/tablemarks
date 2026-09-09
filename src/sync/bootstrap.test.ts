import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { freshDB } from '../test/idb'
import { auth } from '../auth/auth'
import { startPendingResolver } from '../capture/resolvePending'
import { createRestaurant } from '../data/restaurants'
import { setGeocodeProvider } from '../capture/geocode'
import { bootstrap } from './bootstrap'
import { backendIsAbsent, backendIsUnreachable, getBackendStatus, setBackendPresence } from './backendStatus'
import { loadRuntimeConfig } from './runtimeConfig'
import { getSyncStatus, setSyncState } from './syncStatus'
import { pb } from './pocketbase'
import { SyncController, type RemoteStore } from './syncEngine'

// Both wrappers keep the real implementation and only make the call observable: the point of
// these tests is what the composition root *wires*, so replacing the wired functions with stubs
// would assert the test's own plumbing instead of the app's.
vi.mock('../capture/resolvePending', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../capture/resolvePending')>()
  return { ...actual, startPendingResolver: vi.fn(actual.startPendingResolver) }
})

vi.mock('./runtimeConfig', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./runtimeConfig')>()
  return { ...actual, loadRuntimeConfig: vi.fn(actual.loadRuntimeConfig) }
})

const CONFIGURED_URL = 'https://pb.example.test'
const SHORT_LINK = 'https://maps.app.goo.gl/abc'

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

interface Routes {
  /** Answer for `config.json`. Defaults to a deployment with no backend. */
  config?: () => Promise<Response>
  /** Answer for the PocketBase health endpoint. Defaults to healthy. Receives the request init
   *  so a route can honour (or deliberately ignore) the caller's abort signal. */
  health?: (init?: RequestInit) => Promise<Response>
}

/**
 * Route `fetch` by URL so one stub serves the two calls a startup legitimately makes — the
 * configuration file and the health check. Anything else rejects *and stays in `mock.calls`*:
 * a leaked backend call has to be visible as a call, not merely as a failure.
 */
function installFetch(routes: Routes = {}) {
  const mock = vi.fn(async (input: unknown, init?: RequestInit): Promise<Response> => {
    const url = String(input)
    if (url.endsWith('config.json')) return routes.config ? routes.config() : json({ pocketbaseUrl: '' })
    if (url.includes('/api/health')) {
      return routes.health ? routes.health(init) : json({ code: 200, message: 'API is healthy.', data: {} })
    }
    throw new TypeError(`Failed to fetch: ${url}`)
  })
  vi.stubGlobal('fetch', mock)
  return mock
}

/** jsdom ships no EventSource; the spy stands in for one so a realtime connect is observable. */
function installEventSource() {
  const ctor = vi.fn()
  class FakeEventSource {
    constructor(url: string) {
      ctor(url)
    }
    addEventListener() {}
    removeEventListener() {}
    close() {}
  }
  vi.stubGlobal('EventSource', FakeEventSource)
  return ctor
}

/**
 * The runner's unhandled-rejection channel. Typed locally rather than through `@types/node`: this
 * is a browser project, and one test needing one Node event is not a reason to put Node's globals
 * in scope for all of `src/`.
 */
interface UnhandledRejectionSource {
  on(event: 'unhandledRejection', listener: (reason: unknown) => void): unknown
  off(event: 'unhandledRejection', listener: (reason: unknown) => void): unknown
}
const runner = (globalThis as { process?: UnhandledRejectionSource }).process

/**
 * A persisted session the SDK accepts as valid, so `auth.resume()` reaches `SyncController.start()`
 * and the realtime connect actually happens. `pb.authStore.isValid` decodes the token and checks
 * `exp`, so a placeholder string will not do — and without a real one the "no realtime connect"
 * assertions below can never fail, which is exactly what a mutation test found them doing.
 */
function seedSignedInSession(): void {
  const b64url = (value: object) =>
    btoa(JSON.stringify(value)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')
  const token = [
    b64url({ alg: 'HS256', typ: 'JWT' }),
    b64url({ id: 'user1', type: 'auth', collectionId: 'users', exp: Math.floor(Date.now() / 1000) + 3600 }),
    'not-verified-client-side',
  ].join('.')
  pb.authStore.save(token, { id: 'user1', email: 'someone@example.test', collectionName: 'users' } as never)
}

/** Backend calls a startup must never make — excludes the configuration file itself. */
function backendCalls(mock: ReturnType<typeof installFetch>): string[] {
  return mock.mock.calls.map((c) => String(c[0])).filter((url) => !url.endsWith('config.json'))
}

let dispose: (() => void) | undefined
const render = vi.fn()

beforeEach(async () => {
  await freshDB()
  render.mockClear()
  vi.mocked(startPendingResolver).mockClear()
  // A baseline that is neither of the two outcomes under test, so every assertion below observes
  // a real transition rather than the value the previous test happened to leave behind.
  setBackendPresence({ status: 'unavailable', reason: 'test baseline' })
  // No test may inherit a session from the one before it: a leaked one would make the
  // "no realtime connect" assertions pass for the wrong reason, and a missing one makes them vacuous.
  pb.authStore.clear()
  setSyncState('synced')
  pb.baseURL = ''
  setGeocodeProvider({ search: async () => [], reverse: async () => 'somewhere' })
})

afterEach(() => {
  dispose?.()
  dispose = undefined
  pb.baseURL = ''
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('bootstrap — no backend configured (R7)', () => {
  it('starts no controllers and makes no backend call', async () => {
    // A record the resolver would act on if it ran: without one, "no call" proves nothing.
    await createRestaurant({ name: SHORT_LINK, mapsUrl: SHORT_LINK, pending: true })
    // And a persisted session, for the same reason: `auth.resume()` returns early when signed out,
    // so without one the realtime assertion below is unreachable in both directions and proves
    // nothing either. Signed-in-with-no-backend is also the state R7 actually has to withstand — a
    // token outliving the deployment that issued it.
    seedSignedInSession()
    const fetchMock = installFetch()
    const eventSource = installEventSource()
    const resume = vi.spyOn(auth, 'resume')

    dispose = await bootstrap(render)

    expect(vi.mocked(startPendingResolver)).not.toHaveBeenCalled()
    expect(resume).not.toHaveBeenCalled()
    expect(backendCalls(fetchMock)).toEqual([])
    expect(eventSource).not.toHaveBeenCalled()
  })

  it('records the deployment as absent, and renders the shell', async () => {
    installFetch()
    installEventSource()

    dispose = await bootstrap(render)

    expect(backendIsAbsent(getBackendStatus())).toBe(true)
    expect(render).toHaveBeenCalledTimes(1)
  })

  it('leaves the resume a no-op that never escalates to a sync problem state', async () => {
    installFetch()
    installEventSource()

    dispose = await bootstrap(render)

    expect(getSyncStatus().state).toBe('synced')
    expect(getSyncStatus().cause).toBeUndefined()
    expect(backendIsUnreachable(getBackendStatus())).toBe(false)
  })
})

describe('bootstrap — backend configured', () => {
  function configured(): Routes {
    return { config: async () => json({ pocketbaseUrl: CONFIGURED_URL }) }
  }

  it('assigns the client base URL before the resume runs', async () => {
    installFetch(configured())
    installEventSource()
    let urlWhenResumed: string | undefined
    vi.spyOn(auth, 'resume').mockImplementation(async () => {
      urlWhenResumed = pb.baseURL
    })

    dispose = await bootstrap(render)

    expect(urlWhenResumed).toBe(CONFIGURED_URL)
  })

  it('runs the resume and the resolver exactly once', async () => {
    installFetch(configured())
    installEventSource()
    const resume = vi.spyOn(auth, 'resume').mockResolvedValue(undefined)

    dispose = await bootstrap(render)

    expect(resume).toHaveBeenCalledTimes(1)
    expect(vi.mocked(startPendingResolver)).toHaveBeenCalledTimes(1)
    expect(render).toHaveBeenCalledTimes(1)
  })

  it('opens the realtime connection for a persisted session (review #14)', async () => {
    // The positive half of the two `expect(eventSource).not.toHaveBeenCalled()` assertions in this
    // file. Without it they were structurally dead: no test ever made pb.authStore valid, so
    // `auth.resume()` returned early and the EventSource path was unreachable in every direction.
    // This proves the spy observes a connect when one is supposed to happen, which is what gives
    // the negative assertions their meaning.
    seedSignedInSession()
    installFetch(configured())
    const eventSource = installEventSource()

    dispose = await bootstrap(render)

    await vi.waitFor(() => expect(eventSource).toHaveBeenCalled())
    expect(eventSource.mock.calls[0][0]).toContain(CONFIGURED_URL)
  })

  it('records the backend as reachable once the health check answers', async () => {
    installFetch(configured())
    installEventSource()
    vi.spyOn(auth, 'resume').mockResolvedValue(undefined)

    dispose = await bootstrap(render)

    await vi.waitFor(() => expect(getBackendStatus().reachability).toBe('reachable'))
    expect(backendIsUnreachable(getBackendStatus())).toBe(false)
  })

  it('records the backend as unreachable — never absent — when the health check fails', async () => {
    installFetch({
      ...configured(),
      health: async () => {
        throw new TypeError('Failed to fetch')
      },
    })
    installEventSource()
    vi.spyOn(auth, 'resume').mockResolvedValue(undefined)

    dispose = await bootstrap(render)

    await vi.waitFor(() => expect(backendIsUnreachable(getBackendStatus())).toBe(true))
    expect(backendIsAbsent(getBackendStatus())).toBe(false)
  })

  it('gives up on a health check that is accepted and never answered (review #17)', async () => {
    // The failure this guards is not a slow answer but no answer at all: fetch waits forever by
    // default, so without the abort the promise stays pending, reachability stays `unknown`, and
    // `unknown` renders no indicator whatsoever (ADR-0002) -- a silent hang, not a visible error.
    installFetch({
      ...configured(),
      health: (init) =>
        new Promise<Response>((_, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
        }),
    })
    installEventSource()
    vi.spyOn(auth, 'resume').mockResolvedValue(undefined)

    dispose = await bootstrap(render, { healthTimeoutMs: 40 })

    expect(getBackendStatus().reachability).toBe('unknown')
    await vi.waitFor(() => expect(getBackendStatus().reachability).toBe('unreachable'))
    // Not absent: the address is known, the server just did not answer.
    expect(backendIsAbsent(getBackendStatus())).toBe(false)
  })

  it('lets the newest health check win when a slow earlier one is still in flight', async () => {
    // Opting out of the SDK's auto-cancellation (needed for the abort above to survive) means two
    // checks can now overlap. The stale one must not land last and pin an out-of-date answer.
    let call = 0
    installFetch({
      ...configured(),
      health: (init) => {
        call += 1
        if (call === 1) {
          // Still hanging when the reconnect fires; aborts later, after the second has answered.
          return new Promise<Response>((_, reject) => {
            init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
          })
        }
        return Promise.resolve(json({ code: 200, message: 'API is healthy.', data: {} }))
      },
    })
    installEventSource()
    vi.spyOn(auth, 'resume').mockResolvedValue(undefined)

    dispose = await bootstrap(render, { healthTimeoutMs: 60 })
    window.dispatchEvent(new Event('online'))

    await vi.waitFor(() => expect(getBackendStatus().reachability).toBe('reachable'))
    // Outlive the first check's abort: without the generation guard its rejection lands here and
    // overwrites the fresher answer.
    await new Promise((resolve) => setTimeout(resolve, 120))
    expect(getBackendStatus().reachability).toBe('reachable')
  })

  it('re-derives reachability when the online-status seam reports a reconnect', async () => {
    let healthy = false
    installFetch({
      ...configured(),
      health: async () => {
        if (!healthy) throw new TypeError('Failed to fetch')
        return json({ code: 200, message: 'API is healthy.', data: {} })
      },
    })
    installEventSource()
    vi.spyOn(auth, 'resume').mockResolvedValue(undefined)

    dispose = await bootstrap(render)
    await vi.waitFor(() => expect(getBackendStatus().reachability).toBe('unreachable'))

    healthy = true
    window.dispatchEvent(new Event('online'))

    await vi.waitFor(() => expect(getBackendStatus().reachability).toBe('reachable'))
  })

  it('stops re-checking reachability once disposed', async () => {
    const fetchMock = installFetch(configured())
    installEventSource()
    vi.spyOn(auth, 'resume').mockResolvedValue(undefined)

    dispose = await bootstrap(render)
    await vi.waitFor(() => expect(getBackendStatus().reachability).toBe('reachable'))
    dispose()
    dispose = undefined
    const afterDispose = fetchMock.mock.calls.length

    window.dispatchEvent(new Event('online'))
    await Promise.resolve()

    expect(fetchMock.mock.calls.length).toBe(afterDispose)
  })
})

describe('bootstrap — configuration that cannot be read (R30)', () => {
  it('reports unreachable, not local-only, when the configuration fetch rejects', async () => {
    installFetch({
      config: async () => {
        throw new TypeError('Failed to fetch')
      },
    })
    installEventSource()

    dispose = await bootstrap(render)

    expect(getBackendStatus().presence.status).toBe('unavailable')
    expect(backendIsUnreachable(getBackendStatus())).toBe(true)
    expect(backendIsAbsent(getBackendStatus())).toBe(false)
  })

  it('reports a sync problem instead of claiming everything is backed up (review #4)', async () => {
    // `syncStatus` initialises to `synced` and no controller starts here, so without the
    // composition root's own write the account menu would read "all synced" while nothing syncs.
    installFetch({
      config: async () => {
        throw new TypeError('Failed to fetch')
      },
    })
    installEventSource()

    dispose = await bootstrap(render)

    expect(getSyncStatus().state).toBe('problem')
    expect(getSyncStatus().cause).toBe('server-unreachable')
  })

  it('has already said so by the time the shell paints', async () => {
    // Ordering, not just outcome: a first paint that claims "all synced" and corrects itself
    // afterwards still shows the reassuring lie, and this is the one claim that must never flash.
    installFetch({
      config: async () => {
        throw new TypeError('Failed to fetch')
      },
    })
    installEventSource()
    const stateAtPaint: string[] = []
    const recordingRender = vi.fn(() => {
      stateAtPaint.push(getSyncStatus().state)
    })

    dispose = await bootstrap(recordingRender)

    expect(stateAtPaint).toEqual(['problem'])
  })

  it('makes no backend call when the address could not be read', async () => {
    await createRestaurant({ name: SHORT_LINK, mapsUrl: SHORT_LINK, pending: true })
    // Signed in, but the address is unknown — nothing may be contacted, least of all a realtime
    // channel against an empty base URL, which resolves against the app's own origin.
    seedSignedInSession()
    const fetchMock = installFetch({
      config: async () => {
        throw new TypeError('Failed to fetch')
      },
    })
    const eventSource = installEventSource()

    dispose = await bootstrap(render)

    expect(backendCalls(fetchMock)).toEqual([])
    expect(eventSource).not.toHaveBeenCalled()
    expect(vi.mocked(startPendingResolver)).not.toHaveBeenCalled()
  })

  it('re-reads the configuration when connectivity returns, and recovers (review #16)', async () => {
    // One failed read used to strand the tab for its whole life: the reconnect retry existed only
    // on the branch where the address was already known -- behind the very state that needs it.
    let configFails = true
    const fetchMock = installFetch({
      config: async () => {
        if (configFails) throw new TypeError('Failed to fetch')
        return json({ pocketbaseUrl: CONFIGURED_URL })
      },
    })
    installEventSource()
    const resume = vi.spyOn(auth, 'resume').mockResolvedValue(undefined)

    dispose = await bootstrap(render, { healthTimeoutMs: 40 })

    expect(getBackendStatus().presence.status).toBe('unavailable')
    expect(resume).not.toHaveBeenCalled()
    expect(backendCalls(fetchMock)).toEqual([])

    configFails = false
    window.dispatchEvent(new Event('online'))

    await vi.waitFor(() => expect(getBackendStatus().presence.status).toBe('configured'))
    // Recovery means the same controllers a normal startup would have started, not merely a
    // corrected label.
    expect(pb.baseURL).toBe(CONFIGURED_URL)
    expect(resume).toHaveBeenCalledTimes(1)
    expect(vi.mocked(startPendingResolver)).toHaveBeenCalledTimes(1)
    // And the sync claim written while the address was unknown is retracted.
    expect(getSyncStatus().state).not.toBe('problem')
  })

  it('recovers only once, however many reconnects arrive', async () => {
    let configFails = true
    installFetch({
      config: async () => {
        if (configFails) throw new TypeError('Failed to fetch')
        return json({ pocketbaseUrl: CONFIGURED_URL })
      },
    })
    installEventSource()
    const resume = vi.spyOn(auth, 'resume').mockResolvedValue(undefined)

    dispose = await bootstrap(render, { healthTimeoutMs: 40 })
    expect(getBackendStatus().presence.status).toBe('unavailable')
    configFails = false

    window.dispatchEvent(new Event('online'))
    await vi.waitFor(() => expect(getBackendStatus().presence.status).toBe('configured'))
    window.dispatchEvent(new Event('online'))
    window.dispatchEvent(new Event('online'))
    await new Promise((resolve) => setTimeout(resolve, 60))

    // A second activation would mean two pending resolvers and two sync controllers on one tab.
    expect(resume).toHaveBeenCalledTimes(1)
    expect(vi.mocked(startPendingResolver)).toHaveBeenCalledTimes(1)
  })

  it('does not retry a deployment that read its configuration and found no backend', async () => {
    // `absent` is an answer, not a failure. Retrying it would poll config.json forever on the demo.
    const fetchMock = installFetch()
    installEventSource()
    const resume = vi.spyOn(auth, 'resume')

    dispose = await bootstrap(render)
    expect(backendIsAbsent(getBackendStatus())).toBe(true)
    const readsBefore = fetchMock.mock.calls.length

    window.dispatchEvent(new Event('online'))
    await new Promise((resolve) => setTimeout(resolve, 40))

    expect(fetchMock.mock.calls.length).toBe(readsBefore)
    expect(resume).not.toHaveBeenCalled()
  })

  it('renders the shell even when configuration resolution throws', async () => {
    installFetch()
    installEventSource()
    // `loadRuntimeConfig` promises never to reject; this asserts the shell survives it doing so.
    vi.mocked(loadRuntimeConfig).mockRejectedValueOnce(new Error('boom'))
    vi.spyOn(console, 'error').mockImplementation(() => {})

    dispose = await bootstrap(render)

    expect(render).toHaveBeenCalledTimes(1)
  })

  it('renders the shell even when a controller start throws synchronously', async () => {
    installFetch({ config: async () => json({ pocketbaseUrl: CONFIGURED_URL }) })
    installEventSource()
    vi.spyOn(auth, 'resume').mockImplementation(() => {
      throw new Error('resume exploded')
    })
    vi.spyOn(console, 'error').mockImplementation(() => {})

    dispose = await bootstrap(render)

    expect(render).toHaveBeenCalledTimes(1)
  })
})

describe('SyncController realtime subscriptions', () => {
  it('does not surface an unhandled rejection when a realtime subscribe fails', async () => {
    // Routine once a configured backend can be unreachable: the realtime connection is the first
    // thing to fail, and `subscribe()` rejects for every caller of `start()`.
    const unhandled = vi.fn()
    expect(runner, 'no unhandled-rejection channel — this test would pass vacuously').toBeDefined()
    runner?.on('unhandledRejection', unhandled)
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const failure = new Error('realtime connection interrupted')
    vi.spyOn(pb.collection('restaurants'), 'subscribe').mockRejectedValue(failure)
    vi.spyOn(pb.collection('visits'), 'subscribe').mockRejectedValue(failure)
    const remote: RemoteStore = {
      listRestaurants: async () => [],
      listVisits: async () => [],
      pushRestaurant: async () => {},
      pushVisit: async () => {},
    }
    const controller = new SyncController()

    try {
      await controller.start(remote)
      await new Promise((resolve) => setTimeout(resolve, 20))
      expect(unhandled).not.toHaveBeenCalled()
    } finally {
      controller.stop()
      runner?.off('unhandledRejection', unhandled)
    }
  })
})
