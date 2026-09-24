import { useTranslation } from 'react-i18next'
import { MapPin } from 'lucide-react'
import type { MapMarker } from './markers'
import { StatusBadge } from '../StatusBadge'
import { badgeState } from '../display'
import { cuisinePillTokens, emojiForCuisine } from '../facets/cuisines'
import { cuisineLabel } from '../facets/cuisineCatalog'
import type { GeoPoint } from '../../lib/geolocate'
import { distanceLabelFor } from '../../lib/geo'
import { translateVisitsCount } from '../../types/models'

/**
 * What a marker's hover tooltip says, in three rows: the name, which wraps rather than truncates
 * (the tooltip is the one place on the map that shows it whole); the status with the distance
 * opposite it; then the cuisine in its own color and the visit count. Each row holds its own
 * items, so a separator can never end up alone at the start of a wrapped line.
 */
export function MarkerTooltipContent({
  marker,
  currentPosition,
}: {
  marker: MapMarker
  currentPosition?: GeoPoint | null
}) {
  const { t } = useTranslation()
  const visited = badgeState(marker).kind === 'visited'
  const distanceLabel = distanceLabelFor(currentPosition, marker)

  return (
    <>
      <span className="block text-[15px] leading-snug font-bold tracking-tight text-gray-900">
        {marker.name}
      </span>
      <span className="mt-1.5 flex items-center justify-between gap-2.5">
        <StatusBadge restaurant={marker} />
        {distanceLabel && (
          <span className="inline-flex shrink-0 items-center gap-0.5 text-xs text-gray-600">
            <MapPin size={13} strokeWidth={2.2} aria-hidden="true" />
            {distanceLabel}
          </span>
        )}
      </span>
      {/* A free-typed cuisine can be any length: it truncates, the visit count never does. */}
      <span className="mt-1.5 flex items-center gap-1.5 text-xs">
        <span aria-hidden="true" className="shrink-0 text-[15px] leading-none">
          {emojiForCuisine(marker.cuisine)}
        </span>
        <span
          className="min-w-0 truncate font-semibold"
          style={{ color: cuisinePillTokens(marker.cuisine).color }}
        >
          {cuisineLabel(marker.cuisine, t)}
        </span>
        {visited && (
          <>
            <span aria-hidden="true" className="shrink-0 text-gray-400">
              ·
            </span>
            <span className="shrink-0 whitespace-nowrap text-gray-600">
              {translateVisitsCount(marker.visitCount)}
            </span>
          </>
        )}
      </span>
    </>
  )
}
