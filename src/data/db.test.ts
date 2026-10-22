import { beforeEach, describe, it, expect, vi } from 'vitest'
import { openDB } from 'idb'
import { freshDB } from '../test/idb'
import { DB, getDB } from './db'
import { rollupOf } from './visitOrder'
import type { Restaurant, Visit } from '../types/models'

beforeEach(freshDB)

describe('getDB', () => {
  it('yields to another tab opening a newer version, then reopens on the next call', async () => {
    const first = await getDB()
    const blocked = vi.fn()

    const newer = await openDB(DB.name, DB.version + 1, { blocked })

    expect(blocked).not.toHaveBeenCalled()
    newer.close()
    // The cached connection was dropped, so the next call opens a new one, not the closed one.
    await freshDB()
    const second = await getDB()
    expect(second).not.toBe(first)
    expect(await second.get('meta', 'owner')).toBeUndefined()
  })
})

const T1 = '2026-01-01T00:00:00.000Z'
const T2 = '2026-02-01T00:00:00.000Z'

function restaurant(id: string, rollup: Partial<Restaurant>): Restaurant {
  return {
    id,
    name: id,
    lat: 1,
    lng: 1,
    pending: false,
    latestVerdict: null,
    latestVisitDate: null,
    visitCount: 0,
    updated: T1,
    deleted: false,
    ...rollup,
  }
}

/** Leaves a v2 database behind, as an old client that stored an unknown date as `''` would. */
async function seedV2Store(restaurants: Restaurant[], visits: unknown[]): Promise<void> {
  const v2 = await openDB(DB.name, 2, {
    upgrade(db) {
      db.createObjectStore('restaurants', { keyPath: 'id' })
      const store = db.createObjectStore('visits', { keyPath: 'id' })
      store.createIndex('by-restaurant', 'restaurantId')
      db.createObjectStore('meta')
    },
  })
  for (const r of restaurants) await v2.put('restaurants', r)
  for (const v of visits) await v2.put('visits', v)
  v2.close()
}

describe('v3 upgrade', () => {
  it('rewrites an empty visit date as null and recomputes that restaurant’s rollup', async () => {
    // The old comparator read '' as a dated visit, so it beat the newer undated one.
    const stale = restaurant('r1', {
      latestVerdict: 'go_back',
      latestVisitDate: '',
      visitCount: 2,
    })
    const untouched = restaurant('r2', { visitCount: 99 })
    await seedV2Store(
      [stale, untouched],
      [
        { id: 'v1', restaurantId: 'r1', date: '', verdict: 'go_back', updated: T1, deleted: false },
        {
          id: 'v2',
          restaurantId: 'r1',
          date: null,
          verdict: 'never_again',
          updated: T2,
          deleted: false,
        },
      ],
    )

    const db = await getDB()

    const repaired = (await db.get('visits', 'v1')) as Visit
    expect(repaired.date).toBeNull()
    expect(repaired.updated).toBe(T1)
    const r1 = await db.get('restaurants', 'r1')
    expect(r1).toMatchObject(rollupOf(await db.getAllFromIndex('visits', 'by-restaurant', 'r1')))
    expect(r1).toMatchObject({ latestVerdict: 'never_again', latestVisitDate: null, visitCount: 2 })
    expect(r1?.updated).toBe(T1)
    // A restaurant with no '' visit is not rewritten, even with a stale rollup.
    expect((await db.get('restaurants', 'r2'))?.visitCount).toBe(99)
  })
})
