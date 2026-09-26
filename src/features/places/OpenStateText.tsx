import { useTranslation } from 'react-i18next'
import { openStateLabel } from './openStateLabel'
import { cn } from '../../lib/cn'
import type { OpenState } from '../../lib/openingHours'

// Green, orange, gray: open, about to open, not now. Measured on white: emerald-700 5.5:1,
// amber-700 5.0:1, gray-600 7.5:1 — all AA for the 12px text they carry.
const TONE: Record<OpenState['kind'], { text: string; dot: string }> = {
  open: { text: 'text-emerald-700', dot: 'bg-emerald-500' },
  'opens-soon': { text: 'text-amber-700', dot: 'bg-amber-500' },
  closed: { text: 'text-gray-600', dot: 'bg-gray-400' },
  'closed-today': { text: 'text-gray-600', dot: 'bg-gray-400' },
}

/** "● Open until 23:00": the dot is decorative, the words carry the state. */
export function OpenStateText({ state, className }: { state: OpenState; className?: string }) {
  const { t } = useTranslation()
  const tone = TONE[state.kind]
  return (
    <span className={cn('inline-flex items-center gap-1.5 font-semibold', tone.text, className)}>
      <span aria-hidden="true" className={cn('h-1.5 w-1.5 shrink-0 rounded-full', tone.dot)} />
      {openStateLabel(state, t)}
    </span>
  )
}
