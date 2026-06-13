import { statusOf, type RestaurantStatus, type Verdict } from '../../types/models'
import type { Restaurant } from '../../types/models'

/** Sentinel cuisine value for the "no cuisine" chip — distinct from any real cuisine name. */
export const UNCATEGORIZED = '__uncategorized__'

/**
 * Selected values per facet. Semantics: AND across facets, OR within a facet.
 * An empty set imposes no constraint (matches every place on that facet).
 */
export interface FacetFilter {
  /** Lowercased cuisine names, plus the `UNCATEGORIZED` sentinel — stored normalized for O(1) matching. */
  cuisines: ReadonlySet<string>
  statuses: ReadonlySet<RestaurantStatus>
  verdicts: ReadonlySet<Verdict>
}

export function emptyFilter(): FacetFilter {
  return { cuisines: new Set(), statuses: new Set(), verdicts: new Set() }
}

export function isEmptyFilter(f: FacetFilter): boolean {
  return f.cuisines.size === 0 && f.statuses.size === 0 && f.verdicts.size === 0
}

/** Place's cuisine reduced to a comparison key: lowercased name, or the uncategorized sentinel. */
function cuisineKey(r: Pick<Restaurant, 'cuisine'>): string {
  const c = r.cuisine?.trim()
  return c ? c.toLowerCase() : UNCATEGORIZED
}

/** Pure facet predicate: AND across facets, OR within each (empty facet = no constraint). */
export function matches(r: Restaurant, f: FacetFilter): boolean {
  // `cuisineKey` and the stored set are both lowercased (UNCATEGORIZED for no cuisine),
  // so an O(1) lookup is correct and case-insensitive without per-call array allocation.
  if (f.cuisines.size > 0 && !f.cuisines.has(cuisineKey(r))) return false
  if (f.statuses.size > 0 && !f.statuses.has(statusOf(r))) return false
  if (f.verdicts.size > 0 && (!r.latestVerdict || !f.verdicts.has(r.latestVerdict))) return false
  return true
}

/** Return a new set with `value` toggled — keeps facet state immutable for React. */
export function withToggled<T>(set: ReadonlySet<T>, value: T): Set<T> {
  const next = new Set(set)
  if (next.has(value)) next.delete(value)
  else next.add(value)
  return next
}
