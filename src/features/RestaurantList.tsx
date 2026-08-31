import { useTranslation } from 'react-i18next'
import { StatusBadge } from './StatusBadge'
import { badgeState } from './display'
import { colorForCuisine, cuisineDisplayName, emojiForCuisine } from './facets/cuisines'
import { Badge } from './ui/Badge'
import { translateVisitsCount, type Restaurant } from '../types/models'
import type { GeoPoint } from '../lib/geolocate'
import { distanceLabelFor } from '../lib/geo'

/** Cream base the cuisine tint mixes into, matching the shipped "Carnet culinaire" page background. */
const CARD_TINT_BASE = '#fdfaf6'

export function RestaurantList({
  items,
  onSelect,
  currentPosition,
}: {
  items: Restaurant[]
  onSelect?: (id: string) => void
  currentPosition?: GeoPoint | null
}) {
  const { t } = useTranslation()

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
        <span aria-hidden="true" className="text-4xl">
          🍽️
        </span>
        <p className="font-display text-lg font-semibold text-gray-900">{t('restaurantList.emptyTitle')}</p>
        <p className="max-w-[16rem] text-sm text-gray-500">{t('restaurantList.emptyBody')}</p>
      </div>
    )
  }

  return (
    <ul className="space-y-2 p-3">
      {items.map((r) => {
        const cuisineColor = colorForCuisine(r.cuisine)
        const visited = badgeState(r).kind === 'visited'
        const distanceLabel = distanceLabelFor(currentPosition, r)
        return (
          <li key={r.id}>
            <button
              type="button"
              onClick={() => onSelect?.(r.id)}
              className="block w-full rounded-2xl p-3 text-left shadow-sm transition hover:shadow-md"
              style={{
                background: `color-mix(in srgb, ${cuisineColor} 16%, ${CARD_TINT_BASE})`,
                border: `1px solid color-mix(in srgb, ${cuisineColor} 35%, ${CARD_TINT_BASE})`,
              }}
            >
              <div className="flex items-start justify-between gap-2">
                <span className="min-w-0 truncate font-display text-base font-semibold text-gray-900">
                  {r.name}
                </span>
                <Badge
                  text={cuisineDisplayName(r.cuisine, t('common.uncategorized'))}
                  icon={emojiForCuisine(r.cuisine)}
                  color={cuisineColor}
                />
              </div>
              <div className="mt-2 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <StatusBadge restaurant={r} />
                  {visited && <span className="text-xs text-gray-600">{translateVisitsCount(r.visitCount)}</span>}
                </div>
                {distanceLabel && <span className="text-xs text-gray-600">{distanceLabel}</span>}
              </div>
            </button>
          </li>
        )
      })}
    </ul>
  )
}
