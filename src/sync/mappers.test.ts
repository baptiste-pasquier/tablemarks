import { describe, it, expect } from 'vitest'
import { restaurantToRemote, restaurantFromRemote, visitToRemote, visitFromRemote } from './mappers'
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

  it('normalizes a PocketBase space-separated syncedAt to the canonical T-separated shape', () => {
    const remote = {
      ...restaurantToRemote(restaurant, 'user1'),
      syncedAt: '2026-02-01 10:00:00.000Z',
    }
    const back = restaurantFromRemote(remote)
    expect(back.updated).toBe('2026-02-01T10:00:00.000Z')
  })

  it('normalizes a PocketBase space-separated added to the canonical T-separated shape', () => {
    const remote = { ...restaurantToRemote(restaurant, 'user1'), added: '2026-01-15 09:00:00.000Z' }
    const back = restaurantFromRemote(remote)
    expect(back.added).toBe('2026-01-15T09:00:00.000Z')
  })

  it('passes an already-canonical added/syncedAt through unchanged', () => {
    const remote = restaurantToRemote({ ...restaurant, added: '2026-01-15T09:00:00.000Z' }, 'user1')
    const back = restaurantFromRemote(remote)
    expect(back.added).toBe('2026-01-15T09:00:00.000Z')
    expect(back.updated).toBe(restaurant.updated)
  })

  it('normalizes a PocketBase space-separated visit syncedAt to the canonical T-separated shape', () => {
    const remote = { ...visitToRemote(visit, 'user1'), syncedAt: '2026-02-01 10:00:00.000Z' }
    const back = visitFromRemote(remote)
    expect(back.updated).toBe('2026-02-01T10:00:00.000Z')
  })

  it('does not throw on a migration-reset empty restaurant syncedAt, passing it through unchanged', () => {
    const remote = { ...restaurantToRemote(restaurant, 'user1'), syncedAt: '' }
    expect(() => restaurantFromRemote(remote)).not.toThrow()
    const back = restaurantFromRemote(remote)
    expect(back.updated).toBe('')
  })

  it('does not throw on a migration-reset empty visit syncedAt, passing it through unchanged', () => {
    const remote = { ...visitToRemote(visit, 'user1'), syncedAt: '' }
    expect(() => visitFromRemote(remote)).not.toThrow()
    const back = visitFromRemote(remote)
    expect(back.updated).toBe('')
  })

  const osm = {
    type: 'node',
    id: 3602657896,
    checkedAt: '2026-09-19T10:00:00.000Z',
    street: '80 Rue de Charonne',
    postcode: '75011',
    city: 'Paris',
    openingHours: 'Mo 19:00-22:30; Tu-Fr 12:15-14:00,19:00-22:30',
  } as const

  it('round-trips the OSM snapshot', () => {
    const remote = restaurantToRemote({ ...restaurant, osm }, 'user1')
    expect(remote.osm).toEqual(osm)
    expect(restaurantFromRemote(remote).osm).toEqual(osm)
  })

  it('reads an empty remote JSON field (null) as no snapshot', () => {
    const remote = { ...restaurantToRemote(restaurant, 'user1'), osm: null }
    expect(restaurantFromRemote(remote).osm).toBeUndefined()
  })

  it('drops a malformed remote snapshot instead of trusting it', () => {
    const remote = { ...restaurantToRemote(restaurant, 'user1'), osm: { type: 'area', id: 'x' } }
    expect(restaurantFromRemote(remote).osm).toBeUndefined()
  })
})
