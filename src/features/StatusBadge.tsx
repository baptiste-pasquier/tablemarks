import { Badge } from './ui/Badge'
import {
  badgeState,
  STATUS_ICON,
  STATUS_PILL_CLASS,
  VERDICT_BADGE_CLASS,
  VERDICT_ICON,
} from './display'
import {
  translatePending,
  translateStatus,
  translateVerdict,
  type Restaurant,
  type RestaurantStatus,
  type Verdict,
} from '../types/models'

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
 * A plain status's neutral pill, led by its own icon the way a verdict's badge is. Statuses are
 * not verdicts: gray where the four verdicts are colored, which is what makes "has this been
 * visited" readable at a glance.
 */
function StatusPill({ status }: { status: RestaurantStatus }) {
  const Icon = STATUS_ICON[status]
  return (
    <Badge
      text={translateStatus(status)}
      tone={STATUS_PILL_CLASS}
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
  if (state.kind === 'pending') return <Badge text={translatePending()} tone={STATUS_PILL_CLASS} />
  if (state.kind === 'to_try') return <StatusPill status="to_try" />
  if (state.verdict) return <VerdictBadge verdict={state.verdict} />
  return <StatusPill status="visited" />
}
