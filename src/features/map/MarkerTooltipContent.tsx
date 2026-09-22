import { useTranslation } from 'react-i18next'
import { MapPin } from 'lucide-react'
import type { MapMarker } from './markers'
import { StatusBadge } from '../StatusBadge'
import { badgeState } from '../display'
import { cuisineDisplayName, cuisinePillTokens, emojiForCuisine } from '../facets/cuisines'
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
      <span className="mt-1.5 flex items-center gap-1.5 text-xs whitespace-nowrap">
        <span aria-hidden="true" className="text-[15px] leading-none">
          {emojiForCuisine(marker.cuisine)}
        </span>
        <span className="font-semibold" style={{ color: cuisinePillTokens(marker.cuisine).color }}>
          {cuisineDisplayName(marker.cuisine, t('common.uncategorized'))}
        </span>
        {visited && (
          <>
            <span aria-hidden="true" className="text-gray-400">
              ·
            </span>
            <span className="text-gray-600">{translateVisitsCount(marker.visitCount)}</span>
          </>
        )}
      </span>
    </>
  )
}
