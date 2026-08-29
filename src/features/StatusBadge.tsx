import { VERDICT_LABELS, type Restaurant, type Verdict } from '../types/models'

const VERDICT_BADGE_CLASS: Record<Verdict, string> = {
  go_back: 'bg-verdict-go-back',
  worth_a_detour: 'bg-verdict-detour',
  once_was_enough: 'bg-verdict-once',
  never_again: 'bg-verdict-never',
}

function Badge({ text, className }: { text: string; className: string }) {
  return (
    <span
      className={`inline-block shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold text-white ${className}`}
    >
      {text}
    </span>
  )
}

/** One visit's own verdict badge, always in "verdict" mode — used per entry in the visit history. */
export function VerdictBadge({ verdict }: { verdict: Verdict }) {
  return <Badge text={VERDICT_LABELS[verdict]} className={VERDICT_BADGE_CLASS[verdict]} />
}

/**
 * Fused status+verdict badge (R8, R9, KTD3): one element in place of a separate status pill and
 * rollup line. Reads pending/visit-count/latest-verdict directly instead of composing
 * statusLabel()+rollupLabel(), so it never carries a "· N visits" suffix (AE3).
 */
export function StatusBadge({
  restaurant,
}: {
  restaurant: Pick<Restaurant, 'pending' | 'visitCount' | 'latestVerdict'>
}) {
  if (restaurant.pending) return <Badge text="Resolving…" className="bg-verdict-neutral" />
  if (restaurant.visitCount === 0) return <Badge text="To try" className="bg-verdict-neutral" />
  if (restaurant.latestVerdict) return <VerdictBadge verdict={restaurant.latestVerdict} />
  return <Badge text="Visited" className="bg-verdict-neutral" />
}
