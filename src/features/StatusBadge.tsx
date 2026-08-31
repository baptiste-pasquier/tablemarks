import { Badge } from './ui/Badge'
import { badgeState } from './display'
import { translatePending, translateStatus, translateVerdict, VERDICT_ICON, type Restaurant, type Verdict } from '../types/models'

const VERDICT_BADGE_CLASS: Record<Verdict, string> = {
  go_back: 'bg-verdict-go-back',
  worth_a_detour: 'bg-verdict-detour',
  once_was_enough: 'bg-verdict-once',
  never_again: 'bg-verdict-never',
}

/** One visit's own verdict badge, always in "verdict" mode — used per entry in the visit history. */
export function VerdictBadge({ verdict }: { verdict: Verdict }) {
  return <Badge text={translateVerdict(verdict)} tone={VERDICT_BADGE_CLASS[verdict]} icon={VERDICT_ICON[verdict]} />
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
  if (state.kind === 'pending') return <Badge text={translatePending()} tone="bg-verdict-neutral" />
  if (state.kind === 'to_try') return <Badge text={translateStatus('to_try')} tone="bg-verdict-neutral" />
  if (state.verdict) return <VerdictBadge verdict={state.verdict} />
  return <Badge text={translateStatus('visited')} tone="bg-verdict-neutral" />
}
