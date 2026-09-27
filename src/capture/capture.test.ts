import { beforeEach, describe, it, expect, vi } from 'vitest'
import { freshDB } from '../test/idb'
import { setGeocodeProvider, type GeoCandidate } from './geocode'
import {
  capturePaste,
  commitCapture,
  draftFromCandidate,
  withoutMatch,
  type PlaceDraft,
} from './capture'
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
const SERVAN_OSM = {
  type: 'node' as const,
  id: 1,
  checkedAt: '2026-09-26T10:00:00.000Z',
  city: 'Paris',
}

// Presence comes from the real store (KTD10: capture reads the synchronous store, never the
// fetching module), so each test states the deployment it is describing rather than inheriting
// the pre-bootstrap default.
function backendConfigured(): void {
  setBackendPresence({ status: 'configured', pocketbaseUrl: 'https://pb.example.test' })
}

function provider(near: GeoCandidate[] = []) {
  setGeocodeProvider({
    search: async (_q, options) => (options?.near ? near : []),
    reverse: async () => '1 Rue de Rivoli, Paris',
    lookup: async () => null,
  })
}

beforeEach(async () => {
  await freshDB()
  vi.mocked(resolveShortLink).mockReset()
  backendConfigured()
  provider()
})

describe('capturePaste', () => {
  async function draftOf(input: string): Promise<PlaceDraft> {
    const res = await capturePaste(input)
    if (res.status !== 'preview') throw new Error(`expected a preview, got ${res.status}`)
    return res.draft
  }

  it('previews a full URL without saving it', async () => {
    const draft = await draftOf(FULL_URL)
    expect(draft).toMatchObject({
      name: 'Chez Marcel',
      pending: false,
      address: '1 Rue de Rivoli, Paris',
    })
    expect(draft.lat).toBeCloseTo(48.8566)
    expect(draft.match).toBeUndefined()
    expect(await allRestaurants()).toEqual([])
  })

  it('attaches the OSM object found near the link, and takes its address', async () => {
    provider([
      {
        name: 'Chez Marcel',
        lat: 48.8567,
        lng: 2.3522,
        osmClass: 'amenity=restaurant',
        osm: SERVAN_OSM,
        address: 'Chez Marcel, 3 Rue X, Paris',
      },
    ])
    const draft = await draftOf(FULL_URL)
    expect(draft.match?.osm).toEqual(SERVAN_OSM)
    expect(draft.address).toBe('Chez Marcel, 3 Rue X, Paris')
  })

  it('says when the match could not be asked, and still previews', async () => {
    setGeocodeProvider({
      search: async () => {
        throw new Error('down')
      },
      reverse: async () => undefined,
      lookup: async () => null,
    })
    expect(await draftOf(FULL_URL)).toMatchObject({ matchFailed: true, match: undefined })
  })

  it('commits a preview with its category and snapshot', async () => {
    provider([
      {
        name: 'Chez Marcel',
        lat: 48.8567,
        lng: 2.3522,
        osmClass: 'amenity=restaurant',
        osm: SERVAN_OSM,
      },
    ])
    const res = await commitCapture(await draftOf(FULL_URL), 'french')
    expect(res.status).toBe('created')
    if (res.status !== 'created') return
    expect(res.restaurant).toMatchObject({
      name: 'Chez Marcel',
      cuisine: 'french',
      osm: SERVAN_OSM,
      pending: false,
    })
  })

  it('reverse-geocodes on commit once the match is refused', async () => {
    provider([
      {
        name: 'Chez Marcel',
        lat: 48.8567,
        lng: 2.3522,
        osmClass: 'amenity=restaurant',
        osm: SERVAN_OSM,
        address: 'OSM address',
      },
    ])
    const res = await commitCapture(withoutMatch(await draftOf(FULL_URL)))
    if (res.status !== 'created') throw new Error(res.status)
    expect(res.restaurant.osm).toBeUndefined()
    expect(res.restaurant.address).toBe('1 Rue de Rivoli, Paris')
  })

  it('resolves a short link server-side into a preview', async () => {
    vi.mocked(resolveShortLink).mockResolvedValue({ lat: 40, lng: -3, name: 'Madrid spot' })
    expect(await draftOf(SHORT_URL)).toMatchObject({
      name: 'Madrid spot',
      lat: 40,
      mapsUrl: SHORT_URL,
    })
  })

  it('previews then saves a provisional record when a configured backend cannot resolve a short link', async () => {
    vi.mocked(resolveShortLink).mockRejectedValue(new Error('offline'))
    const draft = await draftOf(SHORT_URL)
    expect(draft).toMatchObject({ pending: true, lat: null, name: SHORT_URL })
    expect(await allRestaurants()).toEqual([])
    const res = await commitCapture(draft, 'pizza')
    if (res.status !== 'created') throw new Error(res.status)
    expect(res.restaurant).toMatchObject({
      pending: true,
      lat: null,
      cuisine: 'pizza',
      mapsUrl: SHORT_URL,
    })
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

  it('flags a duplicate at preview when the same place was saved', async () => {
    await commitCapture(await draftOf(FULL_URL))
    expect((await capturePaste(FULL_URL)).status).toBe('duplicate')
    expect((await allRestaurants()).length).toBe(1)
  })

  it('flags a duplicate at commit for a search pick of an already-saved OSM object', async () => {
    const candidate = {
      name: 'Chez Marcel',
      lat: 10,
      lng: 10,
      osmClass: 'amenity=restaurant',
      osm: SERVAN_OSM,
    }
    await commitCapture(draftFromCandidate(candidate))
    const again = await commitCapture(draftFromCandidate({ ...candidate, lat: 11 }))
    expect(again.status).toBe('duplicate')
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

    it('still previews a full URL with coordinates — it never needed the backend', async () => {
      const res = await capturePaste(FULL_URL)
      expect(res.status).toBe('preview')
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

    it('still previews a full URL with coordinates', async () => {
      const res = await capturePaste(FULL_URL)
      expect(res.status).toBe('preview')
    })

    it('still routes plain text to search', async () => {
      const res = await capturePaste('Chez Marcel Paris')
      expect(res).toEqual({ status: 'needs-search', query: 'Chez Marcel Paris' })
    })
  })
})

describe('draftFromCandidate', () => {
  const STREET: GeoCandidate = {
    name: 'Rue de Rivoli',
    lat: 48.8566,
    lng: 2.3522,
    osmClass: 'highway=residential',
    osm: SERVAN_OSM,
  }

  const EATERY: GeoCandidate = {
    name: 'Chez Marcel',
    lat: 48.8566,
    lng: 2.3522,
    osmClass: 'amenity=restaurant',
    osm: SERVAN_OSM,
  }

  // review #2: picking a street or address from "N other results" used to store the street's own
  // OSM snapshot — "Correct"/"Refresh" then targeted the street, and "Complete" never came back.
  it('drops the OSM snapshot of a non-eatery result', () => {
    expect(draftFromCandidate(STREET).match).toBeUndefined()
  })

  it('keeps the OSM snapshot of an eatery result', () => {
    expect(draftFromCandidate(EATERY).match).toEqual(EATERY)
  })
})
