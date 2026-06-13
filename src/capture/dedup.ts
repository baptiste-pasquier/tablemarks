import type { Restaurant } from '../types/models'

export interface DedupCandidate {
  lat: number
  lng: number
  mapsUrl?: string
}

const EARTH_RADIUS_M = 6_371_000

export function haversineMeters(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(bLat - aLat)
  const dLng = toRad(bLng - aLng)
  const lat1 = toRad(aLat)
  const lat2 = toRad(bLat)
  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2)
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h))
}

/**
 * Find an already-saved place matching the candidate: same Maps link, or coordinates within
 * the near-match radius (~50 m default). Tombstoned records are ignored.
 */
export function findNearMatch(
  candidate: DedupCandidate,
  existing: Restaurant[],
  radiusM = 50,
): Restaurant | null {
  for (const r of existing) {
    if (r.deleted) continue
    if (candidate.mapsUrl && r.mapsUrl && candidate.mapsUrl === r.mapsUrl) return r
    if (r.lat !== null && r.lng !== null) {
      if (haversineMeters(candidate.lat, candidate.lng, r.lat, r.lng) <= radiusM) return r
    }
  }
  return null
}
