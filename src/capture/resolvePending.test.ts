import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest'
import { freshDB } from '../test/idb'
import { setGeocodeProvider } from './geocode'
import { resolvePendingRestaurants, startPendingResolver } from './resolvePending'
import { createRestaurant, getRestaurant, allRestaurants } from '../data/restaurants'
import { UnresolvableShortLink, resolveShortLink } from '../sync/pocketbase'

/**
 * `authStore.onChange` is a real subscriber list, not a bare `vi.fn()`: the sign-in trigger below
 * has to be *invoked* to be tested, and a stub that swallows the callback would let the trigger be
 * deleted without a failure.
 */
const authListeners = new Set<() => void>()
const emitAuthChange = () => authListeners.forEach((fn) => fn())

vi.mock('../sync/pocketbase', async (importOriginal) => {
  // The real error class, for the same reason as in capture.test.ts: `instanceof` is the branch.
  const actual = await importOriginal<typeof import('../sync/pocketbase')>()
  return {
    UnresolvableShortLink: actual.UnresolvableShortLink,
    resolveShortLink: vi.fn(),
    pb: {
      authStore: {
        onChange: (cb: () => void) => {
          authListeners.add(cb)
          return () => authListeners.delete(cb)
        },
      },
    },
  }
})

const SHORT = 'https://maps.app.goo.gl/abc'

beforeEach(async () => {
  await freshDB()
  authListeners.clear()
  vi.mocked(resolveShortLink).mockReset()
  setGeocodeProvider({
    search: async () => [],
    reverse: async () => '1 Rue de Rivoli, Paris',
    lookup: async () => null,
  })
})

describe('resolvePendingRestaurants', () => {
  it('fills coordinates and clears pending when the short link now resolves', async () => {
    const r = await createRestaurant({ name: SHORT, mapsUrl: SHORT, pending: true })
    vi.mocked(resolveShortLink).mockResolvedValue({
      lat: 48.8566,
      lng: 2.3522,
      name: 'Chez Marcel',
    })

    const count = await resolvePendingRestaurants()

    expect(count).toBe(1)
    const after = await getRestaurant(r.id)
    expect(after?.pending).toBe(false)
    expect(after?.lat).toBeCloseTo(48.8566)
    expect(after?.name).toBe('Chez Marcel') // placeholder (raw link) replaced
    expect(after?.address).toBe('1 Rue de Rivoli, Paris')
  })

  it('leaves the record pending when it still cannot resolve', async () => {
    const r = await createRestaurant({ name: SHORT, mapsUrl: SHORT, pending: true })
    vi.mocked(resolveShortLink).mockRejectedValue(new Error('offline'))

    const count = await resolvePendingRestaurants()

    expect(count).toBe(0)
    expect((await getRestaurant(r.id))?.pending).toBe(true)
  })

  it('ignores already-resolved records', async () => {
    await createRestaurant({ name: 'Resolved', lat: 1, lng: 1 })
    await resolvePendingRestaurants()
    expect(vi.mocked(resolveShortLink)).not.toHaveBeenCalled()
    expect((await allRestaurants())[0].pending).toBe(false)
  })

  describe('retry backoff', () => {
    // Fake only `Date` — real timers stay in place so IndexedDB's internal
    // scheduling (fake-indexeddb / idb) keeps working; we just need to control
    // what `Date.now()` reports to the backoff gate.
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['Date'] })
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('does not re-attempt a failed record on a reconnect that fires within its backoff window', async () => {
      await createRestaurant({ name: SHORT, mapsUrl: SHORT, pending: true })
      vi.mocked(resolveShortLink).mockRejectedValue(new Error('offline'))

      const first = await resolvePendingRestaurants()
      expect(first).toBe(0)
      expect(vi.mocked(resolveShortLink)).toHaveBeenCalledTimes(1)

      // Fires again immediately (e.g. a flappy online event) — well within the backoff window.
      const second = await resolvePendingRestaurants()
      expect(second).toBe(0)
      expect(vi.mocked(resolveShortLink)).toHaveBeenCalledTimes(1)
    })

    it('re-attempts a failed record once its backoff window has elapsed', async () => {
      const r = await createRestaurant({ name: SHORT, mapsUrl: SHORT, pending: true })
      vi.mocked(resolveShortLink).mockRejectedValueOnce(new Error('offline'))

      const first = await resolvePendingRestaurants()
      expect(first).toBe(0)
      expect(vi.mocked(resolveShortLink)).toHaveBeenCalledTimes(1)

      // Advance past the first backoff delay (base 5s per nextRetryDelayMs).
      vi.setSystemTime(Date.now() + 5_000)
      vi.mocked(resolveShortLink).mockResolvedValue({ lat: 1, lng: 2, name: 'Chez Marcel' })

      const second = await resolvePendingRestaurants()
      expect(second).toBe(1)
      expect(vi.mocked(resolveShortLink)).toHaveBeenCalledTimes(2)
      expect((await getRestaurant(r.id))?.pending).toBe(false)
    })
  })
})

describe('a record the resolver has ruled on', () => {
  it('is not retried again, unlike one that merely failed', async () => {
    // A backoff says "later". A verdict says "never" — and this record was retried on every
    // startup, reconnect and sign-in to be told the same thing.
    await createRestaurant({ name: SHORT, mapsUrl: SHORT, pending: true })
    vi.mocked(resolveShortLink).mockRejectedValue(new UnresolvableShortLink(422))

    expect(await resolvePendingRestaurants()).toBe(0)
    expect(vi.mocked(resolveShortLink)).toHaveBeenCalledTimes(1)

    // Past any backoff window a transient failure would have earned. Without advancing the clock
    // this test cannot tell "gave up" from "waiting 5s", and would pass either way.
    vi.useFakeTimers({ toFake: ['Date'] })
    try {
      vi.setSystemTime(Date.now() + 60_000)
      expect(await resolvePendingRestaurants()).toBe(0)
      expect(vi.mocked(resolveShortLink)).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('stays visibly provisional rather than being deleted', async () => {
    const r = await createRestaurant({ name: SHORT, mapsUrl: SHORT, pending: true })
    vi.mocked(resolveShortLink).mockRejectedValue(new UnresolvableShortLink(400))

    await resolvePendingRestaurants()

    expect((await getRestaurant(r.id))?.pending).toBe(true)
  })
})

describe('startPendingResolver', () => {
  it('retries a provisional record when the sign-in state changes', async () => {
    // The resolver hook requires auth, so a link pasted while signed out is refused and saved
    // provisional. Signing in is what unblocks it -- and must not wait for the next page load.
    const r = await createRestaurant({ name: SHORT, mapsUrl: SHORT, pending: true })
    vi.mocked(resolveShortLink).mockRejectedValueOnce(new Error('401'))

    const stop = startPendingResolver()
    await vi.waitFor(() => expect(vi.mocked(resolveShortLink)).toHaveBeenCalledTimes(1))
    expect((await getRestaurant(r.id))?.pending).toBe(true)

    vi.mocked(resolveShortLink).mockResolvedValue({
      lat: 48.8566,
      lng: 2.3522,
      name: 'Chez Marcel',
    })
    emitAuthChange()

    await vi.waitFor(async () => expect((await getRestaurant(r.id))?.pending).toBe(false))
    expect((await getRestaurant(r.id))?.lat).toBe(48.8566)
    stop()
  })

  it('stops listening for sign-in changes after teardown', async () => {
    vi.mocked(resolveShortLink).mockResolvedValue({ lat: 1, lng: 2 })
    const stop = startPendingResolver()
    expect(authListeners.size).toBe(1)
    stop()
    expect(authListeners.size).toBe(0)
  })
})
