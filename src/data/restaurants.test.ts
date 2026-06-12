import { beforeEach, describe, it, expect } from 'vitest'
import { freshDB } from '../test/idb'
import {
  createRestaurant,
  updateRestaurant,
  removeRestaurant,
  getRestaurant,
  allRestaurants,
} from './restaurants'
import { createVisit, visitsForRestaurant } from './visits'
import { statusOf } from '../types/models'

beforeEach(freshDB)

describe('restaurant repository', () => {
  it('stamps a stable id, updated, and defaults on create', async () => {
    const r = await createRestaurant({ name: 'Chez Marcel', lat: 48.85, lng: 2.35 })
    expect(r.id).toMatch(/[0-9a-f-]{36}/)
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
})
