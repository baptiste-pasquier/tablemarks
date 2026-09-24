import { statusOf, type RestaurantStatus, type Verdict } from '../../types/models'
import type { Restaurant } from '../../types/models'
import { resolveCuisine } from './cuisineCatalog'

/** Sentinel cuisine value for the "no cuisine" chip — distinct from any real cuisine name. */
export const UNCATEGORIZED = '__uncategorized__'

/**
 * Selected values per facet. Semantics: AND across facets, OR within a facet.
 * An empty set imposes no constraint (matches every place on that facet).
 */
export interface FacetFilter {
  /** Category keys (see resolveCuisine), plus the UNCATEGORIZED sentinel — normalized for O(1) matching. */
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

/** Total number of active selections across all facets — drives the mobile "Filtres · N" pill badge. */
export function activeFilterCount(f: FacetFilter): number {
  return f.cuisines.size + f.statuses.size + f.verdicts.size
}

/** A place's category as a filter key: its resolved key, or the uncategorized sentinel. */
function cuisineKey(r: Pick<Restaurant, 'cuisine'>): string {
  return resolveCuisine(r.cuisine)?.key ?? UNCATEGORIZED
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
