import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronDown, ChevronUp, Clock } from 'lucide-react'
import { OpenStateText } from './OpenStateText'
import { useNow } from './useNow'
import { weekdayNames } from './weekdayNames'
import { cn } from '../../lib/cn'
import { formatClock, openStateAt, parseOpeningHours, weekdayIndex } from '../../lib/openingHours'

/**
 * A place's hours folded to one line (the state now), unfolding to the week with today in bold.
 * A value the reader cannot parse is shown as OSM wrote it, with no state and nothing to unfold.
 */
export function OpeningHours({ raw }: { raw: string }) {
  const { t, i18n } = useTranslation()
  const now = useNow()
  const [open, setOpen] = useState(false)
  const week = parseOpeningHours(raw)

  if (!week) {
    return (
      <p className="mt-3 flex items-start gap-2 rounded-[14px] bg-white px-3 py-2.5 text-[13px] text-gray-700 shadow-chip">
        <Clock size={15} aria-hidden="true" className="mt-0.5 shrink-0 text-gray-500" />
        {raw}
      </p>
    )
  }

  const today = weekdayIndex(now)
  const names = weekdayNames(i18n.language)
  return (
    <div className="mt-3 rounded-[14px] bg-white px-3 py-2.5 shadow-chip">
      <button
        type="button"
        aria-expanded={open}
        aria-label={t('place.showWeek')}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 text-left text-[13px]"
      >
        <Clock size={15} aria-hidden="true" className="shrink-0 text-gray-500" />
        <OpenStateText state={openStateAt(week, now)} />
        {open ? (
          <ChevronUp size={16} aria-hidden="true" className="ml-auto text-gray-500" />
        ) : (
          <ChevronDown size={16} aria-hidden="true" className="ml-auto text-gray-500" />
        )}
      </button>
      {open && (
        <dl className="mt-2 grid grid-cols-[3rem_1fr] gap-x-2.5 gap-y-0.5 text-[12.5px] text-gray-700">
          {week.map((spans, day) => (
            <div
              key={names[day]}
              className={cn('contents', day === today && 'font-bold text-gray-900')}
            >
              <dt>{names[day]}</dt>
              <dd className={cn(spans.length === 0 && 'text-gray-500')}>
                {spans.length === 0
                  ? t('place.closedDay')
                  : spans.map((s) => `${formatClock(s.start)}–${formatClock(s.end)}`).join(', ')}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  )
}
