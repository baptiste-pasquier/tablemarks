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

/** The kind of OpenStreetMap object a snapshot came from. */
export type OsmType = 'node' | 'way' | 'relation'

export const OSM_TYPES: readonly OsmType[] = ['node', 'way', 'relation']

/**
 * A read-only snapshot of one OpenStreetMap object, replaced whole on refresh and never edited in
 * the app. Raw parts only: the short zone, the compact address and the open state are derived at
 * render (`features/places/placeDisplay.ts`, `lib/openingHours.ts`), never stored.
 */
export interface OsmSnapshot {
  type: OsmType
  id: number
  /** ISO instant the snapshot was fetched. */
  checkedAt: string
  /** `house_number` + `road` ("80 Rue de Charonne"). */
  street?: string
  postcode?: string
  /** `city` ?? `town` ?? `village` ?? `municipality`. */
  city?: string
  suburb?: string
  /** `city_block` ?? `quarter` ?? `neighbourhood`: shown on the detail only. */
  quarter?: string
  /** The raw `opening_hours` tag. */
  openingHours?: string
  phone?: string
  website?: string
}

const OSM_TEXT_KEYS = [
  'street',
  'postcode',
  'city',
  'suburb',
  'quarter',
  'openingHours',
  'phone',
  'website',
] as const

/**
 * The one reader of a snapshot that crossed a boundary (a PocketBase row, an import file): a
 * clean copy holding only the known keys, or null when the shape is wrong.
 */
export function readOsmSnapshot(x: unknown): OsmSnapshot | null {
  if (typeof x !== 'object' || x === null) return null
  const o = x as Record<string, unknown>
  if (!(OSM_TYPES as readonly unknown[]).includes(o.type)) return null
  if (typeof o.id !== 'number' || !Number.isSafeInteger(o.id) || o.id <= 0) return null
  if (typeof o.checkedAt !== 'string' || Number.isNaN(Date.parse(o.checkedAt))) return null
  const snapshot: OsmSnapshot = { type: o.type as OsmType, id: o.id, checkedAt: o.checkedAt }
  for (const key of OSM_TEXT_KEYS) {
    const value = o[key]
    if (value === undefined) continue
    if (typeof value !== 'string') return null
    snapshot[key] = value
  }
  return snapshot
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
  /** The OpenStreetMap object this place is matched to, as last fetched. Absent until matched. */
  osm?: OsmSnapshot
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
export function hasResolvedCoordinates(
  r: Restaurant,
): r is Restaurant & { lat: number; lng: number } {
  return !r.pending && r.lat !== null && r.lng !== null
}
