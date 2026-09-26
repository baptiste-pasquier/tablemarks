import { useTranslation } from 'react-i18next'
import { Calendar, MapPin, Navigation } from 'lucide-react'
import { StatusBadge } from '../StatusBadge'
import { CuisinePicker } from '../facets/CuisinePicker'
import { OpeningHours } from '../places/OpeningHours'
import { OsmFooter } from '../places/OsmFooter'
import { PlaceActions } from '../places/PlaceActions'
import { compactAddress } from '../places/placeDisplay'
import { instantToLocalDay } from '../../lib/dates'
import type { RankedCuisine } from '../facets/cuisineRanking'
import type { Restaurant } from '../../types/models'

/** The detail's info block (R4): standing, where, category, hours, actions and the OSM source. */
export function PlaceInfo({
  restaurant,
  distanceLabel,
  options,
  onCuisineChange,
}: {
  restaurant: Restaurant
  distanceLabel: string | null
  options: readonly RankedCuisine[]
  onCuisineChange: (cuisine: string | undefined) => void
}) {
  const { t } = useTranslation()
  const address = compactAddress(restaurant)
  return (
    <div className="rounded-card bg-gray-50 p-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-gray-600">
        <StatusBadge restaurant={restaurant} />
        {distanceLabel && (
          <span className="flex items-center gap-1">
            <Navigation size={14} aria-hidden="true" />
            {distanceLabel}
          </span>
        )}
        {restaurant.added && (
          <span className="flex items-center gap-1">
            <Calendar size={14} aria-hidden="true" />
            {t('visitDetail.addedOn', { date: instantToLocalDay(restaurant.added) })}
          </span>
        )}
      </div>

      {address && (
        <p className="mt-2 flex items-start gap-1.5 text-sm text-gray-700">
          <MapPin size={14} aria-hidden="true" className="mt-0.5 shrink-0 text-gray-500" />
          {address}
        </p>
      )}

      <div className="mt-3">
        <CuisinePicker
          value={restaurant.cuisine}
          options={options}
          onChange={(cuisine) => {
            if (cuisine === (restaurant.cuisine?.trim() || undefined)) return
            onCuisineChange(cuisine)
          }}
        />
      </div>

      {restaurant.osm?.openingHours && <OpeningHours raw={restaurant.osm.openingHours} />}
      <PlaceActions restaurant={restaurant} />
      {restaurant.osm && <OsmFooter osm={restaurant.osm} />}
    </div>
  )
}
