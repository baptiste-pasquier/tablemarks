import { Badge } from './ui/Badge'
import { badgeState } from './display'
import {
  translatePending,
  translateStatus,
  translateVerdict,
  VERDICT_ICON,
  type Restaurant,
  type Verdict,
} from '../types/models'

/**
 * Surface *and* text color per verdict, because Soft Pop's verdict fills do not share one
 * readable text color: white sits on the dark green, and would land at 2.15:1 on the amber and
 * 2.54:1 on the gray -- unreadable outdoors, which is where the app is used. Measured against
 * `--color-gray-900`: detour 8.32:1, once 7.02:1, never 4.87:1; go-back keeps white at 4.53:1.
 * `docs/reference/design-tokens.md` carries the same figures.
 */
const VERDICT_BADGE_CLASS: Record<Verdict, string> = {
  go_back: 'bg-verdict-go-back text-white',
  worth_a_detour: 'bg-verdict-detour text-gray-900',
  once_was_enough: 'bg-verdict-once text-gray-900',
  never_again: 'bg-verdict-never text-gray-900',
}

/**
 * Statuses are not verdicts: "to try" and "resolving" say nothing about the place, so they get
 * the pastel pill shape the cuisine badges use, while the four verdicts stay solid. The shape
 * carries the distinction, which is what makes "has this been visited" readable at a glance.
 */
const STATUS_PILL = { background: 'var(--color-gray-100)', color: 'var(--color-gray-700)' }

/** One visit's own verdict badge, always in "verdict" mode — used per entry in the visit history. */
export function VerdictBadge({ verdict }: { verdict: Verdict }) {
  return (
    <Badge
      text={translateVerdict(verdict)}
      tone={VERDICT_BADGE_CLASS[verdict]}
      icon={VERDICT_ICON[verdict]}
    />
  )
}

/**
 * Fused status+verdict badge (R8, R9, KTD3): one element in place of a separate status pill and
 * rollup line. Built from the same classification `badgeState` computes, so it never carries a
 * "· N visits" suffix (AE3) — it just renders that classification without the count.
 */
export function StatusBadge({
  restaurant,
}: {
  restaurant: Pick<Restaurant, 'pending' | 'visitCount' | 'latestVerdict'>
}) {
  const state = badgeState(restaurant)
  if (state.kind === 'pending') return <Badge text={translatePending()} pastel={STATUS_PILL} />
  if (state.kind === 'to_try')
    return <Badge text={translateStatus('to_try')} pastel={STATUS_PILL} />
  if (state.verdict) return <VerdictBadge verdict={state.verdict} />
  return <Badge text={translateStatus('visited')} pastel={STATUS_PILL} />
}
