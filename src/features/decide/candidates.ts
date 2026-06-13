import { haversineMeters } from '../../lib/geo'
import type { GeoPoint } from '../../lib/geolocate'
import type { Restaurant } from '../../types/models'

/** A point to measure proximity from (the map center). */
export type Anchor = GeoPoint

export interface Candidate {
  restaurant: Restaurant
  distanceM: number
}

/** A restaurant is a decision candidate when it's to-try (no visits) or a "Go back" favorite. */
function isCandidatePool(r: Restaurant): boolean {
  return r.visitCount === 0 || r.latestVerdict === 'go_back'
}

/**
 * Decision candidates near the anchor: to-try or go-back places with resolved coordinates,
 * within `radiusM`, sorted nearest-first. Provisional / coordinate-less records are excluded.
 */
export function decideCandidates(
  restaurants: Restaurant[],
  anchor: Anchor,
  radiusM: number,
): Candidate[] {
  const out: Candidate[] = []
  for (const r of restaurants) {
    if (r.deleted || r.pending || r.lat === null || r.lng === null) continue
    if (!isCandidatePool(r)) continue
    const distanceM = haversineMeters(anchor.lat, anchor.lng, r.lat, r.lng)
    if (distanceM <= radiusM) out.push({ restaurant: r, distanceM })
  }
  return out.sort((a, b) => a.distanceM - b.distanceM)
}

/** Uniform-random pick from the candidate set; undefined when empty. */
export function pickForMe(candidates: Candidate[]): Candidate | undefined {
  if (candidates.length === 0) return undefined
  return candidates[Math.floor(Math.random() * candidates.length)]
}
