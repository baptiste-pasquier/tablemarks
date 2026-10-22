import { haversineMeters } from '../lib/geo'
import type { OsmSnapshot, Restaurant } from '../types/models'

export interface DedupCandidate {
  lat: number
  lng: number
  mapsUrl?: string
  osm?: Pick<OsmSnapshot, 'type' | 'id'>
}

function sameIdentity(candidate: DedupCandidate, r: Restaurant): boolean {
  const { osm, mapsUrl } = candidate
  if (osm && r.osm?.type === osm.type && r.osm.id === osm.id) return true
  return !!mapsUrl && mapsUrl === r.mapsUrl
}

function isNear(candidate: DedupCandidate, r: Restaurant, radiusM: number): boolean {
  // Two different OSM objects are two places, however close: in a dense street, two restaurants
  // sit well inside 50 m of each other.
  if (candidate.osm && r.osm) return false
  if (r.lat === null || r.lng === null) return false
  return haversineMeters(candidate.lat, candidate.lng, r.lat, r.lng) <= radiusM
}

/**
 * Find an already-saved place matching the candidate: the same OSM object or Maps link anywhere
 * in the list first, then coordinates within the near-match radius (~50 m default) — so a
 * neighbour listed earlier never hides the place itself. Tombstoned records are ignored.
 */
export function findNearMatch(
  candidate: DedupCandidate,
  existing: Restaurant[],
  radiusM = 50,
): Restaurant | null {
  const live = existing.filter((r) => !r.deleted)
  return (
    live.find((r) => sameIdentity(candidate, r)) ??
    live.find((r) => isNear(candidate, r, radiusM)) ??
    null
  )
}
