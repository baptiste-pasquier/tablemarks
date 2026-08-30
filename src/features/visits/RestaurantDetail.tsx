import { useId, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { MapPin, Navigation } from 'lucide-react'
import { useRestaurantDetail } from './useRestaurantDetail'
import { useRestaurants } from '../useRestaurants'
import { createVisit, removeVisit } from '../../data/visits'
import { updateRestaurant } from '../../data/restaurants'
import { cuisineOptions, colorForCuisine } from '../facets/cuisines'
import { Modal } from '../ui/Modal'
import { ModalHeader } from '../ui/ModalHeader'
import { StatusBadge, VerdictBadge } from '../StatusBadge'
import { VERDICTS, translateVerdict, type Verdict } from '../../types/models'
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
        <button
          key={v}
          type="button"
          disabled={disabled}
          onClick={() => onPick(v)}
          className="rounded-full border border-gray-300 px-3 py-1 text-sm hover:bg-brand-soft disabled:opacity-50"
        >
          {translateVerdict(v)}
        </button>
      ))}
    </div>
  )
}

export function RestaurantDetail({
  restaurantId,
  onClose,
}: {
  restaurantId: string
  onClose: () => void
}) {
  const { t } = useTranslation()
  const { restaurant, visits } = useRestaurantDetail(restaurantId)
  const restaurants = useRestaurants()
  const options = useMemo(() => cuisineOptions(restaurants), [restaurants])
  const cuisineListId = useId()
  const [logging, setLogging] = useState(false)
  const [pastDate, setPastDate] = useState('')
  // Guards the notes textarea against being remounted (and thus reset to the store value) while
  // the user is mid-edit — see saveNote/noteKey below. A ref, not state: flipping it on focus/blur
  // must not itself force a re-render (see KTD8 amendment in the plan).
  const noteFocusedRef = useRef(false)
  // The textarea's `key`, recomputed from the store value — but only while unfocused. Deliberately
  // NOT derived inline as `focused ? ... : ...`: doing so still races an external update landing on
  // the very first render after focus starts (before any render had a chance to "freeze" the old
  // key), which would still force a one-time remount using the just-arrived external value. Instead
  // we only ever update this state while not focused, so a key change (and remount) can only happen
  // once the field is blurred.
  const [noteKey, setNoteKey] = useState('')

  if (!restaurant) return null

  // Recompute the notes-textarea key from the current store value, but only while the field is
  // unfocused (see noteKey's declaration above for why this can't be a plain inline ternary).
  if (!noteFocusedRef.current) {
    const desiredNoteKey = `${restaurant.id}:${restaurant.note ?? ''}`
    if (desiredNoteKey !== noteKey) setNoteKey(desiredNoteKey)
  }

  const destination = resolveDestination(restaurant)
  const googleMapsHref = isHttpUrl(restaurant.mapsUrl)
    ? restaurant.mapsUrl
    : destination
      ? googleMapsSearchUrl(destination)
      : undefined
  const goToHref = destination ? googleMapsDirectionsUrl(destination) : undefined

  function saveCuisine(value: string) {
    const next = value.trim() || undefined
    if (next === (restaurant!.cuisine || undefined)) return
    // Best-effort: the row may have been deleted/synced away between render and blur, in
    // which case updateRestaurant rejects. The store listener reflects the real state either way.
    void updateRestaurant(restaurantId, { cuisine: next }).catch(() => {})
  }

  function saveNote(value: string) {
    const next = value.trim() || undefined
    if (next === (restaurant!.note || undefined)) return
    // Best-effort, same race-tolerant shape as saveCuisine — updateRestaurant already routes
    // through mutateRestaurant's single-transaction read-modify-write (see data/restaurants.ts).
    void updateRestaurant(restaurantId, { note: next }).catch(() => {})
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
      <div className="mt-1 flex items-center gap-2 text-sm text-gray-500">
        <StatusBadge restaurant={restaurant} />
        {restaurant.address && <span>{restaurant.address}</span>}
      </div>

      {(googleMapsHref || goToHref) && (
        <div className="mt-1 flex items-center gap-3 text-xs">
          {googleMapsHref && (
            <a
              href={googleMapsHref}
              target="_blank"
              rel="noreferrer"
              className="flex shrink-0 items-center gap-1 font-medium text-brand underline"
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
              className="flex shrink-0 items-center gap-1 font-medium text-brand underline"
            >
              <Navigation size={14} aria-hidden="true" />
              {t('visitDetail.goTo')}
            </a>
          )}
        </div>
      )}

      <div className="mt-3 flex items-center gap-2">
        <span
          aria-hidden="true"
          className="inline-block h-3 w-3 shrink-0 rounded-full"
          style={{ background: colorForCuisine(restaurant.cuisine) }}
        />
        <input
          key={`${restaurant.id}:${restaurant.cuisine ?? ''}`}
          list={cuisineListId}
          defaultValue={restaurant.cuisine ?? ''}
          onBlur={(e) => saveCuisine(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur()
          }}
          aria-label={t('visitDetail.cuisineLabel')}
          placeholder={t('visitDetail.cuisinePlaceholder')}
          className="w-full rounded-md border border-gray-300 p-1.5 text-sm"
        />
        <datalist id={cuisineListId}>
          {options.map((o) => (
            <option key={o} value={o} />
          ))}
        </datalist>
      </div>

      <div className="mt-3">
        <textarea
          key={noteKey}
          defaultValue={restaurant.note ?? ''}
          onFocus={() => {
            noteFocusedRef.current = true
          }}
          onBlur={(e) => {
            noteFocusedRef.current = false
            saveNote(e.target.value)
          }}
          rows={3}
          aria-label={t('visitDetail.notesLabel')}
          placeholder={t('visitDetail.notesPlaceholder')}
          className="w-full rounded-md border border-gray-300 p-1.5 text-sm"
        />
      </div>

      <div className="mt-4">
        {logging ? (
          <div>
            <p className="mb-2 text-sm font-medium">{t('visitDetail.howWasIt')}</p>
            <VerdictButtons onPick={(v) => void logNow(v)} />
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setLogging(true)}
            className="rounded-xl bg-brand px-3 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-strong active:bg-brand-strong active:shadow-none"
          >
            {t('visitDetail.hereNow')}
          </button>
        )}
      </div>

      <div className="mt-5">
        <h3 className="text-sm font-semibold text-gray-700">
          {t('visitDetail.visitsHeading')}{' '}
          {visits.length > 0 && <span className="font-normal text-gray-400">({visits.length})</span>}
        </h3>
        {visits.length === 0 ? (
          <p className="mt-1 text-sm text-gray-500">{t('visitDetail.noVisitsYet')}</p>
        ) : (
          <ul className="mt-1 divide-y divide-gray-100">
            {visits.map((v) => (
              <li key={v.id} className="flex items-center justify-between py-2 text-sm">
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
              </li>
            ))}
          </ul>
        )}
      </div>

      <details className="mt-4">
        <summary className="cursor-pointer text-sm text-gray-600">{t('visitDetail.addPastVisit')}</summary>
        <div className="mt-2 space-y-2">
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
    </Modal>
  )
}
