import { haversineMeters } from '../../lib/geo'
import { localDayToInstantRange } from '../../lib/dates'
import type { GeoPoint } from '../../lib/geolocate'
import { hasResolvedCoordinates, type Restaurant } from '../../types/models'
import type { SortCriterion, SortDirection } from '../../lib/sortPreference'

/**
 * Epoch ms this restaurant orders by under the date rule (R7): `added` when never visited,
 * otherwise `latestVisitDate`. `-Infinity` (the oldest possible value) when neither is usable —
 * absent, or an unparsable string (R8).
 */
function dateKey(r: Pick<Restaurant, 'added' | 'latestVisitDate' | 'visitCount'>): number {
  if (r.visitCount === 0) {
    if (!r.added) return Number.NEGATIVE_INFINITY
    const ms = Date.parse(r.added)
    return Number.isNaN(ms) ? Number.NEGATIVE_INFINITY : ms
  }
  if (!r.latestVisitDate) return Number.NEGATIVE_INFINITY
  // `latestVisitDate` is a local calendar day (YYYY-MM-DD), not a full instant — resolved via
  // `localDayToInstantRange` rather than a raw `Date.parse`, which treats a date-only string as
  // UTC midnight and would misrank restaurants for users west of UTC (same fix already applied in
  // `pickMostRecentRestaurantCenter`, markers.ts).
  const ms = Date.parse(localDayToInstantRange(r.latestVisitDate).start)
  return Number.isNaN(ms) ? Number.NEGATIVE_INFINITY : ms
}

/**
 * New array sorted by a precomputed numeric key, ascending or descending. Ties keep their
 * original relative order (KTD6) via `Array.prototype.sort`'s spec-guaranteed stability
 * (ES2019+). Never mutates `items`.
 */
function stableSortByKey<T>(items: readonly T[], key: (item: T) => number, ascending: boolean): T[] {
  return items
    .map((item) => ({ item, key: key(item) }))
    .sort((a, b) => (ascending ? a.key - b.key : b.key - a.key))
    .map((entry) => entry.item)
}

/** Sort by the date rule (R7/R8): `ascending` true = oldest-first, false = most-recent-first. */
function sortByDateKey(items: readonly Restaurant[], ascending: boolean): Restaurant[] {
  return stableSortByKey(items, dateKey, ascending)
}

/** Splits `items` into those with and without resolved coordinates, in one pass (R6). */
function partitionByCoordinates(items: readonly Restaurant[]): {
  withCoords: (Restaurant & { lat: number; lng: number })[]
  withoutCoords: Restaurant[]
} {
  const withCoords: (Restaurant & { lat: number; lng: number })[] = []
  const withoutCoords: Restaurant[] = []
  for (const r of items) {
    if (hasResolvedCoordinates(r)) withCoords.push(r)
    else withoutCoords.push(r)
  }
  return { withCoords, withoutCoords }
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
    const { withCoords, withoutCoords } = partitionByCoordinates(items)
    const sortedByDistance = stableSortByKey(
      withCoords,
      (r) => haversineMeters(position.lat, position.lng, r.lat, r.lng),
      direction === 'nearest',
    )
    // R6 + resolved decision: the trailing block is always most-recent-first internally,
    // independent of the active Distance direction — only the block above it flips.
    const trailing = sortByDateKey(withoutCoords, false)
    return [...sortedByDistance, ...trailing]
  }
  return sortByDateKey(items, direction === 'oldest')
}
