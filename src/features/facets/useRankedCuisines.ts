import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { cuisineLabel } from './cuisineCatalog'
import { rankCuisines, type RankedCuisine } from './cuisineRanking'

/** `rankCuisines` in the current language; re-ranks when the language changes. */
export function useRankedCuisines(
  restaurants: ReadonlyArray<{ cuisine?: string | null }>,
  includeUnused: boolean,
): RankedCuisine[] {
  const { t, i18n } = useTranslation()
  const language = i18n.language
  return useMemo(
    () => rankCuisines(restaurants, (value) => cuisineLabel(value, t), language, includeUnused),
    [restaurants, t, language, includeUnused],
  )
}
