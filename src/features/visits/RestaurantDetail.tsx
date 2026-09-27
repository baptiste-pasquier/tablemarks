import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useRestaurantDetail } from './useRestaurantDetail'
import { DeleteRestaurant } from './DeleteRestaurant'
import { PlaceInfo } from './PlaceInfo'
import { VerdictButtons } from './VerdictButtons'
import { VisitHistory } from './VisitHistory'
import { useRestaurants } from '../useRestaurants'
import { useRankedCuisines } from '../facets/useRankedCuisines'
import { detailZone } from '../places/placeDisplay'
import { Modal } from '../ui/Modal'
import { ModalHeader } from '../ui/ModalHeader'
import { Button } from '../ui/Button'
import { createVisit } from '../../data/visits'
import { updateRestaurant, type RestaurantPatch } from '../../data/restaurants'
import { distanceLabelFor } from '../../lib/geo'
import type { GeoPoint } from '../../lib/geolocate'
import type { Verdict } from '../../types/models'

export function RestaurantDetail({
  restaurantId,
  onClose,
  onDeleted,
  currentPosition,
}: {
  restaurantId: string
  onClose: () => void
  /**
   * The place was deleted — from this detail or another device. Distinct from `onClose`: nothing
   * is left to restore focus to, so the caller must not prepare for that.
   */
  onDeleted: () => void
  currentPosition?: GeoPoint | null
}) {
  const { t, i18n } = useTranslation()
  const { restaurant, visits } = useRestaurantDetail(restaurantId)
  // `getRestaurant` returns tombstones too; a deleted place must not stay open to log visits on.
  const deleted = restaurant?.deleted ?? false
  useEffect(() => {
    if (deleted) onDeleted()
  }, [deleted, onDeleted])
  // True while a delete is being written: closing then would unmount the one place its failure
  // can be shown.
  const [deleting, setDeleting] = useState(false)
  const restaurants = useRestaurants()
  const options = useRankedCuisines(restaurants, true)
  const [logging, setLogging] = useState(false)
  const [saveFailed, setSaveFailed] = useState(false)
  // Guards the notes field against being remounted (and thus reset to the store value) while the
  // user is mid-edit — see saveField/noteKey below. Refs, not state: flipping
  // them on focus/blur must not itself force a re-render (see KTD8 amendment in the plan).
  const noteFocusedRef = useRef(false)
  // The value the notes field displayed when its current edit session began (set in onFocus, from the
  // DOM so it's exact regardless of any store update racing focus). saveField compares against this
  // baseline instead of the live `restaurant` field, so a focus+blur with no real edit never
  // reverts a concurrent external update (e.g. a sync pull) that landed while the field was focused.
  const noteBaselineRef = useRef('')
  // The field's `key`, recomputed from the store value — but only while unfocused. Deliberately
  // NOT derived inline as `focused ? ... : ...`: doing so still races an external update landing on
  // the very first render after focus starts (before any render had a chance to "freeze" the old
  // key), which would still force a one-time remount using the just-arrived external value. Instead
  // we only ever update this state while not focused, so a key change (and remount) can only happen
  // once the field is blurred.
  const [noteKey, setNoteKey] = useState('')

  if (!restaurant || deleted) return null

  // Recompute the notes field's key from the current store value, but only while it is unfocused
  // (see noteKey's declaration above for why this can't be a plain inline ternary).
  if (!noteFocusedRef.current) {
    const desiredNoteKey = `${restaurant.id}:${restaurant.note ?? ''}`
    if (desiredNoteKey !== noteKey) setNoteKey(desiredNoteKey)
  }

  const distanceLabel = distanceLabelFor(currentPosition, restaurant)

  // A rejected write (storage full, the row deleted or synced away meanwhile) reaches the user; the
  // store listener goes on showing the real state either way.
  function save(changes: RestaurantPatch) {
    setSaveFailed(false)
    void updateRestaurant(restaurantId, changes).catch(() => setSaveFailed(true))
  }

  // Compares against `baseline` (the value displayed when the edit session began, captured in
  // onFocus) rather than the live `restaurant[field]`: a store update can land while the field is
  // focused, and comparing against the current restaurant value would then treat an unedited
  // focus+blur as a real edit, silently reverting the external update back to the pre-focus value.
  function saveField(field: 'note', value: string, baseline: string) {
    const next = value.trim() || undefined
    const prev = baseline.trim() || undefined
    if (next === prev) return
    save({ [field]: next })
  }

  async function logNow(verdict: Verdict) {
    await createVisit({ restaurantId, verdict })
    setLogging(false)
  }

  // Escape, the backdrop and the ✕ all come through here.
  function close() {
    if (!deleting) onClose()
  }

  return (
    <Modal onClose={close} panelClassName="max-h-[90vh] overflow-y-auto">
      <ModalHeader
        title={restaurant.name}
        subtitle={restaurant.osm && detailZone(restaurant.osm, t, i18n.language)}
        onClose={close}
        variant="detail"
      />

      {/* Above everything, since the category and the notes, far apart, both save through it. */}
      {saveFailed && (
        <p role="alert" className="mb-2 text-sm text-red-600">
          {t('visitDetail.errorSave')}
        </p>
      )}

      <PlaceInfo
        key={restaurant.id}
        restaurant={restaurant}
        distanceLabel={distanceLabel}
        options={options}
        onCuisineChange={(cuisine) => save({ cuisine })}
      />

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

      <VisitHistory restaurantId={restaurantId} visits={visits} />

      {/* Last, below the visits it would take with it. */}
      <DeleteRestaurant
        restaurantId={restaurantId}
        name={restaurant.name}
        visitCount={visits.length}
        onPendingChange={setDeleting}
      />
    </Modal>
  )
}
