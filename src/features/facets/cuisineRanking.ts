import { CUISINE_CATALOG, resolveCuisine } from './cuisineCatalog'

/** One category as a surface lists it. */
export interface RankedCuisine {
  /** Identity and filter key: the curated key, or a custom name's normalized form. */
  key: string
  /** What a pick stores: the curated key, or the custom name as first seen. */
  value: string
  /** Display label in the current language. */
  label: string
  /** Places carrying it; 0 for an unused curated category. */
  count: number
}

/**
 * Categories ordered by how many places carry them, ties broken on the label in `locale`.
 * With `includeUnused`, curated categories no place carries follow, alphabetically.
 */
export function rankCuisines(
  restaurants: ReadonlyArray<{ cuisine?: string | null }>,
  labelOf: (value: string) => string,
  locale: string,
  includeUnused: boolean,
): RankedCuisine[] {
  const byKey = new Map<string, RankedCuisine>()
  for (const r of restaurants) {
    const resolved = resolveCuisine(r.cuisine)
    if (!resolved) continue
    const entry = byKey.get(resolved.key)
    if (entry) {
      entry.count++
      continue
    }
    const value = resolved.kind === 'curated' ? resolved.key : resolved.label
    byKey.set(resolved.key, { key: resolved.key, value, label: labelOf(value), count: 1 })
  }
  const byLabel = (a: RankedCuisine, b: RankedCuisine) => a.label.localeCompare(b.label, locale)
  const used = [...byKey.values()].sort((a, b) => b.count - a.count || byLabel(a, b))
  if (!includeUnused) return used
  const unused = CUISINE_CATALOG.filter((e) => !byKey.has(e.key))
    .map((e) => ({ key: e.key, value: e.key, label: labelOf(e.key), count: 0 }))
    .sort(byLabel)
  return [...used, ...unused]
}

/**
 * Splits a ranked list into the collapsed row and what "show more" reveals. The row is the top
 * `size`, but a pinned (selected) entry is never hidden: it bumps the lowest-ranked unpinned
 * entry, or the row grows when more are pinned than fit. Rank order is kept on both sides.
 */
export function splitRows<T extends { key: string }>(
  ranked: readonly T[],
  pinned: ReadonlySet<string>,
  size: number,
): { visible: T[]; overflow: T[] } {
  const isPinned = (item: T) => pinned.has(item.key)
  const pinnedRanked = ranked.filter(isPinned)
  const shown = new Set(ranked.slice(0, size))
  if (pinnedRanked.length > size) {
    shown.clear()
    for (const item of pinnedRanked) shown.add(item)
  } else {
    for (const item of pinnedRanked) {
      if (shown.has(item)) continue
      for (let i = ranked.length - 1; i >= 0; i--) {
        const candidate = ranked[i]
        if (shown.has(candidate) && !isPinned(candidate)) {
          shown.delete(candidate)
          break
        }
      }
      shown.add(item)
    }
  }
  return {
    visible: ranked.filter((item) => shown.has(item)),
    overflow: ranked.filter((item) => !shown.has(item)),
  }
}
