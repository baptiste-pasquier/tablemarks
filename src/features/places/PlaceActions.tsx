import { useTranslation } from 'react-i18next'
import { Globe, MapPin, Navigation, Phone } from 'lucide-react'
import { cn } from '../../lib/cn'
import {
  googleMapsDirectionsUrl,
  googleMapsSearchUrl,
  isHttpUrl,
  resolveDestination,
} from '../../lib/mapsLinks'
import type { Restaurant } from '../../types/models'

const PILL =
  'flex shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold transition'
const FILLED = cn(PILL, 'bg-brand text-white shadow-sm hover:bg-brand-strong')
const OUTLINED = cn(
  PILL,
  'bg-white text-brand-strong ring-[1.5px] ring-brand/40 ring-inset hover:bg-brand-soft',
)

/**
 * What can be done from a place, each shown only when it has a value: the two "I'm going"
 * gestures filled (directions, call), the two "find out more" ones outlined (website, Maps).
 */
export function PlaceActions({ restaurant }: { restaurant: Restaurant }) {
  const { t } = useTranslation()
  const destination = resolveDestination(restaurant)
  const mapsHref = isHttpUrl(restaurant.mapsUrl)
    ? restaurant.mapsUrl
    : destination
      ? googleMapsSearchUrl(destination)
      : undefined
  const goToHref = destination ? googleMapsDirectionsUrl(destination) : undefined
  // OSM separates several values with `;` (never `,`, which some phone formats use); keep the
  // first, defensively, in case a snapshot stored before that split existed still has more than
  // one.
  const phone = restaurant.osm?.phone?.split(';')[0]?.trim()
  // Only an http(s) website becomes a link, like `mapsUrl`: a tag is free text.
  const rawWebsite = restaurant.osm?.website?.split(';')[0]?.trim()
  const website = isHttpUrl(rawWebsite) ? rawWebsite : undefined
  if (!mapsHref && !goToHref && !phone && !website) return null
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      {goToHref && (
        <a href={goToHref} target="_blank" rel="noreferrer" className={FILLED}>
          <Navigation size={14} aria-hidden="true" />
          {t('visitDetail.goTo')}
        </a>
      )}
      {phone && (
        <a href={`tel:${phone.replace(/[^\d+]/g, '')}`} className={FILLED}>
          <Phone size={14} aria-hidden="true" />
          {t('place.call')}
        </a>
      )}
      {website && (
        <a href={website} target="_blank" rel="noreferrer" className={OUTLINED}>
          <Globe size={14} aria-hidden="true" />
          {t('place.website')}
        </a>
      )}
      {mapsHref && (
        <a href={mapsHref} target="_blank" rel="noreferrer" className={OUTLINED}>
          <MapPin size={14} aria-hidden="true" />
          {t('visitDetail.googleMaps')}
        </a>
      )}
    </div>
  )
}
