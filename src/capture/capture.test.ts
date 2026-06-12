import { beforeEach, describe, it, expect, vi } from 'vitest'
import { freshDB } from '../test/idb'
import { setGeocodeProvider } from './geocode'
import { capturePaste } from './capture'
import { allRestaurants } from '../data/restaurants'
import { resolveShortLink } from '../sync/pocketbase'

vi.mock('../sync/pocketbase', () => ({
  resolveShortLink: vi.fn(),
}))

const FULL_URL = 'https://www.google.com/maps/place/Chez+Marcel/@48.8566,2.3522,15z'

beforeEach(async () => {
  await freshDB()
  vi.mocked(resolveShortLink).mockReset()
  setGeocodeProvider({
    search: async () => [],
    reverse: async () => '1 Rue de Rivoli, Paris',
  })
})

describe('capturePaste', () => {
  it('creates a pinned record from a full URL with reverse-geocoded address', async () => {
    const res = await capturePaste(FULL_URL)
    expect(res.status).toBe('created')
    if (res.status !== 'created') return
    expect(res.restaurant.name).toBe('Chez Marcel')
    expect(res.restaurant.lat).toBeCloseTo(48.8566)
    expect(res.restaurant.address).toBe('1 Rue de Rivoli, Paris')
    expect(res.restaurant.pending).toBe(false)
  })

  it('resolves a short link server-side when online', async () => {
    vi.mocked(resolveShortLink).mockResolvedValue({ lat: 40, lng: -3, name: 'Madrid spot' })
    const res = await capturePaste('https://maps.app.goo.gl/abc')
    expect(res.status).toBe('created')
    if (res.status !== 'created') return
    expect(res.restaurant.name).toBe('Madrid spot')
    expect(res.restaurant.lat).toBe(40)
  })

  it('saves a provisional record when a short link cannot resolve (offline)', async () => {
    vi.mocked(resolveShortLink).mockRejectedValue(new Error('offline'))
    const res = await capturePaste('https://maps.app.goo.gl/abc')
    expect(res.status).toBe('provisional')
    if (res.status !== 'provisional') return
    expect(res.restaurant.pending).toBe(true)
    expect(res.restaurant.lat).toBeNull()
  })

  it('routes plain text to search', async () => {
    const res = await capturePaste('Chez Marcel Paris')
    expect(res).toEqual({ status: 'needs-search', query: 'Chez Marcel Paris' })
  })

  it('flags a duplicate when the same place is captured twice', async () => {
    await capturePaste(FULL_URL)
    const res = await capturePaste(FULL_URL)
    expect(res.status).toBe('duplicate')
    expect((await allRestaurants()).length).toBe(1)
  })
})
