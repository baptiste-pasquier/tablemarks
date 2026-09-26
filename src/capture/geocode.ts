import { candidateFrom, isEatery, type NominatimRow } from './osmTags'
import i18n from '../i18n/config'
import { foldText } from '../lib/foldText'
import { haversineMeters } from '../lib/geo'
import type { OsmSnapshot, OsmType } from '../types/models'

export interface GeoCandidate {
  name: string
  lat: number
  lng: number
  address?: string
  /** The OpenStreetMap object behind this result. Absent for a row without an OSM identity. */
  osm?: OsmSnapshot
  /** How Nominatim classes the object, `category=type` ("amenity=restaurant", "shop=leather"). */
  osmClass?: string
  /** The raw `cuisine` tag ("falafel;israeli"), read by `suggestCategory`. */
  cuisineTag?: string
}

export interface SearchOptions {
  signal?: AbortSignal
  /** Restrict the search to a small box around this point, to match a known position to OSM. */
  near?: { lat: number; lng: number }
}

export interface GeocodeProvider {
  search(query: string, options?: SearchOptions): Promise<GeoCandidate[]>
  reverse(lat: number, lng: number, signal?: AbortSignal): Promise<string | undefined>
  /** The object as OSM has it now, or null when OSM no longer has it. */
  lookup(type: OsmType, id: number, signal?: AbortSignal): Promise<GeoCandidate | null>
}

// Default provider: Nominatim (OpenStreetMap) — no API key, free. Honor the usage policy
// (max ~1 req/s): every call here follows a user gesture, never a keystroke or a loop.
const NOMINATIM = 'https://nominatim.openstreetmap.org'

/** Half the side of the `near` box, in degrees: ~165 m north–south, ~110 m east–west in Paris. */
const NEAR_BOX_DEG = 0.0015

/** How far a Maps position may sit from its OSM object and still be the same place. */
export const MATCH_RADIUS_M = 75

function detailParams(): string {
  const language = encodeURIComponent(i18n.language || 'en')
  return `format=jsonv2&extratags=1&addressdetails=1&accept-language=${language}`
}

async function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal: signal ?? AbortSignal.timeout(10_000),
  })
  if (!res.ok) throw new Error(`Geocoding request failed (${res.status})`)
  return (await res.json()) as T
}

/**
 * Comparison form for `matchNear` only: `foldText` plus every curly/other apostrophe style folded
 * to a straight one, so "L'As du Fallafel" and "L’As du Fallafel" compare equal. Kept local rather
 * than added to `foldText`, which other categories share and must not change.
 */
function foldName(name: string): string {
  return foldText(name).replace(/[’ʼ‘]/g, "'").replace(/\s+/g, ' ').trim()
}

function viewbox({ lat, lng }: { lat: number; lng: number }): string {
  const d = NEAR_BOX_DEG
  return `${lng - d},${lat + d},${lng + d},${lat - d}`
}

export const nominatim: GeocodeProvider = {
  async search(query, options = {}) {
    let url = `${NOMINATIM}/search?${detailParams()}&limit=10&q=${encodeURIComponent(query)}`
    if (options.near) url += `&bounded=1&viewbox=${viewbox(options.near)}`
    const checkedAt = new Date().toISOString()
    const rows = await getJson<NominatimRow[]>(url, options.signal)
    return rows.map((row) => candidateFrom(row, checkedAt))
  },

  async reverse(lat, lng, signal) {
    const url = `${NOMINATIM}/reverse?format=jsonv2&lat=${lat}&lon=${lng}`
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: signal ?? AbortSignal.timeout(10_000),
    })
    if (!res.ok) return undefined
    const data = (await res.json()) as { display_name?: string }
    return data.display_name
  },

  async lookup(type, id, signal) {
    const ref = `${type[0].toUpperCase()}${id}`
    const rows = await getJson<NominatimRow[]>(
      `${NOMINATIM}/lookup?${detailParams()}&osm_ids=${ref}`,
      signal,
    )
    return rows[0] ? candidateFrom(rows[0], new Date().toISOString()) : null
  },
}

let provider: GeocodeProvider = nominatim

/** Override the geocoding provider (e.g. in tests or to swap to Photon/Geoapify). */
export function setGeocodeProvider(p: GeocodeProvider): void {
  provider = p
}

export function searchPlaces(query: string, signal?: AbortSignal): Promise<GeoCandidate[]> {
  return provider.search(query, { signal })
}

export function reverseGeocode(
  lat: number,
  lng: number,
  signal?: AbortSignal,
): Promise<string | undefined> {
  return provider.reverse(lat, lng, signal)
}

export function lookupOsm(
  type: OsmType,
  id: number,
  signal?: AbortSignal,
): Promise<GeoCandidate | null> {
  return provider.lookup(type, id, signal)
}

/**
 * The OpenStreetMap object a known position and name most likely are: the nearest eatery within
 * `MATCH_RADIUS_M` whose folded name contains the other ("Mokonuts" meets "Mokonuts Cafe and
 * Bakery"). Null when none qualifies. Throws when the request fails, so a caller can tell
 * "nothing there" from "could not ask".
 */
export async function matchNear(
  name: string,
  lat: number,
  lng: number,
  signal?: AbortSignal,
): Promise<GeoCandidate | null> {
  const wanted = foldName(name)
  if (!wanted) return null
  const rows = await provider.search(name, { near: { lat, lng }, signal })
  let best: GeoCandidate | null = null
  let bestDistance = MATCH_RADIUS_M
  for (const c of rows) {
    const got = foldName(c.name)
    if (!c.osm || !isEatery(c) || !got || !(got.includes(wanted) || wanted.includes(got))) continue
    const distance = haversineMeters(lat, lng, c.lat, c.lng)
    if (distance <= bestDistance) {
      best = c
      bestDistance = distance
    }
  }
  return best
}
