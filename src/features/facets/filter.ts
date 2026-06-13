import { statusOf, type RestaurantStatus, type Verdict } from '../../types/models'
import type { Restaurant } from '../../types/models'

/** Sentinel cuisine value for the "no cuisine" chip — distinct from any real cuisine name. */
export const UNCATEGORIZED = '__uncategorized__'

/**
 * Selected values per facet. Semantics: AND across facets, OR within a facet.
 * An empty set imposes no constraint (matches every place on that facet).
 */
export interface FacetFilter {
  /** Cuisine names as displayed, plus the `UNCATEGORIZED` sentinel; matched case-insensitively. */
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
  if (f.cuisines.size > 0) {
    const key = cuisineKey(r)
    const hit = [...f.cuisines].some((c) =>
      c === UNCATEGORIZED ? key === UNCATEGORIZED : c.toLowerCase() === key,
    )
    if (!hit) return false
  }
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
