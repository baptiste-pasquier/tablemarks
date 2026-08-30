import { colorForCuisine } from '../facets/cuisines'
import { matches, type FacetFilter } from '../facets/filter'
import { localDayToInstantRange } from '../../lib/dates'
import type { GeoPoint } from '../../lib/geolocate'
import type { Restaurant, Verdict } from '../../types/models'

export interface MapMarker {
  id: string
  lat: number
  lng: number
  name: string
  /** Always false — `toMarkers` filters out pending restaurants before this point. */
  pending: boolean
  visitCount: number
  latestVerdict: Verdict | null
  cuisine?: string
  /** Marker color from the single cuisine-to-color source (neutral when uncategorized). */
  color: string
  /** True when an active filter excludes this place — still placed, just de-emphasized (R9). */
  dimmed: boolean
}

/** Shared by `toMarkers` and `pickMostRecentRestaurantCenter` — a provisional (pending) record has
 * no coordinates yet. */
function hasResolvedCoordinates(r: Restaurant): r is Restaurant & { lat: number; lng: number } {
  return !r.pending && r.lat !== null && r.lng !== null
}

/**
 * Build map markers from restaurants — only those with resolved coordinates (skips provisional).
 * Non-matching places are kept but flagged `dimmed` so the map stays a stable spatial reference.
 */
export function toMarkers(restaurants: Restaurant[], filter?: FacetFilter): MapMarker[] {
  const markers: MapMarker[] = []
  for (const r of restaurants) {
    if (!hasResolvedCoordinates(r)) continue
    markers.push({
      id: r.id,
      lat: r.lat,
      lng: r.lng,
      name: r.name,
      pending: false,
      visitCount: r.visitCount,
      latestVerdict: r.latestVerdict,
      cuisine: r.cuisine,
      color: colorForCuisine(r.cuisine),
      dimmed: filter ? !matches(r, filter) : false,
    })
  }
  return markers
}

/**
 * Picks the map center for the restaurant most recently added or visited (R2), among restaurants
 * with resolved coordinates (same pending/null-coordinate guard as `toMarkers`), independent of
 * any active list filter (R5). For each candidate the comparison key is the true per-restaurant
 * max of `added` and the instant `latestVisitDate`'s local day ends — not an added-first fallback
 * chain, so a restaurant added long ago but visited today still outranks one merely added today.
 * `latestVisitDate` is a local calendar day (see `today()` in `src/data/visits.ts`), so its end is
 * resolved via `localDayToInstantRange` rather than a fixed UTC end-of-day suffix, which would
 * misrank restaurants for users west of UTC. A candidate with neither field is skipped; ties
 * (expected whenever two candidates share the same `latestVisitDate`) break on the greater
 * `updated` timestamp. Returns null when no candidate has either field (R4).
 */
export function pickMostRecentRestaurantCenter(restaurants: Restaurant[]): GeoPoint | null {
  let bestPoint: GeoPoint | null = null
  let bestKey = ''
  let bestUpdated = ''
  for (const r of restaurants) {
    if (!hasResolvedCoordinates(r)) continue
    // `added: ''` is a deliberate, first-class "absent" state (see `isOptionalTimestamp` in
    // sync/portability/schema.ts) reachable on any restaurant that synced through the PocketBase
    // field retype — treat it the same as `undefined` rather than a real (and always-losing) key.
    const addedKey = r.added || undefined
    const visitKey = r.latestVisitDate ? localDayToInstantRange(r.latestVisitDate).end : undefined
    const key = addedKey && visitKey ? (addedKey > visitKey ? addedKey : visitKey) : (addedKey ?? visitKey)
    if (key === undefined) continue
    if (bestPoint === null || key > bestKey || (key === bestKey && r.updated > bestUpdated)) {
      bestPoint = { lat: r.lat, lng: r.lng }
      bestKey = key
      bestUpdated = r.updated
    }
  }
  return bestPoint
}
