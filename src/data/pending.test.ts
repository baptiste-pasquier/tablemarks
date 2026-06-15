import { beforeEach, describe, it, expect } from 'vitest'
import { openDB } from 'idb'
import { freshDB } from '../test/idb'
import { pendingCount } from './pending'
import { createRestaurant, updateRestaurant, removeRestaurant, putRestaurantRaw, getRestaurant } from './restaurants'
import { createVisit, updateVisit, removeVisit, putVisitRaw } from './visits'
import { getDB, closeDB, DB } from './db'
import type { Restaurant, Visit } from '../types/models'

beforeEach(freshDB)

describe('pendingCount', () => {
  it('created restaurant has needsPush=true and counts as 1 pending', async () => {
    const r = await createRestaurant({ name: 'Chez Marcel', lat: 48, lng: 2 })
    expect(r.needsPush).toBe(true)
    expect(await pendingCount()).toBe(1)
  })

  it('created visit has needsPush=true and counts as 1 pending (restaurant separately)', async () => {
    const r = await createRestaurant({ name: 'X', lat: 1, lng: 1 })
    const v = await createVisit({ restaurantId: r.id, verdict: 'go_back' })
    expect(v.needsPush).toBe(true)
    // restaurant + visit both pending
    expect(await pendingCount()).toBe(2)
  })

  it('a raw write with needsPush=false does not count as pending', async () => {
    const r = await createRestaurant({ name: 'Synced', lat: 1, lng: 1 })
    await putRestaurantRaw({ ...r, needsPush: false })
    expect(await pendingCount()).toBe(0)
  })

  it('AE2: pending records survive closeDB + reopen (durable outbox)', async () => {
    await createRestaurant({ name: 'Offline write', lat: 1, lng: 1 })
    await closeDB()
    // pendingCount reopens the DB via getDB()
    expect(await pendingCount()).toBe(1)
  })

  it('a pulled remote winner (needsPush=false) does not inflate the count', async () => {
    const remote: Restaurant = {
      id: 'remote01',
      name: 'Remote',
      lat: 0,
      lng: 0,
      pending: false,
      latestVerdict: null,
      latestVisitDate: null,
      visitCount: 0,
      updated: '2026-01-01T00:00:00Z',
      deleted: false,
      needsPush: false,
    }
    await putRestaurantRaw(remote)
    expect(await pendingCount()).toBe(0)
  })

  it('a pulled remote visit (needsPush=false) does not inflate the count', async () => {
    const remote: Visit = {
      id: 'v-remote',
      restaurantId: 'r1',
      date: '2026-01-01',
      verdict: 'go_back',
      updated: '2026-01-01T00:00:00Z',
      deleted: false,
      needsPush: false,
    }
    await putVisitRaw(remote)
    expect(await pendingCount()).toBe(0)
  })

  it('recomputeRollup on a synced restaurant does not flip needsPush to true', async () => {
    const r = await createRestaurant({ name: 'X', lat: 1, lng: 1 })
    // Mark restaurant as synced
    await putRestaurantRaw({ ...r, needsPush: false })
    expect(await pendingCount()).toBe(0)

    // Add a visit — triggers recomputeRollup, but should NOT flip the restaurant's needsPush
    await createVisit({ restaurantId: r.id, verdict: 'go_back' })
    const after = await getRestaurant(r.id)
    expect(after?.needsPush).toBe(false) // recomputeRollup preserved it
    expect(await pendingCount()).toBe(1) // only the visit is pending
  })

  it('an update to a synced record flips it back to needsPush=true', async () => {
    const r = await createRestaurant({ name: 'X', lat: 1, lng: 1 })
    await putRestaurantRaw({ ...r, needsPush: false })
    expect(await pendingCount()).toBe(0)

    await updateRestaurant(r.id, { name: 'Updated' })
    expect((await getRestaurant(r.id))?.needsPush).toBe(true)
    expect(await pendingCount()).toBe(1)
  })

  it('soft-deleting a synced record marks the tombstone as needsPush=true', async () => {
    const r = await createRestaurant({ name: 'X', lat: 1, lng: 1 })
    await putRestaurantRaw({ ...r, needsPush: false })
    expect(await pendingCount()).toBe(0)

    await removeRestaurant(r.id)
    // tombstone must push — count increases (restaurant tombstone is pending)
    expect(await pendingCount()).toBeGreaterThanOrEqual(1)
    const tomb = await getRestaurant(r.id)
    expect(tomb?.needsPush).toBe(true)
  })

  it('updateVisit on a synced visit flips it to needsPush=true', async () => {
    const r = await createRestaurant({ name: 'X', lat: 1, lng: 1 })
    await putRestaurantRaw({ ...r, needsPush: false })
    const v = await createVisit({ restaurantId: r.id, verdict: 'go_back' })
    await putVisitRaw({ ...v, needsPush: false })
    expect(await pendingCount()).toBe(0)

    await updateVisit(v.id, { verdict: 'never_again' })
    expect(await pendingCount()).toBe(1)
  })

  it('removeVisit on a synced visit marks its tombstone as needsPush=true', async () => {
    const r = await createRestaurant({ name: 'X', lat: 1, lng: 1 })
    await putRestaurantRaw({ ...r, needsPush: false })
    const v = await createVisit({ restaurantId: r.id, verdict: 'go_back' })
    await putVisitRaw({ ...v, needsPush: false })
    expect(await pendingCount()).toBe(0)

    await removeVisit(v.id)
    expect(await pendingCount()).toBe(1)
  })

  it('deleted records do not contribute to the pending count', async () => {
    const r = await createRestaurant({ name: 'X', lat: 1, lng: 1 })
    const v = await createVisit({ restaurantId: r.id, verdict: 'go_back' })
    // Simulate already-pushed tombstone (needsPush cleared after successful push)
    await putRestaurantRaw({ ...r, deleted: true, needsPush: false })
    await putVisitRaw({ ...v, deleted: true, needsPush: false })
    expect(await pendingCount()).toBe(0)
  })
})

describe('DB migration v1 → v2', () => {
  it('records present before v2 read back with needsPush=true after upgrade', async () => {
    // Directly open a v1 database and insert a record without needsPush
    const v1db = await openDB(DB.name, 1, {
      upgrade(db) {
        db.createObjectStore('restaurants', { keyPath: 'id' })
        const visits = db.createObjectStore('visits', { keyPath: 'id' })
        visits.createIndex('by-restaurant', 'restaurantId')
      },
    })
    // Put a record as it would have existed before v2 (no needsPush field)
    await (v1db as ReturnType<typeof openDB>).put('restaurants', {
      id: 'pre-v2-record',
      name: 'Old Restaurant',
      lat: 1,
      lng: 2,
      pending: false,
      latestVerdict: null,
      latestVisitDate: null,
      visitCount: 0,
      updated: '2026-01-01T00:00:00Z',
      deleted: false,
    })
    await (v1db as ReturnType<typeof openDB>).put('visits', {
      id: 'pre-v2-visit',
      restaurantId: 'pre-v2-record',
      date: '2026-01-01',
      verdict: 'go_back',
      updated: '2026-01-01T00:00:00Z',
      deleted: false,
    })
    v1db.close()

    // Now open via getDB() which bumps to v2 and backfills needsPush=true
    const db = await getDB()
    const r = await db.get('restaurants', 'pre-v2-record')
    const v = await db.get('visits', 'pre-v2-visit')
    expect(r?.needsPush).toBe(true)
    expect(v?.needsPush).toBe(true)
  })
})
