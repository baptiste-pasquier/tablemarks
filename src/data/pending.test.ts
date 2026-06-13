import { beforeEach, describe, it, expect } from 'vitest'
import { freshDB } from '../test/idb'
import { isPendingPush, pendingCount } from './pending'
import {
  createRestaurant,
  updateRestaurant,
  removeRestaurant,
  getRestaurant,
  putRestaurantRaw,
} from './restaurants'
import { createVisit } from './visits'
import { recomputeRollup } from './rollup'
import { closeDB } from './db'
import type { Restaurant } from '../types/models'

function restaurant(over: Partial<Restaurant> & Pick<Restaurant, 'id'>): Restaurant {
  return {
    name: 'R',
    lat: 1,
    lng: 2,
    pending: false,
    latestVerdict: null,
    latestVisitDate: null,
    visitCount: 0,
    updated: '2026-01-01T00:00:00Z',
    deleted: false,
    ...over,
  }
}

beforeEach(freshDB)

describe('isPendingPush', () => {
  it('treats a record as pending unless explicitly marked synced (needsPush === false)', () => {
    expect(isPendingPush({ needsPush: true })).toBe(true)
    expect(isPendingPush({})).toBe(true) // absent (legacy / never-stamped) → pending
    expect(isPendingPush({ needsPush: false })).toBe(false)
  })
})

describe('needsPush marker through the data layer', () => {
  it('marks created records pending and counts them', async () => {
    const r = await createRestaurant({ name: 'A', lat: 1, lng: 1 })
    expect((await getRestaurant(r.id))?.needsPush).toBe(true)
    await createVisit({ restaurantId: r.id, verdict: 'go_back' })
    expect(await pendingCount()).toBe(2) // 1 restaurant + 1 visit
  })

  it('keeps the marker durable across a reload', async () => {
    await createRestaurant({ id: 'r1', name: 'Offline' })
    await closeDB()
    expect(await pendingCount()).toBe(1)
    expect((await getRestaurant('r1'))?.needsPush).toBe(true)
  })

  it('a pulled/synced raw write (needsPush:false) is not pending', async () => {
    await putRestaurantRaw(restaurant({ id: 'r1', needsPush: false }))
    expect(await pendingCount()).toBe(0)
    expect((await getRestaurant('r1'))?.needsPush).toBe(false)
  })

  it('recomputeRollup does not change the marker', async () => {
    // simulate a synced restaurant with a synced visit pulled from remote
    await putRestaurantRaw(restaurant({ id: 'r1', needsPush: false }))
    const db = await (await import('./db')).getDB()
    await db.put('visits', { id: 'v1', restaurantId: 'r1', date: '2026-05-01', verdict: 'go_back', updated: '2026-05-01T00:00:00Z', deleted: false, needsPush: false })
    await recomputeRollup('r1')
    expect((await getRestaurant('r1'))?.needsPush).toBe(false) // rollup preserved the synced marker
    expect((await getRestaurant('r1'))?.visitCount).toBe(1)
  })

  it('flips a synced record back to pending on edit and on delete', async () => {
    await putRestaurantRaw(restaurant({ id: 'r1', name: 'Synced', needsPush: false }))
    await updateRestaurant('r1', { name: 'Edited' })
    expect((await getRestaurant('r1'))?.needsPush).toBe(true)

    await putRestaurantRaw(restaurant({ id: 'r2', name: 'Synced2', needsPush: false }))
    await removeRestaurant('r2')
    expect((await getRestaurant('r2'))?.needsPush).toBe(true) // tombstone must push
    expect((await getRestaurant('r2'))?.deleted).toBe(true)
  })
})
