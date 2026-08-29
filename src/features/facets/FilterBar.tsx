import { useMemo } from 'react'
import {
  VERDICTS,
  VERDICT_LABELS,
  type RestaurantStatus,
  type Restaurant,
} from '../../types/models'
import { colorForCuisine } from './cuisines'
import { emptyFilter, isEmptyFilter, withToggled, UNCATEGORIZED, type FacetFilter } from './filter'

const STATUS_LABELS: Record<RestaurantStatus, string> = { to_try: 'To try', visited: 'Visited' }

function Chip({
  label,
  active,
  color,
  onClick,
}: {
  label: string
  active: boolean
  color?: string
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
      {label}
    </button>
  )
}

/** Distinct cuisines actually in use, by first-seen display form, sorted. */
function presentCuisines(restaurants: Restaurant[]): string[] {
  const byKey = new Map<string, string>()
  for (const r of restaurants) {
    const c = r.cuisine?.trim()
    if (c && !byKey.has(c.toLowerCase())) byKey.set(c.toLowerCase(), c)
  }
  return [...byKey.values()].sort((a, b) => a.localeCompare(b))
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
  const cuisines = useMemo(() => presentCuisines(restaurants), [restaurants])
  const hasUncategorized = useMemo(() => restaurants.some((r) => !r.cuisine?.trim()), [restaurants])

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

      {(cuisines.length > 0 || hasUncategorized) && (
        <div className="flex flex-wrap gap-1.5">
          {cuisines.map((c) => (
            <Chip
              key={c}
              label={c}
              color={colorForCuisine(c)}
              active={filter.cuisines.has(c.toLowerCase())}
              onClick={() => onChange({ ...filter, cuisines: withToggled(filter.cuisines, c.toLowerCase()) })}
            />
          ))}
          {hasUncategorized && (
            <Chip
              label="Uncategorized"
              color={colorForCuisine(undefined)}
              active={filter.cuisines.has(UNCATEGORIZED)}
              onClick={() => onChange({ ...filter, cuisines: withToggled(filter.cuisines, UNCATEGORIZED) })}
            />
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-1.5">
        {(['to_try', 'visited'] as RestaurantStatus[]).map((s) => (
          <Chip
            key={s}
            label={STATUS_LABELS[s]}
            active={filter.statuses.has(s)}
            onClick={() => onChange({ ...filter, statuses: withToggled(filter.statuses, s) })}
          />
        ))}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {VERDICTS.map((v) => (
          <Chip
            key={v}
            label={VERDICT_LABELS[v]}
            active={filter.verdicts.has(v)}
            onClick={() => onChange({ ...filter, verdicts: withToggled(filter.verdicts, v) })}
          />
        ))}
      </div>
    </div>
  )
}
