import { haversineMeters } from '../lib/geo'
import type { Restaurant } from '../types/models'

export interface DedupCandidate {
  lat: number
  lng: number
  mapsUrl?: string
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
