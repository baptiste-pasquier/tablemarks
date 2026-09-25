import { useId, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  VERDICTS,
  translateVerdict,
  translateStatus,
  type RestaurantStatus,
  type Restaurant,
} from '../../types/models'
import { STATUS_CHIP_CLASS, STATUS_ICON, VERDICT_BADGE_CLASS, VERDICT_ICON } from '../display'
import { colorForCuisine, emojiForCuisine } from './cuisines'
import { resolveCuisine } from './cuisineCatalog'
import { splitRows } from './cuisineRanking'
import { useRankedCuisines } from './useRankedCuisines'
import { emptyFilter, isEmptyFilter, withToggled, UNCATEGORIZED, type FacetFilter } from './filter'
import { Button } from '../ui/Button'
import { Eyebrow } from '../ui/Eyebrow'
import { ToggleChip } from '../ui/ToggleChip'
import { cn } from '../../lib/cn'

const DEFAULT_CUISINE_ROW_SIZE = 6

type FilterBarLayout = 'stacked' | 'inline'

// Only each group's own row classes swap per layout (KTD1) — mirrors ToggleChip's `shape` prop,
// never touching chip/button rendering underneath. `stacked` (mobile sheet) keeps the label above
// its own wrapping chip row, today's shape. `inline` (desktop overlay) puts the label to the left
// of a single flowing chip box that wraps *within its own box*, so an overflowing line stays
// aligned under the first chip instead of resetting flush-left under the label — this only works
// because the label and the chip box are two flex items in a *non-wrapping* row (`GROUP_ROW_CLASS`
// has no `flex-wrap`); the chip box itself carries the `flex-wrap` (`CHIPS_ROW_CLASS`). `items-
// center` vertically centers the label against the chip box's full height (its own wrapped lines
// included), not just its first line. Both layouts stack the cuisine group above the status/
// verdict group with no divider between them.
const GROUP_ROW_CLASS: Record<FilterBarLayout, string> = {
  stacked: '',
  inline: 'flex items-center gap-3',
}
const CHIPS_ROW_CLASS: Record<FilterBarLayout, string> = {
  stacked: 'mt-1 flex flex-wrap gap-1.5',
  inline: 'flex min-w-0 flex-1 flex-wrap gap-1.5',
}

function GroupLabel({ layout, children }: { layout: FilterBarLayout; children: string }) {
  return (
    <span
      className={cn(
        'text-[10px] font-semibold tracking-wide text-gray-600 uppercase',
        // Keeps the label from shrinking below its own text width when the flex row is tight.
        layout === 'inline' && 'shrink-0',
      )}
    >
      {children}
    </span>
  )
}

/**
 * Clearable facet chips for cuisine / status / verdict. The shell owns the filter state.
 *
 * `layout` (KTD1) swaps only each group's row classes: `stacked` (default, mobile sheet) keeps
 * each group's label above its own wrapping chip row; `inline` (desktop overlay) puts the label to
 * the left of a single flowing chip row instead. Chip rendering itself never changes.
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
  const ranked = useRankedCuisines(restaurants, false)
  const hasUncategorized = useMemo(
    () => restaurants.some((r) => !resolveCuisine(r.cuisine)),
    [restaurants],
  )
  const { visible, overflow } = useMemo(
    () => splitRows(ranked, filter.cuisines, DEFAULT_CUISINE_ROW_SIZE),
    [ranked, filter.cuisines],
  )
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

      <div className="space-y-2">
        {(ranked.length > 0 || hasUncategorized) && (
          <div className={GROUP_ROW_CLASS[layout]}>
            <GroupLabel layout={layout}>{t('filters.cuisineGroup')}</GroupLabel>
            <div id={cuisineGroupId} className={CHIPS_ROW_CLASS[layout]}>
              {shownCuisines.map((c) => (
                <ToggleChip
                  key={c.key}
                  shape="pill"
                  active={filter.cuisines.has(c.key)}
                  activeColor={colorForCuisine(c.value)}
                  onClick={() =>
                    onChange({ ...filter, cuisines: withToggled(filter.cuisines, c.key) })
                  }
                >
                  <span aria-hidden="true" className="text-base leading-none">
                    {emojiForCuisine(c.value)}
                  </span>
                  {c.label}
                </ToggleChip>
              ))}
              {hasUncategorized && (
                <ToggleChip
                  shape="pill"
                  active={filter.cuisines.has(UNCATEGORIZED)}
                  activeColor={colorForCuisine(undefined)}
                  onClick={() =>
                    onChange({ ...filter, cuisines: withToggled(filter.cuisines, UNCATEGORIZED) })
                  }
                >
                  <span aria-hidden="true" className="text-base leading-none">
                    {emojiForCuisine(undefined)}
                  </span>
                  {t('common.uncategorized')}
                </ToggleChip>
              )}
              {overflow.length > 0 && (
                <button
                  type="button"
                  aria-expanded={expanded}
                  aria-controls={cuisineGroupId}
                  onClick={() => setExpanded((e) => !e)}
                  className="inline-flex min-h-10 items-center rounded-full bg-white px-3 py-1.5 text-xs text-gray-700 shadow-chip transition hover:bg-gray-50"
                >
                  {expanded
                    ? t('filters.collapse')
                    : t('filters.showMore', { count: overflow.length })}
                </button>
              )}
            </div>
          </div>
        )}

        <div className={GROUP_ROW_CLASS[layout]}>
          <GroupLabel layout={layout}>{t('filters.statusVerdictGroup')}</GroupLabel>
          <div className={CHIPS_ROW_CLASS[layout]}>
            {(['to_try', 'visited'] as RestaurantStatus[]).map((s) => {
              const Icon = STATUS_ICON[s]
              return (
                <ToggleChip
                  key={s}
                  shape="pill"
                  active={filter.statuses.has(s)}
                  activeTone={STATUS_CHIP_CLASS[s]}
                  onClick={() => onChange({ ...filter, statuses: withToggled(filter.statuses, s) })}
                >
                  <Icon size={13} strokeWidth={2.4} aria-hidden="true" />
                  {translateStatus(s)}
                </ToggleChip>
              )
            })}
            {VERDICTS.map((v) => {
              const Icon = VERDICT_ICON[v]
              return (
                <ToggleChip
                  key={v}
                  shape="pill"
                  active={filter.verdicts.has(v)}
                  activeTone={VERDICT_BADGE_CLASS[v]}
                  onClick={() => onChange({ ...filter, verdicts: withToggled(filter.verdicts, v) })}
                >
                  <Icon size={13} strokeWidth={2.4} aria-hidden="true" />
                  {translateVerdict(v)}
                </ToggleChip>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
