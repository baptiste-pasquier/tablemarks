import { getDB, LEGACY_KEY } from './db'
import { emitStoreChange } from './events'

const OWNER_KEY = 'owner'

/** The account id this local store is bound to, or null when it is unbound. */
export async function getStoreOwner(): Promise<string | null> {
  const db = await getDB()
  return (await db.get('meta', OWNER_KEY)) ?? null
}

/** Binds the store to `owner`; a bound store is no longer legacy. One transaction. */
export async function bindStoreOwner(owner: string): Promise<void> {
  const db = await getDB()
  const tx = db.transaction('meta', 'readwrite')
  await Promise.all([tx.store.put(owner, OWNER_KEY), tx.store.delete(LEGACY_KEY), tx.done])
}

/**
 * Whether this store predates owners (upgraded from v1) and was never bound since. Startup binds
 * such a store silently to the session it finds, as the app synced it before owners existed.
 */
export async function isLegacyStore(): Promise<boolean> {
  const db = await getDB()
  return (await db.get('meta', LEGACY_KEY)) !== undefined
}

/**
 * Erase places, visits and the owner in one transaction: all or nothing. Emits a store change
 * (UI refresh) only after the commit, and never a local change — a wipe must not trigger a push.
 */
export async function wipeLocalStore(): Promise<void> {
  const db = await getDB()
  const tx = db.transaction(['restaurants', 'visits', 'meta'], 'readwrite')
  const pending: Promise<unknown>[] = [tx.done]
  try {
    for (const name of ['restaurants', 'visits', 'meta'] as const) {
      pending.push(tx.objectStore(name).clear())
    }
    await Promise.all(pending)
  } catch (err) {
    try {
      tx.abort()
    } catch {
      // already finished or aborted
    }
    // Drain the sibling requests the abort rejects, so none is left unhandled.
    await Promise.allSettled(pending)
    throw err
  }
  emitStoreChange()
}

/** Number of non-deleted restaurants (tombstones excluded). */
export async function countLiveRestaurants(): Promise<number> {
  const db = await getDB()
  const all = await db.getAll('restaurants')
  return all.filter((r) => !r.deleted).length
}
