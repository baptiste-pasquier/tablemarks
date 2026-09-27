import { haversineMeters } from '../lib/geo'
import type { OsmSnapshot, Restaurant } from '../types/models'

export interface DedupCandidate {
  lat: number
  lng: number
  mapsUrl?: string
  osm?: Pick<OsmSnapshot, 'type' | 'id'>
}

/**
 * Find an already-saved place matching the candidate: the same OSM object, the same Maps link,
 * or coordinates within the near-match radius (~50 m default). Tombstoned records are ignored.
 */
export function findNearMatch(
  candidate: DedupCandidate,
  existing: Restaurant[],
  radiusM = 50,
): Restaurant | null {
  for (const r of existing) {
    if (r.deleted) continue
    if (candidate.osm && r.osm?.type === candidate.osm.type && r.osm.id === candidate.osm.id)
      return r
    if (candidate.mapsUrl && r.mapsUrl && candidate.mapsUrl === r.mapsUrl) return r
    if (r.lat !== null && r.lng !== null) {
      if (haversineMeters(candidate.lat, candidate.lng, r.lat, r.lng) <= radiusM) return r
    }
  }
  return null
}
