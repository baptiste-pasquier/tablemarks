import { describe, it, expect, vi, afterEach } from 'vitest'
import { lookupOsm, matchNear, nominatim, setGeocodeProvider, type GeoCandidate } from './geocode'

afterEach(() => {
  vi.unstubAllGlobals()
  setGeocodeProvider(nominatim)
})

function stubFetch(body: unknown, ok = true) {
  const fetchMock = vi.fn(async (_url: string) => ({
    ok,
    status: ok ? 200 : 503,
    json: async () => body,
  }))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function calledUrl(fetchMock: ReturnType<typeof stubFetch>): URL {
  return new URL(fetchMock.mock.calls[0][0])
}

describe('nominatim provider', () => {
  it('maps search rows to candidates', async () => {
    stubFetch([
      {
        display_name: 'Chez Marcel, Paris, France',
        name: 'Chez Marcel',
        lat: '48.8566',
        lon: '2.3522',
      },
    ])
    const out = await nominatim.search('chez marcel')
    expect(out).toEqual([
      { name: 'Chez Marcel', lat: 48.8566, lng: 2.3522, address: 'Chez Marcel, Paris, France' },
    ])
  })

  it('asks for ten rows with tags, address parts and the app language', async () => {
    const fetchMock = stubFetch([])
    await nominatim.search('septime')
    const url = calledUrl(fetchMock)
    expect(url.pathname).toBe('/search')
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      q: 'septime',
      limit: '10',
      format: 'jsonv2',
      extratags: '1',
      addressdetails: '1',
      'accept-language': 'en',
    })
    expect(url.searchParams.has('viewbox')).toBe(false)
  })

  it('bounds a near search to a small box around the point', async () => {
    const fetchMock = stubFetch([])
    await nominatim.search('le servan', { near: { lat: 48.86, lng: 2.38 } })
    const url = calledUrl(fetchMock)
    expect(url.searchParams.get('bounded')).toBe('1')
    const [left, top, right, bottom] = url.searchParams.get('viewbox')!.split(',').map(Number)
    expect(left).toBeCloseTo(2.3785)
    expect(top).toBeCloseTo(48.8615)
    expect(right).toBeCloseTo(2.3815)
    expect(bottom).toBeCloseTo(48.8585)
  })

  it('throws when search fails', async () => {
    stubFetch(null, false)
    await expect(nominatim.search('x')).rejects.toThrow(/failed/i)
  })

  it('looks an object up by type and id', async () => {
    const fetchMock = stubFetch([
      { osm_type: 'way', osm_id: 42, display_name: 'X, Lyon', name: 'X', lat: '45', lon: '4.8' },
    ])
    const found = await nominatim.lookup('way', 42)
    expect(calledUrl(fetchMock).searchParams.get('osm_ids')).toBe('W42')
    expect(found?.osm).toMatchObject({ type: 'way', id: 42 })
  })

  it('reads an empty lookup as an object gone from OSM', async () => {
    stubFetch([])
    expect(await nominatim.lookup('node', 1)).toBeNull()
  })

  it('returns a display name for reverse geocoding', async () => {
    stubFetch({ display_name: '1 Rue de Rivoli, Paris' })
    expect(await nominatim.reverse(48.85, 2.35)).toBe('1 Rue de Rivoli, Paris')
  })
})

describe('matchNear', () => {
  const HERE = { lat: 48.8586, lng: 2.38 }

  function candidate(over: Partial<GeoCandidate>): GeoCandidate {
    return {
      name: 'Le Servan',
      lat: HERE.lat,
      lng: HERE.lng,
      osmClass: 'amenity=restaurant',
      osm: { type: 'node', id: 1, checkedAt: '2026-09-26T10:00:00.000Z' },
      ...over,
    }
  }

  function provide(rows: GeoCandidate[]) {
    const search = vi.fn(async () => rows)
    setGeocodeProvider({ search, reverse: async () => undefined, lookup: async () => null })
    return search
  }

  it('searches near the point and keeps the nearest eatery with the same name', async () => {
    const search = provide([
      candidate({ lat: HERE.lat + 0.0005, osm: { type: 'node', id: 2, checkedAt: 'x' } }),
      candidate({ lat: HERE.lat + 0.0002 }),
    ])
    const found = await matchNear('le servan', HERE.lat, HERE.lng)
    expect(search).toHaveBeenCalledWith('le servan', { near: HERE, signal: undefined })
    expect(found?.osm?.id).toBe(1)
  })

  it('matches a name that contains the other once folded', async () => {
    provide([candidate({ name: 'Mokonuts Cafe and Bakery', osmClass: 'shop=pastry' })])
    expect(await matchNear('Mokonuts', HERE.lat, HERE.lng)).not.toBeNull()
  })

  it('matches a name across apostrophe styles, in either direction', async () => {
    provide([candidate({ name: 'L’As du Fallafel' })])
    expect(await matchNear("L'As du Fallafel", HERE.lat, HERE.lng)).not.toBeNull()

    provide([candidate({ name: "L'As du Fallafel" })])
    expect(await matchNear('L’As du Fallafel', HERE.lat, HERE.lng)).not.toBeNull()
  })

  it.each([
    ['a non-eatery', { osmClass: 'shop=leather' }],
    ['a place past 75 m', { lat: HERE.lat + 0.001 }],
    ['another name', { name: 'Double Dragon' }],
    ['a row without an OSM identity', { osm: undefined }],
  ])('ignores %s', async (_label, over) => {
    provide([candidate(over)])
    expect(await matchNear('Le Servan', HERE.lat, HERE.lng)).toBeNull()
  })

  it('does not search for an empty name', async () => {
    const search = provide([candidate({})])
    expect(await matchNear('  ', HERE.lat, HERE.lng)).toBeNull()
    expect(search).not.toHaveBeenCalled()
  })

  it('passes lookups through to the provider', async () => {
    const lookup = vi.fn(async () => null)
    setGeocodeProvider({ search: async () => [], reverse: async () => undefined, lookup })
    await lookupOsm('relation', 9)
    expect(lookup).toHaveBeenCalledWith('relation', 9, undefined)
  })
})
