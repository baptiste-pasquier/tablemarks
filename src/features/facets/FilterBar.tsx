import { useMemo, useState } from 'react'
import {
  VERDICTS,
  VERDICT_LABELS,
  VERDICT_ICON,
  STATUS_LABELS,
  type RestaurantStatus,
  type Restaurant,
} from '../../types/models'
import { colorForCuisine, emojiForCuisine } from './cuisines'
import { emptyFilter, isEmptyFilter, withToggled, UNCATEGORIZED, type FacetFilter } from './filter'

const DEFAULT_CUISINE_ROW_SIZE = 6
const CUISINE_GROUP_ID = 'filter-cuisine-group'

function Chip({
  label,
  active,
  color,
  icon,
  onClick,
}: {
  label: string
  active: boolean
  color?: string
  icon?: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex min-h-10 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition ${
        active
          ? 'border-brand bg-brand-soft font-semibold text-brand-strong shadow-sm'
          : 'border-gray-300 text-gray-600 hover:border-gray-400 hover:bg-gray-50'
      }`}
    >
      {color && (
        <span aria-hidden="true" className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: color }} />
      )}
      {icon && <span aria-hidden="true">{icon}</span>}
      {label}
    </button>
  )
}

function GroupLabel({ children }: { children: string }) {
  return <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">{children}</span>
}

/** Distinct cuisines actually in use, ranked by restaurant count (desc), alphabetical tie-break. */
function rankedCuisines(restaurants: Restaurant[]): string[] {
  const byKey = new Map<string, { label: string; count: number }>()
  for (const r of restaurants) {
    const c = r.cuisine?.trim()
    if (!c) continue
    const key = c.toLowerCase()
    const entry = byKey.get(key)
    if (entry) entry.count++
    else byKey.set(key, { label: c, count: 1 })
  }
  return [...byKey.values()]
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .map((e) => e.label)
}

/**
 * Split ranked cuisines into the default (collapsed) row and the overflow revealed by "+N autres"
 * (R1, R2, KTD4). The default row is the top 6 by rank, but any cuisine currently active in the
 * filter is pinned into it — bumping the least-used non-active entry when 6 or fewer cuisines are
 * active, or growing the row past 6 when more than 6 are active — so an active filter is never
 * hidden behind the overflow toggle. Recomputed from the current filter on every render, so
 * deselecting a pinned cuisine reflows the row immediately.
 */
function splitCuisineRows(
  ranked: string[],
  activeCuisineKeys: ReadonlySet<string>,
): { visible: string[]; overflow: string[] } {
  const isActive = (name: string) => activeCuisineKeys.has(name.toLowerCase())
  const activeRanked = ranked.filter(isActive)

  const defaultSet = new Set(ranked.slice(0, DEFAULT_CUISINE_ROW_SIZE))
  if (activeRanked.length > DEFAULT_CUISINE_ROW_SIZE) {
    defaultSet.clear()
    for (const name of activeRanked) defaultSet.add(name)
  } else {
    for (const active of activeRanked) {
      if (defaultSet.has(active)) continue
      for (let i = ranked.length - 1; i >= 0; i--) {
        const candidate = ranked[i]
        if (defaultSet.has(candidate) && !isActive(candidate)) {
          defaultSet.delete(candidate)
          break
        }
      }
      defaultSet.add(active)
    }
  }

  return {
    visible: ranked.filter((c) => defaultSet.has(c)),
    overflow: ranked.filter((c) => !defaultSet.has(c)),
  }
}

/** Clearable facet chips for cuisine / status / verdict. The shell owns the filter state. */
export function FilterBar({
  restaurants,
  filter,
  onChange,
}: {
  restaurants: Restaurant[]
  filter: FacetFilter
  onChange: (filter: FacetFilter) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const ranked = useMemo(() => rankedCuisines(restaurants), [restaurants])
  const hasUncategorized = useMemo(() => restaurants.some((r) => !r.cuisine?.trim()), [restaurants])
  const { visible, overflow } = useMemo(() => splitCuisineRows(ranked, filter.cuisines), [ranked, filter.cuisines])
  const shownCuisines = expanded ? ranked : visible

  if (restaurants.length === 0) return null

  return (
    <div className="space-y-2 border-b border-gray-100 p-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">Filter</span>
        {!isEmptyFilter(filter) && (
          <button type="button" onClick={() => onChange(emptyFilter())} className="text-xs text-brand hover:underline">
            Clear all
          </button>
        )}
      </div>

      {(ranked.length > 0 || hasUncategorized) && (
        <div>
          <GroupLabel>Cuisine</GroupLabel>
          <div id={CUISINE_GROUP_ID} className="mt-1 flex flex-wrap gap-1.5">
            {shownCuisines.map((c) => (
              <Chip
                key={c}
                label={c}
                color={colorForCuisine(c)}
                icon={emojiForCuisine(c)}
                active={filter.cuisines.has(c.toLowerCase())}
                onClick={() => onChange({ ...filter, cuisines: withToggled(filter.cuisines, c.toLowerCase()) })}
              />
            ))}
            {hasUncategorized && (
              <Chip
                label="Uncategorized"
                color={colorForCuisine(undefined)}
                icon={emojiForCuisine(undefined)}
                active={filter.cuisines.has(UNCATEGORIZED)}
                onClick={() => onChange({ ...filter, cuisines: withToggled(filter.cuisines, UNCATEGORIZED) })}
              />
            )}
            {overflow.length > 0 && (
              <button
                type="button"
                aria-expanded={expanded}
                aria-controls={CUISINE_GROUP_ID}
                onClick={() => setExpanded((e) => !e)}
                className="inline-flex min-h-10 items-center rounded-full border border-dashed border-gray-300 px-3 py-1.5 text-xs text-gray-500 transition hover:border-gray-400 hover:bg-gray-50"
              >
                {expanded ? 'Réduire' : `+${overflow.length} autres`}
              </button>
            )}
          </div>
        </div>
      )}

      <div className="space-y-1 border-t border-gray-100 pt-2">
        <GroupLabel>Statut &amp; verdict</GroupLabel>
        <div className="flex flex-wrap gap-1.5">
          {(['to_try', 'visited'] as RestaurantStatus[]).map((s) => (
            <Chip
              key={s}
              label={STATUS_LABELS[s]}
              active={filter.statuses.has(s)}
              onClick={() => onChange({ ...filter, statuses: withToggled(filter.statuses, s) })}
            />
          ))}
          {VERDICTS.map((v) => (
            <Chip
              key={v}
              label={VERDICT_LABELS[v]}
              icon={VERDICT_ICON[v]}
              active={filter.verdicts.has(v)}
              onClick={() => onChange({ ...filter, verdicts: withToggled(filter.verdicts, v) })}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
