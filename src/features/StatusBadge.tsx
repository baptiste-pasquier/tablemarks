import { Badge } from './ui/Badge'
import { badgeState, VERDICT_ICON } from './display'
import {
  translatePending,
  translateStatus,
  translateVerdict,
  type Restaurant,
  type Verdict,
} from '../types/models'

/**
 * Surface *and* text color per verdict. The fills are deep enough that white clears AA on all
 * four (5.02:1 to 6.29:1), which is what lets the set share one text color -- an earlier pass
 * used bright fills with dark text, and two strong colors fighting in one pill read worse than
 * the measurement suggested. `docs/reference/design-tokens.md` carries the figures.
 */
const VERDICT_BADGE_CLASS: Record<Verdict, string> = {
  go_back: 'bg-verdict-go-back text-white',
  worth_a_detour: 'bg-verdict-detour text-white',
  once_was_enough: 'bg-verdict-once text-white',
  never_again: 'bg-verdict-never text-white',
}

/**
 * Statuses are not verdicts: "to try" and "resolving" say nothing about the place, so they get
 * the pastel pill shape the cuisine badges use, while the four verdicts stay solid. The shape
 * carries the distinction, which is what makes "has this been visited" readable at a glance.
 */
const STATUS_PILL = { background: 'var(--color-gray-200)', color: 'var(--color-gray-700)' }

/** One visit's own verdict badge, always in "verdict" mode — used per entry in the visit history. */
export function VerdictBadge({ verdict }: { verdict: Verdict }) {
  const Icon = VERDICT_ICON[verdict]
  return (
    <Badge
      text={translateVerdict(verdict)}
      tone={VERDICT_BADGE_CLASS[verdict]}
      icon={<Icon size={13} strokeWidth={2.4} />}
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
