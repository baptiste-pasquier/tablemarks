import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { VerdictButtons } from './VerdictButtons'
import { createVisit, removeVisit } from '../../data/visits'
import { Button } from '../ui/Button'
import { VerdictBadge } from '../StatusBadge'
import { formatDisplayDate } from '../../lib/dates'
import type { Verdict, Visit } from '../../types/models'

/**
 * A place's visit history (R7/R8): an always-expanded timeline, most-recent-first (already
 * guaranteed by visitsForRestaurant's sort — see useRestaurantDetail), with "add a past visit"
 * rendered as the timeline's last row. Its <details>/<summary> reveal mechanism is KTD9.
 */
export function VisitHistory({ restaurantId, visits }: { restaurantId: string; visits: Visit[] }) {
  const { t } = useTranslation()
  const [pastDate, setPastDate] = useState('')

  async function logPast(verdict: Verdict) {
    if (!pastDate) return
    await createVisit({ restaurantId, date: pastDate, verdict })
    setPastDate('')
  }

  return (
    <div className="mt-5">
      <h3 className="text-sm font-semibold text-gray-700">
        {t('visitDetail.visitsHeading')}{' '}
        {visits.length > 0 && <span className="font-normal text-gray-600">({visits.length})</span>}
      </h3>
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
                    <span className="font-medium text-gray-700">{formatDisplayDate(v.date)}</span>
                  </span>
                  <Button
                    variant="icon-dismiss"
                    tone="destructive"
                    onClick={() => void removeVisit(v.id)}
                    aria-label={t('visitDetail.deleteVisitAria', {
                      date: formatDisplayDate(v.date),
                    })}
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
          <input
            type="date"
            value={pastDate}
            onChange={(e) => setPastDate(e.target.value)}
            aria-label={t('visitDetail.visitDateAria')}
            className="rounded-md border border-gray-300 bg-white p-1.5 text-sm"
          />
          <VerdictButtons onPick={(v) => void logPast(v)} disabled={!pastDate} />
        </div>
      </details>
    </div>
  )
}
