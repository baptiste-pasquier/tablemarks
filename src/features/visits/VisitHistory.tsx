import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { VerdictButtons } from './VerdictButtons'
import { createVisit, removeVisit } from '../../data/visits'
import { Button } from '../ui/Button'
import { ToggleChip } from '../ui/ToggleChip'
import { VerdictBadge } from '../StatusBadge'
import { formatDisplayDate } from '../../lib/dates'
import type { Verdict, Visit } from '../../types/models'

/**
 * A place's visit history (R7/R8): an always-expanded timeline, most-recent-first (already
 * guaranteed by visitsForRestaurant's sort — see useRestaurantDetail), with "add a past visit"
 * rendered as the timeline's last row. Its <details>/<summary> reveal mechanism is KTD9. A past
 * visit needs a date or the "I don't remember when" choice; the latter is stored as a null date
 * and listed after the dated visits.
 */
export function VisitHistory({ restaurantId, visits }: { restaurantId: string; visits: Visit[] }) {
  const { t } = useTranslation()
  const [pastDate, setPastDate] = useState('')
  const [dateUnknown, setDateUnknown] = useState(false)
  const [writeFailed, setWriteFailed] = useState(false)

  // A rejected write (storage full, the place deleted meanwhile) is shown here, beside the action,
  // rather than in the detail's alert at the top of a list that may be scrolled out of view.
  async function attempt(write: () => Promise<unknown>): Promise<boolean> {
    setWriteFailed(false)
    try {
      await write()
      return true
    } catch {
      setWriteFailed(true)
      return false
    }
  }

  function toggleDateUnknown() {
    setDateUnknown(!dateUnknown)
    setPastDate('')
  }

  // The date (or "unknown") is kept on failure, so the user can pick a verdict again.
  async function logPast(verdict: Verdict) {
    if (!pastDate && !dateUnknown) return
    const date = dateUnknown ? null : pastDate
    if (await attempt(() => createVisit({ restaurantId, date, verdict }))) {
      setPastDate('')
      setDateUnknown(false)
    }
  }

  return (
    <div className="mt-5">
      <h3 className="text-sm font-semibold text-gray-700">
        {t('visitDetail.visitsHeading')}{' '}
        {visits.length > 0 && <span className="font-normal text-gray-600">({visits.length})</span>}
      </h3>
      {writeFailed && (
        <p role="alert" className="mt-1 text-sm text-red-600">
          {t('visitDetail.errorSave')}
        </p>
      )}
      {visits.length === 0 && (
        <p className="mt-1 text-sm text-gray-600">{t('visitDetail.noVisitsYet')}</p>
      )}
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
                    <span className="font-medium text-gray-700">
                      {v.date ? formatDisplayDate(v.date) : t('visitDetail.dateUnknown')}
                    </span>
                  </span>
                  <Button
                    variant="icon-dismiss"
                    tone="destructive"
                    onClick={() => void attempt(() => removeVisit(v.id))}
                    aria-label={
                      v.date
                        ? t('visitDetail.deleteVisitAria', { date: formatDisplayDate(v.date) })
                        : t('visitDetail.deleteUndatedVisitAria')
                    }
                  >
                    ✕
                  </Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
      <details className="mt-3 rounded-lg border border-dashed border-brand/40 bg-brand-soft p-2.5 text-center">
        <summary className="cursor-pointer list-none text-sm font-semibold text-brand-strong">
          {t('visitDetail.addPastVisit')}
        </summary>
        <div className="mt-2.5 space-y-2 text-left">
          {/* Wraps under the date on a narrow screen rather than overflowing it. */}
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="date"
              value={pastDate}
              onChange={(e) => setPastDate(e.target.value)}
              disabled={dateUnknown}
              aria-label={t('visitDetail.visitDateAria')}
              className="rounded-md border border-gray-300 bg-white p-1.5 text-sm disabled:opacity-50"
            />
            <ToggleChip shape="pill" active={dateUnknown} onClick={toggleDateUnknown}>
              {t('visitDetail.dateUnknownToggle')}
            </ToggleChip>
          </div>
          <VerdictButtons onPick={(v) => void logPast(v)} disabled={!pastDate && !dateUnknown} />
        </div>
      </details>
    </div>
  )
}
