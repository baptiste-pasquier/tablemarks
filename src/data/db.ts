import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { Restaurant, Visit } from '../types/models'

const DB_NAME = 'tablemarks'
const DB_VERSION = 2

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
}

let dbPromise: Promise<IDBPDatabase<TablemarksDB>> | null = null

export function getDB(): Promise<IDBPDatabase<TablemarksDB>> {
  if (!dbPromise) {
    dbPromise = openDB<TablemarksDB>(DB_NAME, DB_VERSION, {
      async upgrade(db, oldVersion, _newVersion, tx) {
        // Branch on oldVersion so future version bumps add stores incrementally instead of
        // re-running v1 creates against an existing database.
        if (oldVersion < 1) {
          db.createObjectStore('restaurants', { keyPath: 'id' })
          const visits = db.createObjectStore('visits', { keyPath: 'id' })
          visits.createIndex('by-restaurant', 'restaurantId')
        }
        if (oldVersion < 2) {
          // Backfill needsPush=true on all existing records — treat pre-migration data as
          // pending so the next sync re-pushes it. Re-pushing is idempotent under LWW.
          const rStore = tx.objectStore('restaurants')
          for (const r of await rStore.getAll()) {
            await rStore.put({ ...r, needsPush: true })
          }
          const vStore = tx.objectStore('visits')
          for (const v of await vStore.getAll()) {
            await vStore.put({ ...v, needsPush: true })
          }
        }
      },
    }).catch((err) => {
      // Don't cache a rejected open (private-browsing / quota / transient) — clear so the
      // next call retries instead of failing forever.
      dbPromise = null
      throw err
    })
  }
  return dbPromise
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
