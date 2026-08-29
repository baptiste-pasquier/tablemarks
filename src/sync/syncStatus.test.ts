import { beforeEach, describe, it, expect } from 'vitest'
import { freshDB } from '../test/idb'
import { createRestaurant, markRestaurantSynced } from '../data/restaurants'
import { createVisit, markVisitSynced } from '../data/visits'
import { getSyncStatus, onSyncStatusChange, recomputePending, setSyncState } from './syncStatus'

beforeEach(async () => {
  await freshDB()
  // Reset module state between tests (no reset export by design — drive it back via the public API).
  setSyncState('synced')
  await recomputePending()
})

describe('recomputePending', () => {
  it('counts records whose updated differs from syncedUpdated (or is unset) as pending', async () => {
    const r = await createRestaurant({ name: 'A', lat: 1, lng: 1 })
    expect(await recomputePending()).toBe(1)
    expect(getSyncStatus().pendingCount).toBe(1)

    await markRestaurantSynced(r.id, r.updated)
    expect(await recomputePending()).toBe(0)
    expect(getSyncStatus().pendingCount).toBe(0)
  })

  it('counts visits too', async () => {
    const r = await createRestaurant({ name: 'A', lat: 1, lng: 1 })
    await markRestaurantSynced(r.id, r.updated)
    const v = await createVisit({ restaurantId: r.id, verdict: 'go_back' })
    expect(await recomputePending()).toBe(1)

    await markVisitSynced(v.id, v.updated)
    expect(await recomputePending()).toBe(0)
  })

  it('updates getSyncStatus().pendingCount and notifies subscribers', async () => {
    const seen: number[] = []
    const unsub = onSyncStatusChange(() => seen.push(getSyncStatus().pendingCount))

    await createRestaurant({ name: 'A', lat: 1, lng: 1 })
    await recomputePending()

    expect(seen).toContain(1)
    unsub()
  })
})

describe('setSyncState', () => {
  it('sets state and notifies subscribers', () => {
    const seen: string[] = []
    const unsub = onSyncStatusChange(() => seen.push(getSyncStatus().state))

    setSyncState('offline')
    expect(getSyncStatus().state).toBe('offline')
    expect(seen).toEqual(['offline'])
    unsub()
  })

  it('carries a cause only for the problem state, clearing it on any other transition', () => {
    setSyncState('problem', 'sign-in-needed')
    expect(getSyncStatus()).toMatchObject({ state: 'problem', cause: 'sign-in-needed' })

    setSyncState('pending')
    expect(getSyncStatus().cause).toBeUndefined()
  })

  it('unsubscribe stops further notifications', () => {
    let calls = 0
    const unsub = onSyncStatusChange(() => {
      calls++
    })
    unsub()

    setSyncState('offline')
    expect(calls).toBe(0)
  })
})
