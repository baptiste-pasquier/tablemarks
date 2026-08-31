import { useId, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Calendar, MapPin, Navigation } from 'lucide-react'
import { useRestaurantDetail } from './useRestaurantDetail'
import { useRestaurants } from '../useRestaurants'
import { createVisit, removeVisit } from '../../data/visits'
import { updateRestaurant } from '../../data/restaurants'
import { cuisineOptions, colorForCuisine, emojiForCuisine } from '../facets/cuisines'
import { Modal } from '../ui/Modal'
import { ModalHeader } from '../ui/ModalHeader'
import { Button } from '../ui/Button'
import { StatusBadge, VerdictBadge } from '../StatusBadge'
import { VERDICTS, translateVerdict, type Verdict } from '../../types/models'
import type { GeoPoint } from '../../lib/geolocate'
import { distanceLabelFor } from '../../lib/geo'
import { instantToLocalDay } from '../../lib/dates'
import {
  isHttpUrl,
  resolveDestination,
  googleMapsSearchUrl,
  googleMapsDirectionsUrl,
} from '../../lib/mapsLinks'

function VerdictButtons({ onPick, disabled }: { onPick: (v: Verdict) => void; disabled?: boolean }) {
  return (
    <div className="flex flex-wrap gap-2">
      {VERDICTS.map((v) => (
        <Button key={v} variant="secondary" disabled={disabled} onClick={() => onPick(v)}>
          {translateVerdict(v)}
        </Button>
      ))}
    </div>
  )
}

export function RestaurantDetail({
  restaurantId,
  onClose,
  currentPosition,
}: {
  restaurantId: string
  onClose: () => void
  currentPosition?: GeoPoint | null
}) {
  const { t } = useTranslation()
  const { restaurant, visits } = useRestaurantDetail(restaurantId)
  const restaurants = useRestaurants()
  const options = useMemo(() => cuisineOptions(restaurants), [restaurants])
  const cuisineListId = useId()
  const [logging, setLogging] = useState(false)
  const [pastDate, setPastDate] = useState('')
  // Guards the notes/cuisine fields against being remounted (and thus reset to the store value)
  // while the user is mid-edit — see saveField/noteKey/cuisineKey below. Refs, not state: flipping
  // them on focus/blur must not itself force a re-render (see KTD8 amendment in the plan).
  const noteFocusedRef = useRef(false)
  const cuisineFocusedRef = useRef(false)
  // The value each field displayed when its current edit session began (set in onFocus, from the
  // DOM so it's exact regardless of any store update racing focus). saveField compares against this
  // baseline instead of the live `restaurant` field, so a focus+blur with no real edit never
  // reverts a concurrent external update (e.g. a sync pull) that landed while the field was focused.
  const noteBaselineRef = useRef('')
  const cuisineBaselineRef = useRef('')
  // Each field's `key`, recomputed from the store value — but only while unfocused. Deliberately
  // NOT derived inline as `focused ? ... : ...`: doing so still races an external update landing on
  // the very first render after focus starts (before any render had a chance to "freeze" the old
  // key), which would still force a one-time remount using the just-arrived external value. Instead
  // we only ever update this state while not focused, so a key change (and remount) can only happen
  // once the field is blurred.
  const [noteKey, setNoteKey] = useState('')
  const [cuisineKey, setCuisineKey] = useState('')

  if (!restaurant) return null

  // Recompute each field's key from the current store value, but only while that field is
  // unfocused (see noteKey/cuisineKey's declaration above for why this can't be a plain inline
  // ternary).
  if (!noteFocusedRef.current) {
    const desiredNoteKey = `${restaurant.id}:${restaurant.note ?? ''}`
    if (desiredNoteKey !== noteKey) setNoteKey(desiredNoteKey)
  }
  if (!cuisineFocusedRef.current) {
    const desiredCuisineKey = `${restaurant.id}:${restaurant.cuisine ?? ''}`
    if (desiredCuisineKey !== cuisineKey) setCuisineKey(desiredCuisineKey)
  }

  const distanceLabel = distanceLabelFor(currentPosition, restaurant)

  const destination = resolveDestination(restaurant)
  const googleMapsHref = isHttpUrl(restaurant.mapsUrl)
    ? restaurant.mapsUrl
    : destination
      ? googleMapsSearchUrl(destination)
      : undefined
  const goToHref = destination ? googleMapsDirectionsUrl(destination) : undefined

  // Best-effort: the row may have been deleted/synced away between render and blur, in which
  // case updateRestaurant rejects (it already routes through mutateRestaurant's single-transaction
  // read-modify-write — see data/restaurants.ts). The store listener reflects the real state either way.
  //
  // Compares against `baseline` (the value displayed when the edit session began, captured in
  // onFocus) rather than the live `restaurant[field]`: a store update can land while the field is
  // focused, and comparing against the current restaurant value would then treat an unedited
  // focus+blur as a real edit, silently reverting the external update back to the pre-focus value.
  function saveField(field: 'cuisine' | 'note', value: string, baseline: string) {
    const next = value.trim() || undefined
    const prev = baseline.trim() || undefined
    if (next === prev) return
    void updateRestaurant(restaurantId, { [field]: next }).catch(() => {})
  }

  async function logNow(verdict: Verdict) {
    await createVisit({ restaurantId, verdict })
    setLogging(false)
  }

  async function logPast(verdict: Verdict) {
    if (!pastDate) return
    await createVisit({ restaurantId, date: pastDate, verdict })
    setPastDate('')
  }

  return (
    <Modal onClose={onClose} panelClassName="max-h-[90vh] overflow-y-auto">
      <ModalHeader title={restaurant.name} onClose={onClose} variant="detail" />

      {/* Info block (R4): identity + location detail grouped into one visually distinct container. */}
      <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
        <div className="flex flex-wrap items-center gap-2 text-sm text-gray-500">
          <StatusBadge restaurant={restaurant} />
          {restaurant.address && (
            <span className="flex items-center gap-1">
              <MapPin size={14} aria-hidden="true" />
              {restaurant.address}
            </span>
          )}
        </div>

        {(distanceLabel || restaurant.added) && (
          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-gray-500">
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
        )}

        <div className="mt-3 flex items-center gap-2">
          <span aria-hidden="true" className="shrink-0">
            {emojiForCuisine(restaurant.cuisine)}
          </span>
          <span
            aria-hidden="true"
            className="inline-block h-3 w-3 shrink-0 rounded-full"
            style={{ background: colorForCuisine(restaurant.cuisine) }}
          />
          <input
            key={cuisineKey}
            list={cuisineListId}
            defaultValue={restaurant.cuisine ?? ''}
            onFocus={(e) => {
              cuisineFocusedRef.current = true
              cuisineBaselineRef.current = e.currentTarget.value
            }}
            onBlur={(e) => {
              cuisineFocusedRef.current = false
              saveField('cuisine', e.target.value, cuisineBaselineRef.current)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur()
            }}
            aria-label={t('visitDetail.cuisineLabel')}
            placeholder={t('visitDetail.cuisinePlaceholder')}
            className="w-full rounded-md border border-gray-300 bg-white p-1.5 text-sm"
          />
          <datalist id={cuisineListId}>
            {options.map((o) => (
              <option key={o} value={o} />
            ))}
          </datalist>
        </div>

        {(googleMapsHref || goToHref) && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {googleMapsHref && (
              <a
                href={googleMapsHref}
                target="_blank"
                rel="noreferrer"
                className="flex shrink-0 items-center gap-1 rounded-full bg-brand px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-brand-strong"
              >
                <MapPin size={14} aria-hidden="true" />
                {t('visitDetail.googleMaps')}
              </a>
            )}
            {goToHref && (
              <a
                href={goToHref}
                target="_blank"
                rel="noreferrer"
                className="flex shrink-0 items-center gap-1 rounded-full bg-brand px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-brand-strong"
              >
                <Navigation size={14} aria-hidden="true" />
                {t('visitDetail.goTo')}
              </a>
            )}
          </div>
        )}
      </div>

      {/* Notes (R5): always visible, directly below the info block. */}
      <div className="mt-3">
        <textarea
          key={noteKey}
          defaultValue={restaurant.note ?? ''}
          onFocus={(e) => {
            noteFocusedRef.current = true
            noteBaselineRef.current = e.currentTarget.value
          }}
          onBlur={(e) => {
            noteFocusedRef.current = false
            saveField('note', e.target.value, noteBaselineRef.current)
          }}
          rows={3}
          aria-label={t('visitDetail.notesLabel')}
          placeholder={t('visitDetail.notesPlaceholder')}
          className="w-full rounded-md border border-gray-300 p-1.5 text-sm"
        />
      </div>

      {/* Check-in (R6): unchanged behavior, positioned below notes. */}
      <div className="mt-4">
        {logging ? (
          <div>
            <p className="mb-2 text-sm font-medium">{t('visitDetail.howWasIt')}</p>
            <VerdictButtons onPick={(v) => void logNow(v)} />
          </div>
        ) : (
          <Button variant="primary" className="w-full" onClick={() => setLogging(true)}>
            {t('visitDetail.hereNow')}
          </Button>
        )}
      </div>

      {/* Visit history (R7/R8): always-expanded timeline, most-recent-first (already guaranteed by
          visitsForRestaurant's sort — see useRestaurantDetail), with "add a past visit" rendered as
          the timeline's last row. Its <details>/<summary> reveal mechanism (KTD9) is unchanged. */}
      <div className="mt-5">
        <h3 className="text-sm font-semibold text-gray-700">
          {t('visitDetail.visitsHeading')}{' '}
          {visits.length > 0 && <span className="font-normal text-gray-400">({visits.length})</span>}
        </h3>
        {visits.length === 0 && <p className="mt-1 text-sm text-gray-500">{t('visitDetail.noVisitsYet')}</p>}
        {visits.length > 0 && (
          <ul className="mt-2">
            {visits.map((v, i) => (
              <li key={v.id} className="relative flex gap-3 pb-3 last:pb-0">
                {i < visits.length - 1 && (
                  <span
                    aria-hidden="true"
                    className="absolute top-0 bottom-0 left-[3px] w-0.5 bg-gray-200"
                  />
                )}
                <span
                  aria-hidden="true"
                  className="relative z-10 mt-0.5 h-2 w-2 shrink-0 rounded-full bg-brand"
                />
                <div className="flex-1 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      <VerdictBadge verdict={v.verdict} />
                      <span className="text-gray-400">{v.date}</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => void removeVisit(v.id)}
                      aria-label={t('visitDetail.deleteVisitAria', { date: v.date })}
                      className="text-gray-400 hover:text-red-600"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
        <details className="mt-2 rounded-lg border border-dashed border-gray-300 p-2 text-center">
          <summary className="list-none cursor-pointer text-sm font-semibold text-gray-400">
            {t('visitDetail.addPastVisit')}
          </summary>
          <div className="mt-2 space-y-2 text-left">
            <input
              type="date"
              value={pastDate}
              onChange={(e) => setPastDate(e.target.value)}
              aria-label={t('visitDetail.visitDateAria')}
              className="rounded-md border border-gray-300 p-1.5 text-sm"
            />
            <VerdictButtons onPick={(v) => void logPast(v)} disabled={!pastDate} />
          </div>
        </details>
      </div>
    </Modal>
  )
}
