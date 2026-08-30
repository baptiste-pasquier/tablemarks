import { describe, it, expect } from 'vitest'
import {
  restaurantToRemote,
  restaurantFromRemote,
  visitToRemote,
  visitFromRemote,
} from './mappers'
import type { Restaurant, Visit } from '../types/models'

const restaurant: Restaurant = {
  id: 'abc123def456ghi',
  name: 'Chez Marcel',
  lat: 48.85,
  lng: 2.35,
  cuisine: 'French',
  pending: false,
  latestVerdict: 'go_back',
  latestVisitDate: '2026-02-01',
  visitCount: 3,
  updated: '2026-02-01T10:00:00.000Z',
  deleted: false,
}

const visit: Visit = {
  id: 'visit0000000001',
  restaurantId: 'abc123def456ghi',
  date: '2026-02-01',
  verdict: 'go_back',
  updated: '2026-02-01T10:00:00.000Z',
  deleted: false,
}

describe('mappers', () => {
  it('renames updated->syncedAt and adds owner on push', () => {
    const remote = restaurantToRemote(restaurant, 'user1')
    expect(remote.syncedAt).toBe(restaurant.updated)
    expect(remote.owner).toBe('user1')
    expect('updated' in remote).toBe(false)
  })

  it('round-trips a restaurant back to the local shape', () => {
    const back = restaurantFromRemote(restaurantToRemote(restaurant, 'user1'))
    const { ...local } = restaurant
    expect(back).toEqual(local)
  })

  it('round-trips the added field when present', () => {
    const withAdded: Restaurant = { ...restaurant, added: '2026-01-15T09:00:00.000Z' }
    const remote = restaurantToRemote(withAdded, 'user1')
    expect(remote.added).toBe('2026-01-15T09:00:00.000Z')
    const back = restaurantFromRemote(remote)
    expect(back.added).toBe('2026-01-15T09:00:00.000Z')
  })

  it('round-trips the added field when absent', () => {
    const remote = restaurantToRemote(restaurant, 'user1')
    expect(remote.added).toBeUndefined()
    const back = restaurantFromRemote(remote)
    expect(back.added).toBeUndefined()
  })

  it('maps restaurantId<->restaurant relation for visits', () => {
    const remote = visitToRemote(visit, 'user1')
    expect(remote.restaurant).toBe(visit.restaurantId)
    const back = visitFromRemote(remote)
    expect(back).toEqual(visit)
  })
})
