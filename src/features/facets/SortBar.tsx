import { ArrowUpDown } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { SortCriterion, SortDirection } from '../../lib/sortPreference'
import { Button } from '../ui/Button'
import { Eyebrow } from '../ui/Eyebrow'
import { ToggleChip } from '../ui/ToggleChip'
import { cn } from '../../lib/cn'

type TFn = ReturnType<typeof useTranslation>['t']

type SortBarLayout = 'stacked' | 'inline'

// Only the outer wrapper's flex classes swap per layout (KTD1) — mirrors ToggleChip's `shape`
// prop, never touching chip/button rendering underneath. `stacked` (default) keeps today's
// sidebar/sheet shape, wrapping onto a new line if it doesn't fit; `inline` forces a single-row
// horizontal flow (no wrap) suited to a future desktop overlay.
const WRAPPER_LAYOUT_CLASS: Record<SortBarLayout, string> = {
  stacked: 'flex flex-wrap items-center gap-2',
  inline: 'flex flex-nowrap items-center gap-2',
}

/** Direction chip label for the active criterion (R10). */
function directionLabel(t: TFn, criterion: SortCriterion, direction: SortDirection): string {
  if (criterion === 'distance') {
    return direction === 'nearest' ? t('sort.directionNearest') : t('sort.directionFarthest')
  }
  return direction === 'newest' ? t('sort.directionNewest') : t('sort.directionOldest')
}

/** True for the non-default direction of the active criterion (farthest / oldest). */
function isReversed(criterion: SortCriterion, direction: SortDirection): boolean {
  return criterion === 'distance' ? direction === 'farthest' : direction === 'oldest'
}

/**
 * Sort control bar: a Distance/Date segmented selector plus a separate direction chip whose label
 * adapts to the active criterion (R10). Rendered in its own bar above the restaurant list,
 * visually separate from `FilterBar` (session-settled). Purely presentational — `App.tsx` owns
 * the criterion/direction state and persistence (U4); this component only renders it and reports
 * user intent via callbacks.
 *
 * Distance renders disabled (not omitted) while no position is known (session-settled), keeping a
 * stable segment layout and reusing the codebase's existing `aria-pressed` toggle idiom (KTD3).
 *
 * `layout` (KTD1) swaps only the outer wrapper's flex classes: `stacked` (default) keeps today's
 * sidebar/sheet shape; `inline` forces a single-row horizontal flow for a future desktop overlay.
 * Chip rendering itself never changes.
 *
 * `divider` (default `true`) draws the bottom border that separates this bar from whatever
 * follows it — the sidebar's `RestaurantList` today. The mobile filters sheet passes `false`:
 * there, a "See results" button sits directly below with no list to separate from.
 */
export function SortBar({
  criterion,
  direction,
  distanceSelectable,
  onCriterionChange,
  onDirectionToggle,
  layout = 'stacked',
  divider = true,
}: {
  criterion: SortCriterion
  direction: SortDirection
  distanceSelectable: boolean
  onCriterionChange: (criterion: SortCriterion) => void
  onDirectionToggle: () => void
  layout?: SortBarLayout
  divider?: boolean
}) {
  const { t } = useTranslation()

  return (
    <div className={cn(WRAPPER_LAYOUT_CLASS[layout], 'p-3', divider && 'border-b border-gray-100')}>
      <Eyebrow>{t('sort.title')}</Eyebrow>
      <span className="inline-flex overflow-hidden rounded-full border border-gray-300">
        <ToggleChip
          shape="segment"
          disabled={!distanceSelectable}
          active={criterion === 'distance'}
          onClick={() => onCriterionChange('distance')}
          className="border-r border-gray-300"
        >
          {t('sort.criterionDistance')}
        </ToggleChip>
        <ToggleChip
          shape="segment"
          active={criterion === 'date'}
          onClick={() => onCriterionChange('date')}
        >
          {t('sort.criterionDate')}
        </ToggleChip>
      </span>
      <Button
        variant="secondary"
        size="xs"
        className="inline-flex min-h-10 items-center gap-1 text-gray-600"
        aria-pressed={isReversed(criterion, direction)}
        onClick={onDirectionToggle}
      >
        <ArrowUpDown className="h-4 w-4" aria-hidden="true" />
        {directionLabel(t, criterion, direction)}
      </Button>
    </div>
  )
}
