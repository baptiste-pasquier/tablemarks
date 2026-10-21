import {
  openDB,
  type DBSchema,
  type IDBPDatabase,
  type IDBPTransaction,
  type StoreNames,
} from 'idb'
import { rollupOf } from './visitOrder'
import type { Restaurant, Visit } from '../types/models'

const DB_NAME = 'tablemarks'
const DB_VERSION = 3
/** `meta` key marking a store that existed before v2 introduced owners. */
export const LEGACY_KEY = 'legacy'

interface TablemarksDB extends DBSchema {
  restaurants: {
    key: string
    value: Restaurant
  }
  visits: {
    key: string
    value: Visit
    indexes: { 'by-restaurant': string }
  }
  /** Device-local bookkeeping (out-of-line keys), e.g. which account owns this store. */
  meta: {
    key: string
    value: string
  }
}

let dbPromise: Promise<IDBPDatabase<TablemarksDB>> | null = null

export function getDB(): Promise<IDBPDatabase<TablemarksDB>> {
  if (!dbPromise) {
    const opening: Promise<IDBPDatabase<TablemarksDB>> = openDB<TablemarksDB>(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion, _newVersion, tx) {
        // Branch on oldVersion so future version bumps add stores incrementally instead of
        // re-running v1 creates against an existing database.
        if (oldVersion < 1) {
          db.createObjectStore('restaurants', { keyPath: 'id' })
          const visits = db.createObjectStore('visits', { keyPath: 'id' })
          visits.createIndex('by-restaurant', 'restaurantId')
        }
        if (oldVersion < 2) {
          db.createObjectStore('meta')
          // A v1 store predates owners: startup may bind it silently (see storeOwner.ts).
          if (oldVersion === 1) void tx.objectStore('meta').put('1', LEGACY_KEY)
        }
        // A fresh store has nothing to repair; only one an older client wrote to can hold `''`.
        if (oldVersion >= 1 && oldVersion < 3) void repairEmptyVisitDates(tx)
      },
      // Another tab opens a newer version: close so its upgrade is not blocked, and let the next
      // call reopen rather than reuse a closed connection.
      blocking(_currentVersion, _blockedVersion, event) {
        ;(event.target as IDBDatabase).close()
        forget(opening)
      },
      // The browser closed the connection (storage cleared, disk error): reopen on the next call.
      terminated() {
        forget(opening)
      },
    }).catch((err) => {
      // Don't cache a rejected open (private-browsing / quota / transient) — clear so the
      // next call retries instead of failing forever.
      forget(opening)
      throw err
    })
    dbPromise = opening
  }
  return dbPromise
}

type UpgradeTransaction = IDBPTransaction<TablemarksDB, StoreNames<TablemarksDB>[], 'versionchange'>

/**
 * v3: a client predating undated visits stored a pulled undated visit's date as `''`, and
 * last-write-wins never replaces it (same `updated`). Rewrite it as `null` and recompute the
 * rollup of each restaurant it touched, inside the upgrade transaction — `getDB()` would wait on
 * this very open. No `updated` bump and no event: it repairs an encoding, not a user edit.
 */
async function repairEmptyVisitDates(tx: UpgradeTransaction): Promise<void> {
  const visits = tx.objectStore('visits')
  const restaurants = tx.objectStore('restaurants')
  const affected = new Set<string>()
  for (const visit of await visits.getAll()) {
    if (visit.date !== '') continue
    affected.add(visit.restaurantId)
    await visits.put({ ...visit, date: null })
  }
  for (const restaurantId of affected) {
    const restaurant = await restaurants.get(restaurantId)
    if (!restaurant) continue
    const theirs = await visits.index('by-restaurant').getAll(restaurantId)
    await restaurants.put({ ...restaurant, ...rollupOf(theirs) })
  }
}

/** Drops the cached open if it is still `opening`, so a newer one is never discarded. */
function forget(opening: Promise<IDBPDatabase<TablemarksDB>>): void {
  if (dbPromise === opening) dbPromise = null
}

/** Close the cached connection (so a pending deleteDatabase isn't blocked) and drop the cache. */
export async function closeDB(): Promise<void> {
  if (dbPromise) {
    const db = await dbPromise
    db.close()
    dbPromise = null
  }
}

export const DB = { name: DB_NAME, version: DB_VERSION }
