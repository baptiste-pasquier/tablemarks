import { parseMapsUrl } from './parseMapsUrl'
import { reverseGeocode, type GeoCandidate } from './geocode'
import { findNearMatch } from './dedup'
import { resolveShortLink } from '../sync/pocketbase'
import { allRestaurants, createRestaurant } from '../data/restaurants'
import type { Restaurant } from '../types/models'

export type CaptureResult =
  | { status: 'created'; restaurant: Restaurant }
  | { status: 'provisional'; restaurant: Restaurant }
  | { status: 'duplicate'; match: Restaurant }
  | { status: 'needs-search'; query: string }

interface ResolvedPlace {
  lat: number
  lng: number
  name?: string
  mapsUrl?: string
}

async function finalize(place: ResolvedPlace): Promise<CaptureResult> {
  const existing = await allRestaurants()
  const match = findNearMatch({ lat: place.lat, lng: place.lng, mapsUrl: place.mapsUrl }, existing)
  if (match) return { status: 'duplicate', match }

  const address = await reverseGeocode(place.lat, place.lng).catch(() => undefined)
  const restaurant = await createRestaurant({
    name: place.name ?? address?.split(',')[0] ?? 'New place',
    lat: place.lat,
    lng: place.lng,
    address,
    mapsUrl: place.mapsUrl,
  })
  return { status: 'created', restaurant }
}

/** Capture from pasted text: full URL parses locally, short links resolve server-side (provisional if offline), plain text routes to search. */
export async function capturePaste(input: string): Promise<CaptureResult> {
  const text = input.trim()
  const parsed = parseMapsUrl(text)

  if (parsed.kind === 'none') return { status: 'needs-search', query: text }

  if (parsed.kind === 'short') {
    try {
      const resolved = await resolveShortLink(text)
      return finalize({ lat: resolved.lat, lng: resolved.lng, name: resolved.name, mapsUrl: text })
    } catch {
      // Offline or unresolvable: save a provisional record; it resolves when connectivity returns.
      const restaurant = await createRestaurant({ name: text, mapsUrl: text, pending: true })
      return { status: 'provisional', restaurant }
    }
  }

  return finalize({ lat: parsed.lat!, lng: parsed.lng!, name: parsed.name, mapsUrl: text })
}

/** Capture from a chosen geocoding-search candidate. */
export async function captureSearchPick(candidate: GeoCandidate): Promise<CaptureResult> {
  return finalize({
    lat: candidate.lat,
    lng: candidate.lng,
    name: candidate.name,
    mapsUrl: undefined,
  })
}
