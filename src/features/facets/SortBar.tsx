import { useTranslation } from 'react-i18next'
import type { SortCriterion, SortDirection } from '../../lib/sortPreference'

type TFn = ReturnType<typeof useTranslation>['t']

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

function segmentClass(active: boolean, disabled: boolean): string {
  if (disabled) return 'min-h-10 px-3 py-1.5 text-xs font-medium text-gray-300 cursor-not-allowed'
  return `min-h-10 px-3 py-1.5 text-xs font-medium transition ${
    active
      ? 'bg-brand-soft font-semibold text-brand-strong'
      : 'text-gray-600 hover:bg-gray-50'
  }`
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
 */
export function SortBar({
  criterion,
  direction,
  distanceSelectable,
  onCriterionChange,
  onDirectionToggle,
}: {
  criterion: SortCriterion
  direction: SortDirection
  distanceSelectable: boolean
  onCriterionChange: (criterion: SortCriterion) => void
  onDirectionToggle: () => void
}) {
  const { t } = useTranslation()

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-gray-100 p-3">
      <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">{t('sort.title')}</span>
      <span className="inline-flex overflow-hidden rounded-full border border-gray-300">
        <button
          type="button"
          disabled={!distanceSelectable}
          aria-pressed={criterion === 'distance'}
          onClick={() => onCriterionChange('distance')}
          className={`border-r border-gray-300 ${segmentClass(criterion === 'distance', !distanceSelectable)}`}
        >
          {t('sort.criterionDistance')}
        </button>
        <button
          type="button"
          aria-pressed={criterion === 'date'}
          onClick={() => onCriterionChange('date')}
          className={segmentClass(criterion === 'date', false)}
        >
          {t('sort.criterionDate')}
        </button>
      </span>
      <button
        type="button"
        aria-pressed={isReversed(criterion, direction)}
        onClick={onDirectionToggle}
        className="inline-flex min-h-10 items-center gap-1 rounded-full border border-gray-300 px-3 py-1.5 text-xs text-gray-600 transition hover:border-gray-400 hover:bg-gray-50"
      >
        {directionLabel(t, criterion, direction)}
      </button>
    </div>
  )
}
