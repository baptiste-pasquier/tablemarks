import type { GeoCandidate } from './geocode'
import type { OsmSnapshot, OsmType } from '../types/models'

/** One row of Nominatim's `jsonv2` reply, requested with `addressdetails=1&extratags=1`. */
export interface NominatimRow {
  display_name: string
  lat: string
  lon: string
  name?: string
  osm_type?: string
  osm_id?: number
  category?: string
  type?: string
  address?: Record<string, string>
  extratags?: Record<string, string> | null
}

/** The kinds of place this app saves: exactly the families of the category catalog. */
const EATERY_CLASSES: ReadonlySet<string> = new Set([
  'amenity=restaurant',
  'amenity=fast_food',
  'amenity=cafe',
  'amenity=bar',
  'amenity=pub',
  'amenity=ice_cream',
  'amenity=food_court',
  'shop=bakery',
  'shop=pastry',
])

export function isEatery(candidate: Pick<GeoCandidate, 'osmClass'>): boolean {
  return candidate.osmClass !== undefined && EATERY_CLASSES.has(candidate.osmClass)
}

function asOsmType(value: string | undefined): OsmType | undefined {
  return value === 'node' || value === 'way' || value === 'relation' ? value : undefined
}

/** Drops the keys whose value is undefined, so a record carries only what OSM had. */
function compact<T extends object>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T
}

/** OSM separates multiple values with `;` (never `,`, which some phone formats use); keep the first. */
function firstValue(value: string | undefined): string | undefined {
  return value?.split(';')[0].trim()
}

function snapshotFrom(row: NominatimRow, checkedAt: string): OsmSnapshot | undefined {
  const type = asOsmType(row.osm_type)
  if (!type || row.osm_id === undefined) return undefined
  const a = row.address ?? {}
  const tags = row.extratags ?? {}
  const street = [a.house_number, a.road].filter(Boolean).join(' ')
  return compact({
    type,
    id: row.osm_id,
    checkedAt,
    street: street || undefined,
    postcode: a.postcode,
    city: a.city ?? a.town ?? a.village ?? a.municipality,
    suburb: a.suburb,
    quarter: a.city_block ?? a.quarter ?? a.neighbourhood,
    openingHours: tags.opening_hours,
    phone: firstValue(tags.phone ?? tags['contact:phone']),
    website: firstValue(tags.website ?? tags['contact:website']),
  })
}

/** A Nominatim row as a candidate, with its snapshot stamped `checkedAt`. */
export function candidateFrom(row: NominatimRow, checkedAt: string): GeoCandidate {
  return compact({
    name: row.name || row.display_name.split(',')[0],
    lat: parseFloat(row.lat),
    lng: parseFloat(row.lon),
    address: row.display_name,
    osm: snapshotFrom(row, checkedAt),
    osmClass: row.category && row.type ? `${row.category}=${row.type}` : undefined,
    cuisineTag: row.extratags?.cuisine,
  })
}
