import { useId, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  VERDICTS,
  translateVerdict,
  translateStatus,
  VERDICT_ICON,
  type RestaurantStatus,
  type Restaurant,
} from '../../types/models'
import { colorForCuisine, emojiForCuisine } from './cuisines'
import { emptyFilter, isEmptyFilter, withToggled, UNCATEGORIZED, type FacetFilter } from './filter'
import { Button } from '../ui/Button'
import { Eyebrow } from '../ui/Eyebrow'
import { ToggleChip } from '../ui/ToggleChip'
import { cn } from '../../lib/cn'

const DEFAULT_CUISINE_ROW_SIZE = 6

type FilterBarLayout = 'stacked' | 'inline'

// Only the groups-wrapper's flex classes swap per layout (KTD1) — mirrors ToggleChip's `shape`
// prop, never touching chip/button rendering underneath. `inline` lays the cuisine group and
// status/verdict group out side-by-side (row) for a future desktop overlay; `stacked` keeps
// today's vertical sidebar/sheet shape.
const GROUPS_LAYOUT_CLASS: Record<FilterBarLayout, string> = {
  stacked: 'space-y-2',
  inline: 'flex flex-wrap items-start gap-4',
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

/**
 * Clearable facet chips for cuisine / status / verdict. The shell owns the filter state.
 *
 * `layout` (KTD1) swaps only the groups-wrapper's flex classes: `stacked` (default) keeps today's
 * vertical sidebar/sheet shape; `inline` lays the cuisine group and status/verdict group out
 * side-by-side (row) for a future desktop overlay. Chip rendering itself never changes.
 */
export function FilterBar({
  restaurants,
  filter,
  onChange,
  layout = 'stacked',
}: {
  restaurants: Restaurant[]
  filter: FacetFilter
  onChange: (filter: FacetFilter) => void
  layout?: FilterBarLayout
}) {
  const { t } = useTranslation()
  // Per-instance id (not a module constant): the desktop overlay and the mobile bottom sheet can
  // both have a FilterBar mounted at once, and a shared id would produce duplicate DOM ids plus
  // an ambiguous aria-controls target for assistive tech.
  const cuisineGroupId = useId()
  const [expanded, setExpanded] = useState(false)
  const ranked = useMemo(() => rankedCuisines(restaurants), [restaurants])
  const hasUncategorized = useMemo(() => restaurants.some((r) => !r.cuisine?.trim()), [restaurants])
  const { visible, overflow } = useMemo(() => splitCuisineRows(ranked, filter.cuisines), [ranked, filter.cuisines])
  const shownCuisines = expanded ? ranked : visible

  if (restaurants.length === 0) return null

  return (
    <div className="space-y-2 border-b border-gray-100 p-3">
      <div className="flex items-center justify-between">
        <Eyebrow>{t('filters.title')}</Eyebrow>
        {!isEmptyFilter(filter) && (
          <Button variant="link" size="xs" onClick={() => onChange(emptyFilter())}>
            {t('filters.clearAll')}
          </Button>
        )}
      </div>

      <div className={cn(GROUPS_LAYOUT_CLASS[layout])}>
        {(ranked.length > 0 || hasUncategorized) && (
          <div>
            <GroupLabel>{t('filters.cuisineGroup')}</GroupLabel>
            <div id={cuisineGroupId} className="mt-1 flex flex-wrap gap-1.5">
              {shownCuisines.map((c) => (
                <ToggleChip
                  key={c}
                  shape="pill"
                  active={filter.cuisines.has(c.toLowerCase())}
                  onClick={() => onChange({ ...filter, cuisines: withToggled(filter.cuisines, c.toLowerCase()) })}
                >
                  <span
                    aria-hidden="true"
                    className="inline-block h-2.5 w-2.5 rounded-full"
                    style={{ background: colorForCuisine(c) }}
                  />
                  <span aria-hidden="true">{emojiForCuisine(c)}</span>
                  {c}
                </ToggleChip>
              ))}
              {hasUncategorized && (
                <ToggleChip
                  shape="pill"
                  active={filter.cuisines.has(UNCATEGORIZED)}
                  onClick={() => onChange({ ...filter, cuisines: withToggled(filter.cuisines, UNCATEGORIZED) })}
                >
                  <span
                    aria-hidden="true"
                    className="inline-block h-2.5 w-2.5 rounded-full"
                    style={{ background: colorForCuisine(undefined) }}
                  />
                  <span aria-hidden="true">{emojiForCuisine(undefined)}</span>
                  {t('common.uncategorized')}
                </ToggleChip>
              )}
              {overflow.length > 0 && (
                <button
                  type="button"
                  aria-expanded={expanded}
                  aria-controls={cuisineGroupId}
                  onClick={() => setExpanded((e) => !e)}
                  className="inline-flex min-h-10 items-center rounded-full border border-dashed border-gray-300 px-3 py-1.5 text-xs text-gray-500 transition hover:border-gray-400 hover:bg-gray-50"
                >
                  {expanded ? t('filters.collapse') : t('filters.showMore', { count: overflow.length })}
                </button>
              )}
            </div>
          </div>
        )}

        {/* The top border/padding is a stacked-layout separator between this group and the
            cuisine group above it — under `layout="inline"` the two groups sit side-by-side, not
            stacked, so keeping it there would draw a stray line across only this group's top. */}
        <div className={cn('space-y-1', layout === 'stacked' && 'border-t border-gray-100 pt-2')}>
          <GroupLabel>{t('filters.statusVerdictGroup')}</GroupLabel>
          <div className="flex flex-wrap gap-1.5">
            {(['to_try', 'visited'] as RestaurantStatus[]).map((s) => (
              <ToggleChip
                key={s}
                shape="pill"
                active={filter.statuses.has(s)}
                onClick={() => onChange({ ...filter, statuses: withToggled(filter.statuses, s) })}
              >
                {translateStatus(s)}
              </ToggleChip>
            ))}
            {VERDICTS.map((v) => (
              <ToggleChip
                key={v}
                shape="pill"
                active={filter.verdicts.has(v)}
                onClick={() => onChange({ ...filter, verdicts: withToggled(filter.verdicts, v) })}
              >
                <span aria-hidden="true">{VERDICT_ICON[v]}</span>
                {translateVerdict(v)}
              </ToggleChip>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
