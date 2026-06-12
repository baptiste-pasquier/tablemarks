export interface GeoCandidate {
  name: string
  lat: number
  lng: number
  address?: string
}

export interface GeocodeProvider {
  search(query: string, signal?: AbortSignal): Promise<GeoCandidate[]>
  reverse(lat: number, lng: number, signal?: AbortSignal): Promise<string | undefined>
}

// Default provider: Nominatim (OpenStreetMap) — no API key, free. Honor the usage policy
// (max ~1 req/s; debounce search input). Swap this constant to use Photon/Geoapify instead.
const NOMINATIM = 'https://nominatim.openstreetmap.org'

interface NominatimRow {
  display_name: string
  lat: string
  lon: string
  name?: string
}

export const nominatim: GeocodeProvider = {
  async search(query, signal) {
    const url = `${NOMINATIM}/search?format=jsonv2&limit=5&q=${encodeURIComponent(query)}`
    const res = await fetch(url, { headers: { Accept: 'application/json' }, signal })
    if (!res.ok) throw new Error(`Geocoding search failed (${res.status})`)
    const rows = (await res.json()) as NominatimRow[]
    return rows.map((row) => ({
      name: row.name || row.display_name.split(',')[0],
      lat: parseFloat(row.lat),
      lng: parseFloat(row.lon),
      address: row.display_name,
    }))
  },

  async reverse(lat, lng, signal) {
    const url = `${NOMINATIM}/reverse?format=jsonv2&lat=${lat}&lon=${lng}`
    const res = await fetch(url, { headers: { Accept: 'application/json' }, signal })
    if (!res.ok) return undefined
    const data = (await res.json()) as { display_name?: string }
    return data.display_name
  },
}

let provider: GeocodeProvider = nominatim

/** Override the geocoding provider (e.g. in tests or to swap to Photon/Geoapify). */
export function setGeocodeProvider(p: GeocodeProvider): void {
  provider = p
}

export function searchPlaces(query: string, signal?: AbortSignal): Promise<GeoCandidate[]> {
  return provider.search(query, signal)
}

export function reverseGeocode(lat: number, lng: number, signal?: AbortSignal): Promise<string | undefined> {
  return provider.reverse(lat, lng, signal)
}
