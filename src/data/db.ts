import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { Restaurant, Visit } from '../types/models'

const DB_NAME = 'tablemarks'
const DB_VERSION = 1

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
      upgrade(db, oldVersion) {
        // Branch on oldVersion so future version bumps add stores incrementally instead of
        // re-running v1 creates against an existing database.
        if (oldVersion < 1) {
          db.createObjectStore('restaurants', { keyPath: 'id' })
          const visits = db.createObjectStore('visits', { keyPath: 'id' })
          visits.createIndex('by-restaurant', 'restaurantId')
        }
      },
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
