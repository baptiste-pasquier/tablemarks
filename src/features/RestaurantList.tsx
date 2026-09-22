import { useTranslation } from 'react-i18next'
import { StatusBadge } from './StatusBadge'
import { badgeState } from './display'
import { cuisineDisplayName, cuisinePillTokens, emojiForCuisine } from './facets/cuisines'
import { Badge } from './ui/Badge'
import { translateVisitsCount, type Restaurant } from '../types/models'
import type { GeoPoint } from '../lib/geolocate'
import { distanceLabelFor } from '../lib/geo'

export function RestaurantList({
  items,
  onSelect,
  onHover,
  currentPosition,
}: {
  items: Restaurant[]
  onSelect?: (id: string) => void
  onHover?: (id: string | null) => void
  currentPosition?: GeoPoint | null
}) {
  const { t } = useTranslation()

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
        <span aria-hidden="true" className="text-4xl">
          🍽️
        </span>
        <p className="text-lg font-bold tracking-tight text-gray-900">
          {t('restaurantList.emptyTitle')}
        </p>
        <p className="max-w-[16rem] text-sm text-gray-600">{t('restaurantList.emptyBody')}</p>
      </div>
    )
  }

  return (
    <ul className="space-y-4 p-3">
      {items.map((r) => {
        const visited = badgeState(r).kind === 'visited'
        const distanceLabel = distanceLabelFor(currentPosition, r)
        return (
          <li key={r.id}>
            <button
              type="button"
              onClick={() => {
                onSelect?.(r.id)
                onHover?.(null)
              }}
              onMouseEnter={() => onHover?.(r.id)}
              onMouseLeave={() => onHover?.(null)}
              onFocus={() => onHover?.(r.id)}
              onBlur={() => onHover?.(null)}
              className="block w-full rounded-card bg-white p-3 text-left shadow-card transition hover:shadow-lg"
            >
              <div className="flex items-start justify-between gap-2">
                <span className="min-w-0 truncate text-base font-bold tracking-tight text-gray-900">
                  {r.name}
                </span>
                <Badge
                  text={cuisineDisplayName(r.cuisine, t('common.uncategorized'))}
                  icon={emojiForCuisine(r.cuisine)}
                  pastel={cuisinePillTokens(r.cuisine)}
                />
              </div>
              <div className="mt-2 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <StatusBadge restaurant={r} />
                  {visited && (
                    <span className="text-xs text-gray-600">
                      {translateVisitsCount(r.visitCount)}
                    </span>
                  )}
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
