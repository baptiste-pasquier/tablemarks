import i18n from '../i18n/config'

/** Returnability verdict — the entire rating (no numeric score). */
export type Verdict = 'go_back' | 'worth_a_detour' | 'once_was_enough' | 'never_again'

export const VERDICTS: readonly Verdict[] = [
  'go_back',
  'worth_a_detour',
  'once_was_enough',
  'never_again',
]

/**
 * Locale-aware verdict label (R1, R4). Resolved through i18next's instance API rather than the
 * `useTranslation()` hook so this also works from plain, non-component code (display.ts,
 * StatusBadge.tsx, map/markers.ts) as well as from components.
 */
export function translateVerdict(verdict: Verdict): string {
  return i18n.t(`verdicts.${verdict}`)
}

/** Ordering for sort/filter — higher is better. go_back > worth_a_detour > once_was_enough > never_again. */
export const VERDICT_RANK: Record<Verdict, number> = {
  go_back: 4,
  worth_a_detour: 3,
  once_was_enough: 2,
  never_again: 1,
}

/** Icon distinguishing each verdict from its color alone (R6). */
export const VERDICT_ICON: Record<Verdict, string> = {
  go_back: '↩️',
  worth_a_detour: '🧭',
  once_was_enough: '🤷',
  never_again: '🚫',
}

/** Fields every synced record carries, keyed by a stable client-generated id. */
export interface SyncFields {
  id: string
  /** ISO timestamp, bumped on every user-driven change; the last-write-wins key. */
  updated: string
  /** Soft-delete tombstone — wins by recency like any change. */
  deleted: boolean
  /**
   * Local-only: the `updated` value as of the last successful push to PocketBase. Unset until the
   * first push. The record is pending sync whenever this differs from `updated` (or is unset).
   * Never sent to or read from the remote — must not appear in `src/sync/mappers.ts`.
   */
  syncedUpdated?: string
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
  /**
   * ISO timestamp stamped once at creation, never bumped again. Absent on any restaurant created
   * before this field existed — never backfilled or approximated (R3).
   */
  added?: string
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

/** Locale-aware status label (R1, R4) — see {@link translateVerdict} for why this uses i18next directly. */
export function translateStatus(status: RestaurantStatus): string {
  return i18n.t(`statuses.${status}`)
}

/** Locale-aware "resolving…" label shown while a pending restaurant's coordinates are unresolved. */
export function translatePending(): string {
  return i18n.t('statuses.resolving')
}

/** Locale-aware "N visits" label, pluralized via i18next's `_one`/`_other` keys. */
export function translateVisitsCount(count: number): string {
  return i18n.t('common.visitsCount', { count })
}

/** Status is derived from visit count — never stored. */
export function statusOf(r: Pick<Restaurant, 'visitCount'>): RestaurantStatus {
  return r.visitCount > 0 ? 'visited' : 'to_try'
}

/**
 * True once a restaurant's coordinates have resolved — false for a provisional (pending) record.
 * Shared by `map/markers.ts` and `facets/sort.ts` so "resolved coordinates" means the same thing
 * everywhere, even for a record whose `pending`/coordinate fields could otherwise diverge (e.g. a
 * synced or imported record — nothing enforces the two staying in lockstep beyond convention).
 */
export function hasResolvedCoordinates(r: Restaurant): r is Restaurant & { lat: number; lng: number } {
  return !r.pending && r.lat !== null && r.lng !== null
}
