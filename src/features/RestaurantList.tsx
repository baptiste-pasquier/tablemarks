import { useTranslation } from 'react-i18next'
import { StatusBadge } from './StatusBadge'
import { badgeState } from './display'
import { colorForCuisine, emojiForCuisine } from './facets/cuisines'
import { translateVisitsCount, type Restaurant } from '../types/models'
import type { GeoPoint } from '../lib/geolocate'

/** Cream base the cuisine tint mixes into, matching the shipped "Carnet culinaire" page background. */
const CARD_TINT_BASE = '#fdfaf6'

function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16)
  const channel = (c: number) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255)
}

/**
 * White or near-black text for a solid cuisine-colored surface (the cuisine badge), picked from
 * the relative-luminance crossover point where black-on-color and white-on-color contrast ratios
 * are equal — curated and hashed cuisine colors span too wide a luminance range for one fixed
 * badge text color (KTD8).
 */
function textColorFor(bgHex: string): string {
  return luminance(bgHex) > 0.179 ? '#000000' : '#ffffff'
}

export function RestaurantList({
  items,
  onSelect,
  // Accepted but not yet rendered — U4 consumes this to show per-restaurant distances.
  currentPosition: _currentPosition,
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
        const badgeTextColor = textColorFor(cuisineColor)
        const visited = badgeState(r).kind === 'visited'
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
                <span
                  className="inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold"
                  style={{ background: cuisineColor, color: badgeTextColor }}
                >
                  <span aria-hidden="true">{emojiForCuisine(r.cuisine)}</span>
                  {r.cuisine?.trim() || t('common.uncategorized')}
                </span>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <StatusBadge restaurant={r} />
                {visited && <span className="text-xs text-gray-600">{translateVisitsCount(r.visitCount)}</span>}
              </div>
            </button>
          </li>
        )
      })}
    </ul>
  )
}
