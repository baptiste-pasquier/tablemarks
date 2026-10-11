import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest'
import { openDB } from 'idb'
import { freshDB } from '../test/idb'
import { closeDB } from './db'
import { onLocalChange, onStoreChange } from './events'
import {
  allRestaurantsForSync,
  createRestaurant,
  getRestaurant,
  removeRestaurant,
} from './restaurants'
import { allVisitsForSync, createVisit } from './visits'
import {
  bindStoreOwner,
  countLiveRestaurants,
  getStoreOwner,
  isLegacyStore,
  wipeLocalStore,
} from './storeOwner'

beforeEach(freshDB)
afterEach(() => vi.restoreAllMocks())

/** Leaves a v1 database behind for the next `getDB()` to upgrade. */
async function seedV1Store(): Promise<void> {
  await closeDB()
  const v1 = await openDB('tablemarks', 1, {
    upgrade(db) {
      db.createObjectStore('restaurants', { keyPath: 'id' })
      const visits = db.createObjectStore('visits', { keyPath: 'id' })
      visits.createIndex('by-restaurant', 'restaurantId')
    },
  })
  await v1.put('restaurants', { id: 'r1', name: 'Chez Marcel', deleted: false })
  v1.close()
}

describe('store owner', () => {
  it('upgrades a v1 store to v2 keeping its records, with no owner, marked legacy', async () => {
    await seedV1Store()

    expect(await getStoreOwner()).toBeNull()
    expect((await getRestaurant('r1'))?.id).toBe('r1')
    expect(await isLegacyStore()).toBe(true)
  })

  it('does not mark a store created at v2 as legacy', async () => {
    expect(await isLegacyStore()).toBe(false)
  })

  it('binding the owner clears the legacy marker', async () => {
    await seedV1Store()
    await bindStoreOwner('userA')
    expect(await isLegacyStore()).toBe(false)
    expect(await getStoreOwner()).toBe('userA')
  })

  it('wipeLocalStore clears the legacy marker', async () => {
    await seedV1Store()
    await wipeLocalStore()
    expect(await isLegacyStore()).toBe(false)
  })

  it('binds and reads the owner', async () => {
    await bindStoreOwner('userA')
    expect(await getStoreOwner()).toBe('userA')
  })

  it('wipeLocalStore clears places, visits and the owner', async () => {
    const r = await createRestaurant({ name: 'Chez Marcel', lat: 48.85, lng: 2.35 })
    await createVisit({ restaurantId: r.id, verdict: 'go_back' })
    await bindStoreOwner('userA')

    await wipeLocalStore()

    expect(await allRestaurantsForSync()).toEqual([])
    expect(await allVisitsForSync()).toEqual([])
    expect(await getStoreOwner()).toBeNull()
  })

  it('wipeLocalStore emits a store change after commit and never a local change', async () => {
    await createRestaurant({ name: 'Chez Marcel', lat: 48.85, lng: 2.35 })
    const local = vi.fn()
    const seen: unknown[][] = []
    const offLocal = onLocalChange(local)
    const offStore = onStoreChange(() => {
      void allRestaurantsForSync().then((rows) => seen.push(rows))
    })

    await wipeLocalStore()
    await vi.waitFor(() => expect(seen).toHaveLength(1))
    offLocal()
    offStore()

    expect(seen[0]).toEqual([])
    expect(local).not.toHaveBeenCalled()
  })

  it('wipeLocalStore is all-or-nothing', async () => {
    await createRestaurant({ name: 'Chez Marcel', lat: 48.85, lng: 2.35 })
    await bindStoreOwner('userA')
    const store = vi.fn()
    const off = onStoreChange(store)

    const realClear = IDBObjectStore.prototype.clear
    let calls = 0
    vi.spyOn(IDBObjectStore.prototype, 'clear').mockImplementation(function (this: IDBObjectStore) {
      calls += 1
      if (calls === 3) throw new Error('boom')
      return realClear.call(this)
    })

    await expect(wipeLocalStore()).rejects.toThrow()
    off()
    vi.restoreAllMocks()

    expect(await allRestaurantsForSync()).toHaveLength(1)
    expect(await getStoreOwner()).toBe('userA')
    expect(store).not.toHaveBeenCalled()
  })

  it('countLiveRestaurants ignores tombstones', async () => {
    const a = await createRestaurant({ name: 'A', lat: 1, lng: 1 })
    await createRestaurant({ name: 'B', lat: 2, lng: 2 })
    await removeRestaurant(a.id)
    expect(await countLiveRestaurants()).toBe(1)
  })
})
