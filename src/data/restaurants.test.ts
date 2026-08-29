import { beforeEach, describe, it, expect } from 'vitest'
import { freshDB } from '../test/idb'
import {
  createRestaurant,
  updateRestaurant,
  removeRestaurant,
  getRestaurant,
  allRestaurants,
  allRestaurantsForSync,
  markRestaurantSynced,
} from './restaurants'
import { createVisit, visitsForRestaurant } from './visits'
import { statusOf } from '../types/models'

beforeEach(freshDB)

describe('restaurant repository', () => {
  it('stamps a stable id, updated, and defaults on create', async () => {
    const r = await createRestaurant({ name: 'Chez Marcel', lat: 48.85, lng: 2.35 })
    expect(r.id).toMatch(/^[a-z0-9]{15}$/)
    expect(r.updated).not.toBe('')
    expect(r.deleted).toBe(false)
    expect(r.visitCount).toBe(0)
    expect(r.pending).toBe(false)
    expect(await getRestaurant(r.id)).toEqual(r)
  })

  it('bumps updated on edit', async () => {
    const r = await createRestaurant({ name: 'Old', lat: 1, lng: 1 })
    const after = await updateRestaurant(r.id, { name: 'New', cuisine: 'French' })
    expect(after.name).toBe('New')
    expect(after.cuisine).toBe('French')
    expect(after.updated >= r.updated).toBe(true)
  })

  it('excludes soft-deleted restaurants from the live list', async () => {
    const a = await createRestaurant({ name: 'A', lat: 1, lng: 1 })
    await createRestaurant({ name: 'B', lat: 2, lng: 2 })
    await removeRestaurant(a.id)
    const live = await allRestaurants()
    expect(live.map((r) => r.name)).toEqual(['B'])
    // tombstone still present for sync
    expect((await getRestaurant(a.id))?.deleted).toBe(true)
  })

  it('tombstones a restaurant and all of its visits on remove', async () => {
    const r = await createRestaurant({ name: 'Has visits', lat: 1, lng: 1 })
    await createVisit({ restaurantId: r.id, verdict: 'go_back' })
    await createVisit({ restaurantId: r.id, verdict: 'worth_a_detour' })

    await removeRestaurant(r.id)

    expect((await getRestaurant(r.id))?.deleted).toBe(true)
    expect(await visitsForRestaurant(r.id)).toEqual([])
  })

  it('derives status from visit count', async () => {
    const r = await createRestaurant({ name: 'To try', lat: 1, lng: 1 })
    expect(statusOf(r)).toBe('to_try')
    await createVisit({ restaurantId: r.id, verdict: 'go_back' })
    expect(statusOf((await getRestaurant(r.id))!)).toBe('visited')
  })

  it('a newly created restaurant has no syncedUpdated and reads as pending', async () => {
    const r = await createRestaurant({ name: 'Fresh', lat: 1, lng: 1 })
    const all = await allRestaurantsForSync()
    const rec = all.find((x) => x.id === r.id)
    expect(rec?.syncedUpdated).toBeUndefined()
    expect(rec?.updated !== rec?.syncedUpdated).toBe(true)
  })

  it('markRestaurantSynced sets syncedUpdated without changing updated or other fields', async () => {
    const r = await createRestaurant({ name: 'Chez Marcel', lat: 48.85, lng: 2.35 })
    await markRestaurantSynced(r.id, r.updated)
    const after = await getRestaurant(r.id)
    expect(after?.syncedUpdated).toBe(r.updated)
    expect(after?.updated).toBe(r.updated)
    expect(after?.name).toBe(r.name)
  })

  it('allRestaurantsForSync distinguishes synced from pending records', async () => {
    const synced = await createRestaurant({ name: 'Synced', lat: 1, lng: 1 })
    const pending = await createRestaurant({ name: 'Pending', lat: 2, lng: 2 })
    await markRestaurantSynced(synced.id, synced.updated)

    const all = await allRestaurantsForSync()
    const syncedRec = all.find((x) => x.id === synced.id)
    const pendingRec = all.find((x) => x.id === pending.id)

    expect(syncedRec?.syncedUpdated).toBe(syncedRec?.updated)
    expect(pendingRec?.syncedUpdated).not.toBe(pendingRec?.updated)
  })

  it('markRestaurantSynced skips the stamp when the record changed since the caller read it (review #2)', async () => {
    // Simulates a push loop that read the record's `updated` before awaiting the network call,
    // during which a concurrent edit changed the record — the stale `syncedUpdated` no longer
    // matches, so the read-modify-write must not blindly overwrite the newer state.
    const r = await createRestaurant({ name: 'Original', lat: 1, lng: 1 })

    await markRestaurantSynced(r.id, 'stale-value-that-does-not-match-current-updated')

    const after = await getRestaurant(r.id)
    expect(after?.syncedUpdated).toBeUndefined() // stale stamp was not written
    expect(after?.updated).toBe(r.updated) // record itself untouched
    expect(after?.name).toBe('Original')
  })
})
