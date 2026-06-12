import { beforeEach, describe, it, expect, vi } from 'vitest'
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
})
