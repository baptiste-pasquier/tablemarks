import { haversineMeters } from '../../lib/geo'
import type { GeoPoint } from '../../lib/geolocate'
import type { Restaurant } from '../../types/models'

/** Which rule orders the (already facet-filtered, R11) restaurant list. */
export type SortCriterion = 'distance' | 'date'

/** Direction under the Distance rule (R5). */
export type DistanceDirection = 'nearest-first' | 'farthest-first'

/** Direction under the Date rule (R7), and within the Distance rule's trailing block (R6). */
export type DateDirection = 'most-recent-first' | 'oldest-first'

export type SortDirection = DistanceDirection | DateDirection

/** True once a restaurant's coordinates have resolved — false for provisional records (R6). */
function hasResolvedCoordinates(r: Restaurant): r is Restaurant & { lat: number; lng: number } {
  return r.lat !== null && r.lng !== null
}

/**
 * Epoch ms this restaurant orders by under the date rule (R7): `added` when never visited,
 * otherwise `latestVisitDate`. `-Infinity` (the oldest possible value) when neither is usable —
 * absent, or an unparsable string (R8).
 */
function dateKey(r: Pick<Restaurant, 'added' | 'latestVisitDate' | 'visitCount'>): number {
  const raw = r.visitCount === 0 ? r.added : r.latestVisitDate
  if (!raw) return Number.NEGATIVE_INFINITY
  const ms = Date.parse(raw)
  return Number.isNaN(ms) ? Number.NEGATIVE_INFINITY : ms
}

/**
 * New array sorted by a precomputed numeric key, ascending or descending. Ties keep their
 * original relative order (KTD6) via an explicit index tie-break, rather than relying on engine
 * sort stability. Never mutates `items`.
 */
function stableSortByKey<T>(items: readonly T[], key: (item: T) => number, ascending: boolean): T[] {
  return items
    .map((item, index) => ({ item, key: key(item), index }))
    .sort((a, b) => (ascending ? a.key - b.key : b.key - a.key) || a.index - b.index)
    .map((entry) => entry.item)
}

/** Sort by the date rule (R7/R8): `ascending` true = oldest-first, false = most-recent-first. */
function sortByDateKey(items: readonly Restaurant[], ascending: boolean): Restaurant[] {
  return stableSortByKey(items, dateKey, ascending)
}

/**
 * Order the already-filtered restaurant list (R11) per the active criterion and direction.
 *
 * Under Distance, when `position` is known: restaurants with resolved coordinates are ordered by
 * straight-line distance (R5); restaurants without them can't be placed by distance, so they
 * trail as a single block ordered among themselves by the date rule, always most-recent-first
 * regardless of the active Distance direction (R6, resolved decision). Without a known position,
 * or under Date, every restaurant is ordered by the date rule (R7/R8).
 *
 * Returns a new array; never mutates `items`.
 */
export function sortRestaurants(
  items: readonly Restaurant[],
  criterion: SortCriterion,
  direction: SortDirection,
  position: GeoPoint | null | undefined,
): Restaurant[] {
  if (criterion === 'distance' && position) {
    const withCoords = items.filter(hasResolvedCoordinates)
    const withoutCoords = items.filter((r) => !hasResolvedCoordinates(r))
    const sortedByDistance = stableSortByKey(
      withCoords,
      (r) => haversineMeters(position.lat, position.lng, r.lat, r.lng),
      direction === 'nearest-first',
    )
    // R6 + resolved decision: the trailing block is always most-recent-first internally,
    // independent of the active Distance direction — only the block above it flips.
    const trailing = sortByDateKey(withoutCoords, false)
    return [...sortedByDistance, ...trailing]
  }
  return sortByDateKey(items, direction === 'oldest-first')
}
