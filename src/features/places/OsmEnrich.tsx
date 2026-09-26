import { useTranslation } from 'react-i18next'
import { SearchX, Sparkles } from 'lucide-react'
import { Button } from '../ui/Button'
import { shortZone } from './placeDisplay'
import { cuisineLabel } from '../facets/cuisineCatalog'
import { formatDistance, haversineMeters } from '../../lib/geo'
import type { useOsmEnrichment } from './useOsmEnrichment'
import type { Restaurant } from '../../types/models'

const MESSAGE = {
  failed: 'place.osmFailed',
  gone: 'place.osmGone',
  'save-failed': 'visitDetail.errorSave',
} as const

/** The offer to complete a place from OSM, its confirmation, and every outcome's message. */
export function OsmEnrich({
  restaurant,
  enrichment,
}: {
  restaurant: Restaurant
  enrichment: ReturnType<typeof useOsmEnrichment>
}) {
  const { t, i18n } = useTranslation()
  const { state } = enrichment

  if (state.kind === 'proposal') {
    const { candidate } = state
    const osm = candidate.osm
    const distance =
      restaurant.lat !== null && restaurant.lng !== null
        ? formatDistance(
            haversineMeters(restaurant.lat, restaurant.lng, candidate.lat, candidate.lng),
          )
        : null
    const where = osm
      ? [shortZone(osm, t, i18n.language), osm.street].filter(Boolean).join(' · ')
      : ''
    return (
      <div className="mt-3 rounded-[14px] bg-white p-3 shadow-card">
        <p className="text-sm">
          <strong>{candidate.name}</strong>
          {distance && (
            <span className="text-gray-600"> · {t('place.matchDistance', { distance })}</span>
          )}
        </p>
        {where && <p className="text-xs text-gray-600">{where}</p>}
        {osm?.openingHours && <p className="mt-1.5 text-xs text-gray-700">{osm.openingHours}</p>}
        {osm?.phone && <p className="text-xs text-gray-700">{osm.phone}</p>}
        {restaurant.cuisine && (
          <p className="mt-1.5 text-xs text-gray-600">
            {t('place.categoryKept', { category: cuisineLabel(restaurant.cuisine, t) })}
          </p>
        )}
        <div className="mt-2.5 flex gap-2">
          <Button variant="primary" className="flex-1" onClick={() => void enrichment.confirm()}>
            {t('place.confirmMatch')}
          </Button>
          <Button variant="secondary" className="flex-1" onClick={enrichment.reject}>
            {t('place.rejectMatch')}
          </Button>
        </div>
      </div>
    )
  }

  const message =
    state.kind === 'failed' || state.kind === 'gone' || state.kind === 'save-failed'
      ? MESSAGE[state.kind]
      : null

  // The outcome, then the offer again when it still applies: "not found" and "not answering" can
  // be retried; a refresh outcome shows alone, since a matched place has no offer.
  return (
    <>
      {message && (
        <p role="alert" className="mt-3 text-sm text-red-600">
          {t(message)}
        </p>
      )}
      {state.kind === 'not-found' && (
        <p className="mt-3 flex items-start gap-2 rounded-[14px] border-[1.5px] border-gray-300 p-3 text-[13px] text-gray-600">
          <SearchX size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
          <span>
            <span className="block font-semibold">{t('place.notFound')}</span>
            <span className="block text-xs">{t('place.notFoundHint')}</span>
          </span>
        </p>
      )}
      {enrichment.canComplete && (
        <button
          type="button"
          onClick={() => void enrichment.complete()}
          disabled={state.kind === 'busy'}
          className="mt-3 flex w-full items-center gap-2.5 rounded-[14px] border-[1.5px] border-dashed border-brand/40 bg-white px-3 py-2.5 text-left text-[13px] font-semibold text-brand-strong transition hover:bg-brand-soft disabled:opacity-50"
        >
          <Sparkles size={16} aria-hidden="true" />
          <span>
            <span className="block">{t('place.complete')}</span>
            <span className="block text-xs font-medium text-gray-600">
              {t('place.completeHint')}
            </span>
          </span>
        </button>
      )}
    </>
  )
}
