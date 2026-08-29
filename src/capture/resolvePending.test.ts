import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest'
import { freshDB } from '../test/idb'
import { setGeocodeProvider } from './geocode'
import { resolvePendingRestaurants } from './resolvePending'
import { createRestaurant, getRestaurant, allRestaurants } from '../data/restaurants'
import { resolveShortLink } from '../sync/pocketbase'

vi.mock('../sync/pocketbase', () => ({
  resolveShortLink: vi.fn(),
}))

const SHORT = 'https://maps.app.goo.gl/abc'

beforeEach(async () => {
  await freshDB()
  vi.mocked(resolveShortLink).mockReset()
  setGeocodeProvider({ search: async () => [], reverse: async () => '1 Rue de Rivoli, Paris' })
})

describe('resolvePendingRestaurants', () => {
  it('fills coordinates and clears pending when the short link now resolves', async () => {
    const r = await createRestaurant({ name: SHORT, mapsUrl: SHORT, pending: true })
    vi.mocked(resolveShortLink).mockResolvedValue({ lat: 48.8566, lng: 2.3522, name: 'Chez Marcel' })

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
