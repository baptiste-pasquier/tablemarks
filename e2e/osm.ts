// Canned OpenStreetMap replies. Nothing under e2e/ reaches the real Nominatim: a test that depends
// on it fails without a bug, and OSM's usage policy asks test suites not to call it.

export interface Place {
  name: string
  lat: number
  lng: number
  osmId: number
  /** Nominatim's `category=type`; a restaurant when absent. */
  osmClass?: string
  /** The raw `cuisine` tag; `french` when absent. */
  cuisine?: string
  street?: string
  postcode?: string
  /** The enrichment tags the place detail reads: `opening_hours`, `phone`, `website`. */
  hours?: string
  phone?: string
  website?: string
}

/**
 * Every place a spec may search for — more than a kilometre apart, so dedup never merges two. The
 * names, numbers and sites are made up; only the positions are real Paris streets.
 */
export const PLACES = {
  chezMarcel: { name: 'Chez Marcel', lat: 48.8566, lng: 2.3522, osmId: 1001 },
  leServan: { name: 'Le Servan', lat: 48.8625, lng: 2.3811, osmId: 1002 },
  bellaNotte: {
    name: 'Bella Notte',
    lat: 48.8867,
    lng: 2.3431,
    osmId: 1003,
    cuisine: 'italian',
    street: 'Rue des Abbesses',
    postcode: '75018',
  },
  sakura: {
    name: 'Sakura Ramen',
    lat: 48.8656,
    lng: 2.3212,
    osmId: 1004,
    cuisine: 'ramen',
    street: 'Rue Sainte-Anne',
    postcode: '75001',
    hours: 'Mo-Sa 11:30-15:00,18:30-22:30',
    phone: '+33 1 42 00 00 04',
    website: 'https://sakura-ramen.example',
  },
  boulangerie: {
    name: 'Boulangerie du Marché',
    lat: 48.8443,
    lng: 2.3234,
    osmId: 1005,
    osmClass: 'shop=bakery',
    cuisine: '',
    street: 'Rue de la Gaîté',
    postcode: '75014',
  },
  cafeDesArts: {
    name: 'Café des Arts',
    lat: 48.8462,
    lng: 2.3561,
    osmId: 1006,
    osmClass: 'amenity=cafe',
    cuisine: '',
    street: 'Rue Mouffetard',
    postcode: '75005',
  },
  napoli: {
    name: 'Pizzeria Napoli',
    lat: 48.8722,
    lng: 2.361,
    osmId: 1007,
    cuisine: 'pizza',
    street: 'Rue du Faubourg Saint-Martin',
    postcode: '75010',
    hours: 'Mo-Su 12:00-14:30,19:00-23:00',
    phone: '+33 1 42 00 00 07',
    website: 'https://pizzeria-napoli.example',
  },
  petitZinc: {
    name: 'Le Petit Zinc',
    lat: 48.853,
    lng: 2.37,
    osmId: 1008,
    osmClass: 'amenity=bar',
    cuisine: '',
    street: 'Rue de la Roquette',
    postcode: '75011',
  },
} as const satisfies Record<string, Place>

const KNOWN: readonly Place[] = Object.values(PLACES)

/** A `jsonv2` row for an eatery, shaped like what `candidateFrom` reads (`src/capture/osmTags.ts`). */
function eateryRow(p: Place) {
  const [category, type] = (p.osmClass ?? 'amenity=restaurant').split('=')
  const road = p.street ?? "Rue de l'Exemple"
  const postcode = p.postcode ?? '75011'
  const extratags = Object.fromEntries(
    Object.entries({
      cuisine: p.cuisine ?? 'french',
      opening_hours: p.hours,
      phone: p.phone,
      website: p.website,
    }).filter(([, v]) => v),
  )
  return {
    display_name: `${p.name}, 12 ${road}, ${postcode} Paris, France`,
    name: p.name,
    lat: String(p.lat),
    lon: String(p.lng),
    osm_type: 'node',
    osm_id: p.osmId,
    category,
    type,
    address: { house_number: '12', road, postcode, city: 'Paris' },
    extratags,
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
