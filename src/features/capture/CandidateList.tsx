import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, ChevronDown, ChevronUp, MapPin } from 'lucide-react'
import { Button } from '../ui/Button'
import { cuisineAvatarBackground, cuisinePillTokens, emojiForCuisine } from '../facets/cuisines'
import { cuisineLabel } from '../facets/cuisineCatalog'
import { suggestCategory } from '../facets/osmCategory'
import { zoneAndStreet } from '../places/placeDisplay'
import { isEatery } from '../../capture/osmTags'
import { cn } from '../../lib/cn'
import type { GeoCandidate } from '../../capture/geocode'

function CandidateCard({
  candidate,
  selected,
  onSelect,
}: {
  candidate: GeoCandidate
  selected: boolean
  onSelect: () => void
}) {
  const { t, i18n } = useTranslation()
  const category = suggestCategory(candidate)
  const details = [
    candidate.osm ? zoneAndStreet(candidate.osm, t, i18n.language) : candidate.address,
  ].filter(Boolean)
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={cn(
        'flex w-full items-center gap-2.5 rounded-[14px] bg-white px-3 py-2.5 text-left shadow-card transition hover:bg-gray-50',
        selected && 'ring-2 ring-brand',
      )}
    >
      {category ? (
        <span
          aria-hidden="true"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] text-lg"
          style={{ background: cuisineAvatarBackground(category) }}
        >
          {emojiForCuisine(category)}
        </span>
      ) : (
        <span
          aria-hidden="true"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-brand-soft text-brand-strong"
        >
          <MapPin size={16} />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-bold text-gray-900">{candidate.name}</span>
        <span className="block truncate text-xs text-gray-600">
          {category && (
            <span className="font-semibold" style={{ color: cuisinePillTokens(category).color }}>
              {cuisineLabel(category, t)}
              {details.length > 0 && ' · '}
            </span>
          )}
          {details.join(' · ')}
        </span>
      </span>
      {selected ? (
        <span
          aria-hidden="true"
          className="grid h-5.5 w-5.5 shrink-0 place-items-center rounded-full bg-brand text-white"
        >
          <Check size={14} strokeWidth={2.6} />
        </span>
      ) : (
        <span
          aria-hidden="true"
          className="h-5 w-5 shrink-0 rounded-full ring-[1.5px] ring-gray-300 ring-inset"
        />
      )}
    </button>
  )
}

/**
 * Search results as selectable cards: eateries first, in OSM's order, then everything else under
 * a collapsed fold, so a restaurant OSM files as a shop can still be picked.
 */
export function CandidateList({
  candidates,
  selected,
  onSelect,
}: {
  candidates: GeoCandidate[]
  selected: GeoCandidate | null
  onSelect: (candidate: GeoCandidate) => void
}) {
  const { t } = useTranslation()
  const [showOthers, setShowOthers] = useState(false)
  const eateries = candidates.filter((c) => isEatery(c))
  const others = candidates.filter((c) => !isEatery(c))
  const card = (c: GeoCandidate, i: number) => (
    <li key={`${c.osm?.type ?? ''}${c.osm?.id ?? ''}:${c.lat},${c.lng},${i}`}>
      <CandidateCard candidate={c} selected={c === selected} onSelect={() => onSelect(c)} />
    </li>
  )
  return (
    <div className="mt-4">
      <p className="text-[13px] font-semibold text-gray-700">{t('capture.whichOne')}</p>
      {eateries.length === 0 ? (
        <p className="mt-2 rounded-[14px] bg-brand-soft p-3 text-sm text-brand-strong">
          {t('capture.noEateryMatches')}
        </p>
      ) : (
        <ul className="mt-2 space-y-2">{eateries.map(card)}</ul>
      )}
      {others.length > 0 && (
        <>
          <Button
            variant="link"
            size="xs"
            className="mt-3 inline-flex items-center gap-1"
            aria-expanded={showOthers}
            onClick={() => setShowOthers((v) => !v)}
          >
            {showOthers ? (
              <ChevronUp size={14} aria-hidden="true" />
            ) : (
              <ChevronDown size={14} aria-hidden="true" />
            )}
            {t('capture.otherResults', { count: others.length })}
          </Button>
          {showOthers && <ul className="mt-2 space-y-2">{others.map(card)}</ul>}
        </>
      )}
    </div>
  )
}
