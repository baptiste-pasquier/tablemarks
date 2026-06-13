/** Returnability verdict — the entire rating (no numeric score). */
export type Verdict = 'go_back' | 'worth_a_detour' | 'once_was_enough' | 'never_again'

export const VERDICTS: readonly Verdict[] = [
  'go_back',
  'worth_a_detour',
  'once_was_enough',
  'never_again',
]

export const VERDICT_LABELS: Record<Verdict, string> = {
  go_back: 'Go back',
  worth_a_detour: 'Worth a detour',
  once_was_enough: 'Once was enough',
  never_again: 'Never again',
}

/** Ordering for sort/filter — higher is better. go_back > worth_a_detour > once_was_enough > never_again. */
export const VERDICT_RANK: Record<Verdict, number> = {
  go_back: 4,
  worth_a_detour: 3,
  once_was_enough: 2,
  never_again: 1,
}

/** Fields every synced record carries, keyed by a stable client-generated id. */
export interface SyncFields {
  id: string
  /** ISO timestamp, bumped on every user-driven change; the last-write-wins key. */
  updated: string
  /** Soft-delete tombstone — wins by recency like any change. */
  deleted: boolean
}

export interface Restaurant extends SyncFields {
  name: string
  /** null until coordinates resolve (provisional records). */
  lat: number | null
  lng: number | null
  address?: string
  mapsUrl?: string
  /** Stored when given; filtering by it is deferred to the faceting layer. */
  cuisine?: string
  note?: string
  /** Provisional record awaiting coordinate resolution (short link / offline). */
  pending: boolean
  /** Denormalized rollup, recomputed locally from visits — not the sync source of truth. */
  latestVerdict: Verdict | null
  latestVisitDate: string | null
  visitCount: number
}

export interface Visit extends SyncFields {
  restaurantId: string
  /** ISO date (YYYY-MM-DD). */
  date: string
  verdict: Verdict
  note?: string
}

export type RestaurantStatus = 'to_try' | 'visited'

/** Status is derived from visit count — never stored. */
export function statusOf(r: Pick<Restaurant, 'visitCount'>): RestaurantStatus {
  return r.visitCount > 0 ? 'visited' : 'to_try'
}
