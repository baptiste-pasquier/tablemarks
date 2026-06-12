import { beforeEach, describe, it, expect } from 'vitest'
import { freshDB } from '../test/idb'
import { fullSync, type RemoteStore } from './syncEngine'
import {
  createRestaurant,
  getRestaurant,
  allRestaurants,
  allRestaurantsForSync,
} from '../data/restaurants'
import { closeDB } from '../data/db'
import type { Restaurant, Visit } from '../types/models'

class FakeRemote implements RemoteStore {
  restaurants: Restaurant[] = []
  visits: Visit[] = []
  pushedR: Restaurant[] = []

  async listRestaurants() {
    return structuredClone(this.restaurants)
  }
  async listVisits() {
    return structuredClone(this.visits)
  }
  async pushRestaurant(r: Restaurant) {
    this.pushedR.push(r)
    const i = this.restaurants.findIndex((x) => x.id === r.id)
    if (i >= 0) this.restaurants[i] = r
    else this.restaurants.push(r)
  }
  async pushVisit(v: Visit) {
    const i = this.visits.findIndex((x) => x.id === v.id)
    if (i >= 0) this.visits[i] = v
    else this.visits.push(v)
  }
}

function remoteRestaurant(over: Partial<Restaurant> & Pick<Restaurant, 'id' | 'updated'>): Restaurant {
  return {
    name: 'Remote',
    lat: 0,
    lng: 0,
    pending: false,
    latestVerdict: null,
    latestVisitDate: null,
    visitCount: 0,
    deleted: false,
    ...over,
  }
}

beforeEach(freshDB)

describe('fullSync', () => {
  it('unions local-only and remote-only records with no duplicates', async () => {
    const local = await createRestaurant({ name: 'Local', lat: 1, lng: 1 })
    const remote = new FakeRemote()
    remote.restaurants.push(remoteRestaurant({ id: 'remoteonly0001', updated: '2026-01-01T00:00:00Z' }))

    const out = await fullSync(remote)

    expect(out.restaurantsPushed).toBe(1)
    expect(remote.pushedR.map((r) => r.id)).toEqual([local.id])
    const ids = (await allRestaurantsForSync()).map((r) => r.id).sort()
    expect(ids).toEqual([local.id, 'remoteonly0001'].sort())
  })

  it('lets a newer remote version win locally', async () => {
    const local = await createRestaurant({ name: 'Old name', lat: 1, lng: 1 })
    const remote = new FakeRemote()
    remote.restaurants.push(
      remoteRestaurant({ id: local.id, name: 'New name', updated: '2999-01-01T00:00:00Z' }),
    )

    await fullSync(remote)

    expect((await getRestaurant(local.id))?.name).toBe('New name')
  })

  it('propagates a newer remote tombstone instead of resurrecting', async () => {
    const local = await createRestaurant({ name: 'Doomed', lat: 1, lng: 1 })
    const remote = new FakeRemote()
    remote.restaurants.push(
      remoteRestaurant({ id: local.id, updated: '2999-01-01T00:00:00Z', deleted: true }),
    )

    await fullSync(remote)

    expect((await getRestaurant(local.id))?.deleted).toBe(true)
    expect((await allRestaurants()).map((r) => r.id)).not.toContain(local.id)
  })

  it('is durable across a reload and idempotent on re-sync (local store is the outbox)', async () => {
    await createRestaurant({ name: 'A', lat: 1, lng: 1 })
    await createRestaurant({ name: 'B', lat: 2, lng: 2 })
    const remote = new FakeRemote()

    const first = await fullSync(remote)
    expect(first.restaurantsPushed).toBe(2)

    // Simulate a reload: drop the cached connection, reopen against the same data.
    await closeDB()
    const second = await fullSync(remote)
    expect(second.restaurantsPushed).toBe(0) // already synced, equal timestamps
    expect((await allRestaurants()).length).toBe(2)
  })
})
