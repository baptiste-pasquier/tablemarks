import { useTranslation } from 'react-i18next'
import { MapPin } from 'lucide-react'
import { StatusBadge } from './StatusBadge'
import { badgeState } from './display'
import { cuisineAvatarBackground, cuisinePillTokens, emojiForCuisine } from './facets/cuisines'
import { cuisineLabel } from './facets/cuisineCatalog'
import { translateVisitsCount, type Restaurant } from '../types/models'
import type { GeoPoint } from '../lib/geolocate'
import { distanceLabelFor } from '../lib/geo'
import { OpenStateText } from './places/OpenStateText'
import { useNow } from './places/useNow'
import { shortZone } from './places/placeDisplay'
import { openStateOf } from '../lib/openingHours'

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
  const { t, i18n } = useTranslation()
  const now = useNow()

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
        const zone = r.osm && shortZone(r.osm, t, i18n.language)
        const openState = r.osm ? openStateOf(r.osm.openingHours, now) : null
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
              {/* The cuisine leads as an avatar, so the name's line is shared only with the
                  status, and the cuisine's own color carries into its name on the line below. */}
              <div className="flex items-start gap-3">
                <span
                  aria-hidden="true"
                  className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-[22px]"
                  style={{ background: cuisineAvatarBackground(r.cuisine) }}
                >
                  {emojiForCuisine(r.cuisine)}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate text-base font-bold tracking-tight text-gray-900">
                      {r.name}
                    </span>
                    <StatusBadge restaurant={r} />
                  </div>
                  <div className="mt-1.5 flex items-center gap-1.5 text-xs whitespace-nowrap">
                    <span
                      className="min-w-0 truncate font-semibold"
                      style={{ color: cuisinePillTokens(r.cuisine).color }}
                    >
                      {cuisineLabel(r.cuisine, t)}
                    </span>
                    {visited && (
                      <>
                        <span aria-hidden="true" className="text-gray-400">
                          ·
                        </span>
                        <span className="text-gray-600">{translateVisitsCount(r.visitCount)}</span>
                      </>
                    )}
                    {distanceLabel && (
                      <span className="ml-auto inline-flex shrink-0 items-center gap-0.5 text-gray-600">
                        <MapPin size={13} strokeWidth={2.2} aria-hidden="true" />
                        {distanceLabel}
                      </span>
                    )}
                  </div>
                  {/* Where and when: only for a place matched to OSM, so an unmatched card keeps
                      its two lines rather than an empty third. */}
                  {(zone || openState) && (
                    <div
                      data-line="place"
                      className="mt-0.5 flex items-center gap-1.5 text-xs whitespace-nowrap text-gray-600"
                    >
                      {zone && <span className="min-w-0 truncate">{zone}</span>}
                      {zone && openState && (
                        <span aria-hidden="true" className="text-gray-400">
                          ·
                        </span>
                      )}
                      {openState && <OpenStateText state={openState} className="shrink-0" />}
                    </div>
                  )}
                </div>
              </div>
            </button>
          </li>
        )
      })}
    </ul>
  )
}
