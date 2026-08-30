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

export async function updateRestaurant(id: string, patch: RestaurantPatch): Promise<Restaurant> {
  const db = await getDB()
  const existing = await db.get('restaurants', id)
  if (!existing) throw new Error(`Restaurant ${id} not found`)
  const next: Restaurant = { ...existing, ...patch, id, updated: now() }
  await db.put('restaurants', next)
  emitLocalChange()
  return next
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

/** Low-level write with no `updated` stamp and no change event — used by the sync engine. */
export async function putRestaurantRaw(record: Restaurant): Promise<void> {
  const db = await getDB()
  await db.put('restaurants', record)
  emitStoreChange()
}

/** All restaurants including tombstones — the sync engine needs to see deletes. */
export async function allRestaurantsForSync(): Promise<Restaurant[]> {
  const db = await getDB()
  return db.getAll('restaurants')
}

/**
 * Stamp the local-only `syncedUpdated` marker after a successful push — no `updated` bump, no
 * change event, used by the sync engine. Get-and-put run in a single readwrite transaction, and
 * the stamp is only written if the record's `updated` still matches `syncedUpdated` (the value the
 * caller read before pushing) — otherwise a concurrent edit or delete raced the push, and blindly
 * writing here would revert that newer change while falsely marking it synced. No-op if the record
 * no longer exists or has moved on.
 */
export async function markRestaurantSynced(id: string, syncedUpdated: string): Promise<void> {
  const db = await getDB()
  const tx = db.transaction('restaurants', 'readwrite')
  const store = tx.objectStore('restaurants')
  const existing = await store.get(id)
  const stamped = existing !== undefined && existing.updated === syncedUpdated
  if (stamped) await store.put({ ...existing, syncedUpdated })
  await tx.done
  if (stamped) emitStoreChange()
}
