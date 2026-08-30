import { getDB } from './db'
import { newId, now } from './ids'
import { emitLocalChange, emitStoreChange } from './events'
import type { Restaurant } from '../types/models'

export interface RestaurantInput {
  id?: string
  name: string
  lat?: number | null
  lng?: number | null
  address?: string
  mapsUrl?: string
  cuisine?: string
  note?: string
  /** Provisional record awaiting coordinate resolution. */
  pending?: boolean
}

/** Content fields a user can edit (excludes sync + derived rollup fields). */
export type RestaurantPatch = Partial<
  Pick<Restaurant, 'name' | 'lat' | 'lng' | 'address' | 'mapsUrl' | 'cuisine' | 'note' | 'pending'>
>

export async function createRestaurant(input: RestaurantInput): Promise<Restaurant> {
  const record: Restaurant = {
    id: input.id ?? newId(),
    name: input.name,
    lat: input.lat ?? null,
    lng: input.lng ?? null,
    address: input.address,
    mapsUrl: input.mapsUrl,
    cuisine: input.cuisine,
    note: input.note,
    pending: input.pending ?? false,
    latestVerdict: null,
    latestVisitDate: null,
    visitCount: 0,
    updated: now(),
    added: now(),
    deleted: false,
  }
  const db = await getDB()
  await db.put('restaurants', record)
  emitLocalChange()
  return record
}

/**
 * Read-modify-write a restaurant record inside a single readwrite transaction, so two writers
 * touching the same record with no await between them (e.g. a note/cuisine blur-save and a
 * visit-triggered rollup recompute, or a sync pull racing a local edit) can't silently drop one
 * of the two writes the way independent get-then-put calls could. Generalizes the single-
 * transaction get/conditional-put shape `markRestaurantSynced` already uses for its own write.
 *
 * `updater` receives the record currently in the transaction (`undefined` if none exists) and
 * returns the next record to persist, or `undefined` for a no-op (skips the put and the event —
 * used by the sync engine's pull-write when a local edit raced the pull). The write is committed
 * first; only after the transaction resolves does this fire `emitLocalChange()` (user-driven
 * edit, the default) or `emitStoreChange()` (`emit: 'store'`, a sync-pulled write) — matching the
 * persist-then-emit ordering the cuisine save path already follows. `emit: 'none'` suppresses the
 * event entirely, for callers (like `recomputeRollup`) whose existing callers already emit their
 * own event and must not double-fire or leak a local-change signal out of a sync-pulled context.
 */
export async function mutateRestaurant(
  id: string,
  updater: (existing: Restaurant | undefined) => Restaurant | undefined,
  emit: 'local' | 'store' | 'none' = 'local',
): Promise<Restaurant | undefined> {
  const db = await getDB()
  const tx = db.transaction('restaurants', 'readwrite')
  const store = tx.objectStore('restaurants')
  const existing = await store.get(id)
  const next = updater(existing)
  if (next !== undefined) await store.put(next)
  await tx.done
  if (next !== undefined && emit !== 'none') {
    if (emit === 'local') emitLocalChange()
    else emitStoreChange()
  }
  return next
}

export async function updateRestaurant(id: string, patch: RestaurantPatch): Promise<Restaurant> {
  const next = await mutateRestaurant(id, (existing) => {
    if (!existing) throw new Error(`Restaurant ${id} not found`)
    return { ...existing, ...patch, id, updated: now() }
  })
  return next as Restaurant
}

/** Soft-delete the restaurant and tombstone all of its visits. */
export async function removeRestaurant(id: string): Promise<void> {
  const db = await getDB()
  const tx = db.transaction(['restaurants', 'visits'], 'readwrite')
  const restaurant = await tx.objectStore('restaurants').get(id)
  if (restaurant) {
    await tx.objectStore('restaurants').put({ ...restaurant, deleted: true, updated: now() })
  }
  const visits = await tx.objectStore('visits').index('by-restaurant').getAll(id)
  for (const visit of visits) {
    if (!visit.deleted) {
      await tx.objectStore('visits').put({ ...visit, deleted: true, updated: now() })
    }
  }
  await tx.done
  emitLocalChange()
}

export async function getRestaurant(id: string): Promise<Restaurant | undefined> {
  const db = await getDB()
  return db.get('restaurants', id)
}

/** All live (non-deleted) restaurants. */
export async function allRestaurants(): Promise<Restaurant[]> {
  const db = await getDB()
  const all = await db.getAll('restaurants')
  return all.filter((r) => !r.deleted)
}

/** All restaurants including tombstones — the sync engine needs to see deletes. */
export async function allRestaurantsForSync(): Promise<Restaurant[]> {
  const db = await getDB()
  return db.getAll('restaurants')
}

/**
 * Stamp the local-only `syncedUpdated` marker after a successful push — no `updated` bump, used by
 * the sync engine. The stamp is only written if the record's `updated` still matches `syncedUpdated`
 * (the value the caller read before pushing) — otherwise a concurrent edit or delete raced the push,
 * and blindly writing here would revert that newer change while falsely marking it synced. No-op if
 * the record no longer exists or has moved on.
 */
export async function markRestaurantSynced(id: string, syncedUpdated: string): Promise<void> {
  await mutateRestaurant(
    id,
    (existing) => (existing?.updated === syncedUpdated ? { ...existing, syncedUpdated } : undefined),
    'store',
  )
}
