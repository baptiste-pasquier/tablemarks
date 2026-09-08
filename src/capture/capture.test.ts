import { beforeEach, describe, it, expect, vi } from 'vitest'
import { freshDB } from '../test/idb'
import { setGeocodeProvider } from './geocode'
import { capturePaste } from './capture'
import { allRestaurants } from '../data/restaurants'
import { resolveShortLink } from '../sync/pocketbase'
import { setBackendPresence } from '../sync/backendStatus'

vi.mock('../sync/pocketbase', () => ({
  resolveShortLink: vi.fn(),
}))

const FULL_URL = 'https://www.google.com/maps/place/Chez+Marcel/@48.8566,2.3522,15z'
const SHORT_URL = 'https://maps.app.goo.gl/abc'

// Presence comes from the real store (KTD10: capture reads the synchronous store, never the
// fetching module), so each test states the deployment it is describing rather than inheriting
// the pre-bootstrap default.
function backendConfigured(): void {
  setBackendPresence({ status: 'configured', pocketbaseUrl: 'https://pb.example.test' })
}

beforeEach(async () => {
  await freshDB()
  vi.mocked(resolveShortLink).mockReset()
  backendConfigured()
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
    const res = await capturePaste(SHORT_URL)
    expect(res.status).toBe('created')
    if (res.status !== 'created') return
    expect(res.restaurant.name).toBe('Madrid spot')
    expect(res.restaurant.lat).toBe(40)
  })

  it('saves a provisional record when a configured backend cannot resolve a short link (offline)', async () => {
    vi.mocked(resolveShortLink).mockRejectedValue(new Error('offline'))
    const res = await capturePaste(SHORT_URL)
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

  describe('with no backend in this deployment (R5)', () => {
    beforeEach(() => {
      setBackendPresence({ status: 'absent' })
    })

    it('refuses a short link and creates no record', async () => {
      const res = await capturePaste(SHORT_URL)
      expect(res).toEqual({ status: 'needs-backend', link: SHORT_URL })
      expect(await allRestaurants()).toEqual([])
      expect(resolveShortLink).not.toHaveBeenCalled()
    })

    it('still creates a place from a full URL with coordinates — it never needed the backend', async () => {
      const res = await capturePaste(FULL_URL)
      expect(res.status).toBe('created')
      expect((await allRestaurants()).length).toBe(1)
    })

    it('still routes plain text to search', async () => {
      const res = await capturePaste('Chez Marcel Paris')
      expect(res).toEqual({ status: 'needs-search', query: 'Chez Marcel Paris' })
    })
  })

  describe('with a backend whose address could not be read', () => {
    beforeEach(() => {
      setBackendPresence({ status: 'unavailable', reason: 'config fetch failed' })
    })

    // There is no address to call, so a provisional record here would never resolve either.
    it('refuses a short link and creates no record', async () => {
      const res = await capturePaste(SHORT_URL)
      expect(res).toEqual({ status: 'needs-backend', link: SHORT_URL })
      expect(await allRestaurants()).toEqual([])
      expect(resolveShortLink).not.toHaveBeenCalled()
    })

    it('still creates a place from a full URL with coordinates', async () => {
      const res = await capturePaste(FULL_URL)
      expect(res.status).toBe('created')
    })

    it('still routes plain text to search', async () => {
      const res = await capturePaste('Chez Marcel Paris')
      expect(res).toEqual({ status: 'needs-search', query: 'Chez Marcel Paris' })
    })
  })
})
