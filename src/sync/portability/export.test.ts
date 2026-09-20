import { beforeEach, describe, it, expect } from 'vitest'
import { freshDB } from '../../test/idb'
import { buildExport, exportCollection } from './export'
import { EXPORT_FORMAT, EXPORT_SCHEMA_VERSION } from './schema'
import { createRestaurant, removeRestaurant } from '../../data/restaurants'
import { createVisit } from '../../data/visits'
import type { Restaurant, Visit } from '../../types/models'

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

describe('buildExport', () => {
  it('wraps records in the versioned envelope, preserving id/updated/cuisine/deleted', () => {
    const r = restaurant({ id: 'r1', cuisine: 'French', updated: '2026-02-02T00:00:00Z' })
    const v: Visit = {
      id: 'v1',
      restaurantId: 'r1',
      date: '2026-02-01',
      verdict: 'go_back',
      updated: '2026-02-01T00:00:00Z',
      deleted: false,
    }
    const env = buildExport([r], [v], '2026-06-13T00:00:00Z')

    expect(env.format).toBe(EXPORT_FORMAT)
    expect(env.schemaVersion).toBe(EXPORT_SCHEMA_VERSION)
    expect(env.exportedAt).toBe('2026-06-13T00:00:00Z')
    expect(env.records.restaurants[0]).toMatchObject({
      id: 'r1',
      cuisine: 'French',
      updated: '2026-02-02T00:00:00Z',
      deleted: false,
    })
    expect(env.records.visits[0]).toMatchObject({
      id: 'v1',
      restaurantId: 'r1',
      verdict: 'go_back',
    })
  })

  it('produces a valid empty envelope for an empty collection', () => {
    const env = buildExport([], [], '2026-06-13T00:00:00Z')
    expect(env.records.restaurants).toEqual([])
    expect(env.records.visits).toEqual([])
  })
})

describe('exportCollection', () => {
  beforeEach(freshDB)

  it('includes every restaurant and visit (AE1)', async () => {
    const r = await createRestaurant({ name: 'Chez Marcel', lat: 48, lng: 2, cuisine: 'French' })
    await createVisit({ restaurantId: r.id, date: '2026-05-01', verdict: 'go_back' })

    const env = await exportCollection()

    expect(env.records.restaurants.map((x) => x.name)).toContain('Chez Marcel')
    expect(env.records.restaurants[0].cuisine).toBe('French')
    expect(env.records.visits).toHaveLength(1)
    expect(env.records.visits[0].verdict).toBe('go_back')
    expect(typeof env.exportedAt).toBe('string')
  })

  it('includes soft-deleted tombstones for full fidelity', async () => {
    const r = await createRestaurant({ name: 'Gone', lat: 1, lng: 1 })
    await removeRestaurant(r.id)

    const env = await exportCollection()
    const tomb = env.records.restaurants.find((x) => x.id === r.id)
    expect(tomb?.deleted).toBe(true)
  })
})
