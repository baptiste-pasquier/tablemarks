// Canned OpenStreetMap replies. Nothing under e2e/ reaches the real Nominatim: a test that depends
// on it fails without a bug, and OSM's usage policy asks test suites not to call it.

export interface Place {
  name: string
  lat: number
  lng: number
  osmId: number
}

/** Every place a spec may search for — more than a kilometre apart, so dedup never merges two. */
export const PLACES = {
  chezMarcel: { name: 'Chez Marcel', lat: 48.8566, lng: 2.3522, osmId: 1001 },
  leServan: { name: 'Le Servan', lat: 48.8625, lng: 2.3811, osmId: 1002 },
} as const satisfies Record<string, Place>

const KNOWN: readonly Place[] = Object.values(PLACES)

/** A `jsonv2` row for an eatery, shaped like what `candidateFrom` reads (`src/capture/osmTags.ts`). */
function eateryRow(p: Place) {
  return {
    display_name: `${p.name}, 12 Rue de l'Exemple, 75011 Paris, France`,
    name: p.name,
    lat: String(p.lat),
    lon: String(p.lng),
    osm_type: 'node',
    osm_id: p.osmId,
    category: 'amenity',
    type: 'restaurant',
    address: { house_number: '12', road: "Rue de l'Exemple", postcode: '75011', city: 'Paris' },
    extratags: { cuisine: 'french' },
  }
}

/** A non-eatery row, so a name search also exercises the "other results" filtering. */
function streetRow(p: Place) {
  return {
    display_name: `Passage ${p.name}, Paris, France`,
    name: `Passage ${p.name}`,
    lat: String(p.lat + 0.01),
    lon: String(p.lng),
    osm_type: 'way',
    osm_id: p.osmId + 5000,
    category: 'highway',
    type: 'residential',
  }
}

/**
 * Nominatim's reply for a request URL, or `undefined` for an endpoint nothing mocks (the guard then
 * counts it as a violation). `/search` with `bounded=1` is `matchNear` checking a pasted link's
 * position: it answers with the eatery alone, at the place's own coordinates.
 */
export function nominatimReply(url: URL): unknown {
  const place = KNOWN.find((p) => p.name === url.searchParams.get('q'))
  switch (url.pathname) {
    case '/search':
      if (!place) return []
      return url.searchParams.get('bounded') === '1'
        ? [eateryRow(place)]
        : [eateryRow(place), streetRow(place)]
    case '/reverse':
      return { display_name: "12 Rue de l'Exemple, 75011 Paris, France" }
    case '/lookup': {
      const id = Number(url.searchParams.get('osm_ids')?.slice(1))
      const found = KNOWN.find((p) => p.osmId === id)
      return found ? [eateryRow(found)] : []
    }
    default:
      return undefined
  }
}
