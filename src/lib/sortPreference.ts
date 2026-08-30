/**
 * Persists the user's chosen sort criterion and each criterion's own direction across app
 * reloads (R9), independent of the app's existing no-persistence pattern for other transient UI
 * state (e.g. the list/map view toggle).
 *
 * Directions are stored using domain-meaningful labels rather than raw `asc`/`desc`: distance
 * direction is nearest-vs-farthest, date direction is newest-vs-oldest. This keeps the persisted
 * shape self-describing for the comparator and UI component built in other units, and avoids
 * either of them having to remember which raw direction maps to which semantic ordering per
 * criterion.
 *
 * Mirrors src/i18n/config.ts's storage-unavailable precedent (KTD4): any read/write failure, or
 * any unrecognized/malformed value, is treated as absent rather than thrown.
 */

export type SortCriterion = 'distance' | 'date'
export type DistanceDirection = 'nearest' | 'farthest'
export type DateDirection = 'newest' | 'oldest'

export interface SortPreference {
  criterion: SortCriterion
  directions: {
    distance: DistanceDirection
    date: DateDirection
  }
}

const STORAGE_KEY = 'tablemarks:sortPreference'

const SORT_CRITERIA: readonly SortCriterion[] = ['distance', 'date']
const DISTANCE_DIRECTIONS: readonly DistanceDirection[] = ['nearest', 'farthest']
const DATE_DIRECTIONS: readonly DateDirection[] = ['newest', 'oldest']

function isSortPreference(value: unknown): value is SortPreference {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Record<string, unknown>
  if (!SORT_CRITERIA.includes(candidate.criterion as SortCriterion)) return false

  const directions = candidate.directions
  if (typeof directions !== 'object' || directions === null) return false
  const directionsCandidate = directions as Record<string, unknown>

  return (
    DISTANCE_DIRECTIONS.includes(directionsCandidate.distance as DistanceDirection) &&
    DATE_DIRECTIONS.includes(directionsCandidate.date as DateDirection)
  )
}

/**
 * Reads the persisted sort preference. Returns null when nothing is persisted, the stored value
 * is unrecognized/malformed, or `localStorage` throws on read — all treated identically as
 * "absent" (KTD4), letting callers fall back to their own default (nearest-first for Distance,
 * newest-first for Date).
 */
export function readSortPreference(): SortPreference | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (raw === null) return null

    const parsed: unknown = JSON.parse(raw)
    return isSortPreference(parsed) ? parsed : null
  } catch {
    return null
  }
}

/**
 * Persists the given sort preference. No-ops silently (fails for that session only) if
 * `localStorage.setItem` throws, per KTD4.
 */
export function writeSortPreference(preference: SortPreference): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(preference))
  } catch {
    // Storage write failure fails silently, for that session only (R9).
  }
}
