import i18n from '../i18n/config'
import { statusOf, translateStatus, translateVerdict, type Restaurant, type Verdict } from '../types/models'

export function statusLabel(r: Restaurant): string {
  return translateStatus(statusOf(r))
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
  if (state.kind === 'pending') return i18n.t('statuses.resolving')
  if (state.kind === 'to_try') return translateStatus('to_try')
  const verdict = state.verdict ? translateVerdict(state.verdict) : translateStatus('visited')
  const times = i18n.t('common.visitsCount', { count: r.visitCount })
  return `${verdict} · ${times}`
}
