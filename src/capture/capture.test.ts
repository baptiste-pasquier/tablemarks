import { beforeEach, describe, it, expect, vi } from 'vitest'
import { freshDB } from '../test/idb'
import { setGeocodeProvider } from './geocode'
import { capturePaste } from './capture'
import { allRestaurants } from '../data/restaurants'
import { UnresolvableShortLink, resolveShortLink } from '../sync/pocketbase'
import { setBackendPresence } from '../sync/backendStatus'

vi.mock('../sync/pocketbase', async (importOriginal) => {
  // The real error class, not a stand-in: capture.ts branches on `instanceof`, so a local
  // look-alike would make the permanent-refusal path untestable and silently dead.
  const actual = await importOriginal<typeof import('../sync/pocketbase')>()
  return { UnresolvableShortLink: actual.UnresolvableShortLink, resolveShortLink: vi.fn() }
})

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

  it('refuses a link the resolver ruled on, instead of saving a record that never resolves', async () => {
    // 400 and 422 are verdicts on the URL, not failures to reach the server. Saving a provisional
    // record for one leaves a placeholder named by the raw link, retried on every startup,
    // reconnect and sign-in, resolving never.
    vi.mocked(resolveShortLink).mockRejectedValue(new UnresolvableShortLink(400))

    const res = await capturePaste(SHORT_URL)

    expect(res).toEqual({ status: 'link-unresolvable', link: SHORT_URL })
    expect(await allRestaurants()).toEqual([])
  })

  it('refuses a Maps link it cannot use, instead of searching for the URL text (review #6)', async () => {
    // A legacy goo.gl link went to name search, where Nominatim looked for the literal URL and
    // found nothing: the user got "No matching places found" and no hint of the real reason. The
    // copy that explains it — and names the two ways through — could never be reached.
    const legacy = 'https://goo.gl/maps/abc123'

    const res = await capturePaste(legacy)

    expect(res).toEqual({ status: 'link-unresolvable', link: legacy })
    expect(await allRestaurants()).toEqual([])
    expect(resolveShortLink).not.toHaveBeenCalled()
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

    // `reason` is what lets the caller say "this deployment has no server" rather than "the server
    // is down" — a permanent property here, and the copy sends the user to the alternatives for good.
    it('refuses a short link and creates no record, saying the backend is absent', async () => {
      const res = await capturePaste(SHORT_URL)
      expect(res).toEqual({ status: 'needs-backend', link: SHORT_URL, reason: 'absent' })
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

    // There is no address to call, so a provisional record here would never resolve either. But the
    // reason is NOT `absent`: this deployment does have a server, and the header is already saying
    // it is unreachable — telling the user the app runs without one would contradict that.
    it('refuses a short link and creates no record, saying the backend is unreachable', async () => {
      const res = await capturePaste(SHORT_URL)
      expect(res).toEqual({ status: 'needs-backend', link: SHORT_URL, reason: 'unavailable' })
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
