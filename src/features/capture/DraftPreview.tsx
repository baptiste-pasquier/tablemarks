import { useTranslation } from 'react-i18next'
import { Clock, Globe, Map as MapIcon, MapPin, Phone } from 'lucide-react'
import { Button } from '../ui/Button'
import { OpenStateText } from '../places/OpenStateText'
import { useNow } from '../places/useNow'
import { websiteLabel, zoneAndStreet } from '../places/placeDisplay'
import { foldText } from '../../lib/foldText'
import { openStateOf } from '../../lib/openingHours'
import type { PlaceDraft } from '../../capture/capture'

/** A pasted link, identified: what "Add" will save, with its OSM data and a way to refuse it. */
export function DraftPreview({
  draft,
  onReject,
  disabled,
}: {
  draft: PlaceDraft
  onReject: () => void
  /** While a commit is in flight: the running commit already holds the old draft (review #3). */
  disabled?: boolean
}) {
  const { t, i18n } = useTranslation()
  const now = useNow()
  const osm = draft.match?.osm
  let subtitle: string
  if (draft.pending) subtitle = t('capture.resolvedLater')
  else if (osm) subtitle = zoneAndStreet(osm, t, i18n.language)
  else subtitle = draft.matchFailed ? t('capture.osmUnavailable') : t('capture.noOsmData')
  const state = osm && openStateOf(osm.openingHours, now)
  // The Maps name is the title; OSM's own name is worth calling out only when it actually differs
  // (review #8b) — otherwise "found as itself" is just noise.
  const matchName = draft.match?.name
  const foundLabel =
    matchName && foldText(matchName) !== foldText(draft.name)
      ? t('capture.foundOnOsmAs', { name: matchName })
      : t('capture.foundOnOsm')
  return (
    <div className="mt-4 rounded-card bg-gray-50 p-3">
      <div className="flex items-center gap-2.5">
        <span
          aria-hidden="true"
          className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand-strong"
        >
          <MapPin size={18} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-bold text-gray-900">{draft.name}</span>
          <span className="block text-xs text-gray-600">{subtitle}</span>
        </span>
      </div>
      {osm && (
        <>
          <ul className="mt-2.5 space-y-1.5 text-[13px] text-gray-700">
            {osm.openingHours && (
              <li className="flex items-center gap-2">
                <Clock size={15} aria-hidden="true" className="shrink-0 text-gray-500" />
                {state ? <OpenStateText state={state} /> : osm.openingHours}
              </li>
            )}
            {osm.phone && (
              <li className="flex items-center gap-2">
                <Phone size={15} aria-hidden="true" className="shrink-0 text-gray-500" />
                {osm.phone}
              </li>
            )}
            {osm.website && (
              <li className="flex items-center gap-2">
                <Globe size={15} aria-hidden="true" className="shrink-0 text-gray-500" />
                {websiteLabel(osm.website)}
              </li>
            )}
          </ul>
          <p className="mt-2.5 flex flex-wrap items-center gap-1 text-[11.5px] text-gray-600">
            <MapIcon size={13} aria-hidden="true" />
            {foundLabel} ·
            <Button variant="link" size="xs" onClick={onReject} disabled={disabled}>
              {t('capture.notThisOne')}
            </Button>
          </p>
        </>
      )}
    </div>
  )
}
