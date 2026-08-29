import { statusOf, STATUS_LABELS, VERDICT_LABELS, type Restaurant, type Verdict } from '../types/models'

export function statusLabel(r: Restaurant): string {
  return STATUS_LABELS[statusOf(r)]
}

/** The one status/verdict classification shared by every status/rollup/badge presentation. */
export type BadgeState =
  | { kind: 'pending' }
  | { kind: 'to_try' }
  | { kind: 'visited'; verdict: Verdict | null }

export function badgeState(r: Pick<Restaurant, 'pending' | 'visitCount' | 'latestVerdict'>): BadgeState {
  if (r.pending) return { kind: 'pending' }
  if (r.visitCount === 0) return { kind: 'to_try' }
  return { kind: 'visited', verdict: r.latestVerdict }
}

/** Short rollup line for a card/row: latest verdict + visit count, or the to-try / resolving state. */
export function rollupLabel(r: Restaurant): string {
  const state = badgeState(r)
  if (state.kind === 'pending') return 'Resolving…'
  if (state.kind === 'to_try') return STATUS_LABELS.to_try
  const verdict = state.verdict ? VERDICT_LABELS[state.verdict] : STATUS_LABELS.visited
  const times = r.visitCount === 1 ? '1 visit' : `${r.visitCount} visits`
  return `${verdict} · ${times}`
}
