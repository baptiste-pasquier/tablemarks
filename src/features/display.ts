import { statusOf, VERDICT_LABELS, type Restaurant } from '../types/models'

export function statusLabel(r: Restaurant): string {
  return statusOf(r) === 'visited' ? 'Visited' : 'To try'
}

/** Short rollup line for a card/row: latest verdict + visit count, or the to-try / resolving state. */
export function rollupLabel(r: Restaurant): string {
  if (r.pending) return 'Resolving…'
  if (r.visitCount === 0) return 'To try'
  const verdict = r.latestVerdict ? VERDICT_LABELS[r.latestVerdict] : 'Visited'
  const times = r.visitCount === 1 ? '1 visit' : `${r.visitCount} visits`
  return `${verdict} · ${times}`
}
