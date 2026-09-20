import { beforeEach, describe, it, expect } from 'vitest'
import { freshDB } from '../../test/idb'
import { applyImport, parseImport } from './import'
import { exportCollection } from './export'
import {
  createRestaurant,
  getRestaurant,
  allRestaurants,
  allRestaurantsForSync,
} from '../../data/restaurants'
import { createVisit } from '../../data/visits'
import type { ImportRecords } from './schema'
import type { Restaurant, Visit } from '../../types/models'

function restaurant(over: Partial<Restaurant> & Pick<Restaurant, 'id' | 'updated'>): Restaurant {
  return {
    name: 'R',
    lat: 1,
    lng: 2,
    pending: false,
    latestVerdict: null,
    latestVisitDate: null,
    visitCount: 0,
    deleted: false,
    ...over,
  }
}
function visit(over: Partial<Visit> & Pick<Visit, 'id' | 'restaurantId' | 'updated'>): Visit {
  return { date: '2026-01-01', verdict: 'go_back', deleted: false, ...over }
}
function records(over: Partial<ImportRecords> = {}): ImportRecords {
  return { restaurants: [], visits: [], ...over }
}

beforeEach(freshDB)

describe('applyImport', () => {
  it('re-importing an export of the same store changes nothing (AE2)', async () => {
    const r = await createRestaurant({ name: 'Chez Marcel', lat: 48, lng: 2, cuisine: 'French' })
    await createVisit({ restaurantId: r.id, date: '2026-05-01', verdict: 'go_back' })

    const env = await exportCollection()
    const parsed = parseImport(JSON.stringify(env))
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return

    const before = await allRestaurantsForSync()
    const counts = await applyImport(parsed.records)

    expect(counts.added).toBe(0)
    expect(counts.updated).toBe(0)
    expect(counts.unchanged).toBe(2) // 1 restaurant + 1 visit
    expect(await allRestaurantsForSync()).toEqual(before)
  })

  it('adds records missing from the store (AE2)', async () => {
    const counts = await applyImport(
      records({
        restaurants: [restaurant({ id: 'r1', name: 'Imported', updated: '2026-05-01T00:00:00Z' })],
        visits: [visit({ id: 'v1', restaurantId: 'r1', updated: '2026-05-01T00:00:00Z' })],
      }),
    )
    expect(counts.added).toBe(2)
    const r = await getRestaurant('r1')
    expect(r?.name).toBe('Imported')
  })

  it('last-write-wins: newer file record overwrites, older is ignored', async () => {
    const r = await createRestaurant({ id: 'r1', name: 'Local' })
    // file has a NEWER version
    await applyImport(
      records({
        restaurants: [restaurant({ id: 'r1', name: 'Newer', updated: '2099-01-01T00:00:00Z' })],
      }),
    )
    expect((await getRestaurant('r1'))?.name).toBe('Newer')

    // file has an OLDER version -> ignored, local 'Newer' kept
    const counts = await applyImport(
      records({
        restaurants: [restaurant({ id: 'r1', name: 'Older', updated: '2000-01-01T00:00:00Z' })],
      }),
    )
    expect((await getRestaurant('r1'))?.name).toBe('Newer')
    expect(counts.unchanged).toBe(1)
    void r
  })

  it('propagates a newer tombstone without resurrecting or duplicating', async () => {
    await createRestaurant({ id: 'r1', name: 'Live' })
    await applyImport(
      records({
        restaurants: [
          restaurant({ id: 'r1', name: 'Live', updated: '2099-01-01T00:00:00Z', deleted: true }),
        ],
      }),
    )

    // Live list excludes it; the sync view shows exactly one tombstone (no resurrect / no dupe).
    expect((await allRestaurants()).some((x) => x.id === 'r1')).toBe(false)
    const tomb = (await allRestaurantsForSync()).filter((x) => x.id === 'r1')
    expect(tomb).toHaveLength(1)
    expect(tomb[0].deleted).toBe(true)
  })

  it('recomputes the rollup for a restaurant whose visits were imported, without bumping its updated', async () => {
    const r = await createRestaurant({ id: 'r1', name: 'Host' })
    const originalUpdated = (await getRestaurant('r1'))!.updated

    await applyImport(
      records({
        visits: [
          visit({
            id: 'v1',
            restaurantId: 'r1',
            verdict: 'go_back',
            date: '2026-05-01',
            updated: '2026-05-01T00:00:00Z',
          }),
        ],
      }),
    )

    const after = await getRestaurant('r1')
    expect(after?.visitCount).toBe(1)
    expect(after?.latestVerdict).toBe('go_back')
    expect(after?.updated).toBe(originalUpdated) // rollup never bumps updated
    void r
  })

  it('reports added/updated/unchanged correctly for a mixed import', async () => {
    // createRestaurant stamps updated=now(); the file timestamps below bracket it (far past / future)
    // so the file wins one and loses the other deterministically regardless of the wall clock.
    await createRestaurant({ id: 'r-updated', name: 'Local' })
    await createRestaurant({ id: 'r-stale', name: 'Local newer' })

    const counts = await applyImport(
      records({
        restaurants: [
          restaurant({ id: 'r-new', name: 'Brand new', updated: '2026-05-01T00:00:00Z' }), // added
          restaurant({ id: 'r-updated', name: 'Newer', updated: '2099-01-01T00:00:00Z' }), // file wins -> updated
          restaurant({ id: 'r-stale', name: 'Older file', updated: '2000-01-01T00:00:00Z' }), // local wins -> unchanged
        ],
      }),
    )

    expect(counts).toEqual({ added: 1, updated: 1, unchanged: 1 })
    expect((await getRestaurant('r-updated'))?.name).toBe('Newer')
    expect((await getRestaurant('r-stale'))?.name).toBe('Local newer')
  })

  it('re-derives the rollup from local visits when an imported restaurant row wins but its visits are unchanged', async () => {
    // Local r1 has 2 visits the file does not know about.
    const local = await createRestaurant({ id: 'r1', name: 'Bistro' })
    await createVisit({ restaurantId: 'r1', date: '2026-05-01', verdict: 'go_back' })
    await createVisit({ restaurantId: 'r1', date: '2026-05-02', verdict: 'worth_a_detour' })
    expect((await getRestaurant('r1'))?.visitCount).toBe(2)

    // File carries a NEWER r1 row whose serialized rollup is stale (0 visits), and no visits for r1.
    await applyImport(
      records({
        restaurants: [
          restaurant({
            id: 'r1',
            name: 'Bistro renamed',
            updated: '2099-01-01T00:00:00Z',
            visitCount: 0,
            latestVerdict: null,
            latestVisitDate: null,
          }),
        ],
      }),
    )

    const after = await getRestaurant('r1')
    expect(after?.name).toBe('Bistro renamed') // row won LWW (content updated)
    expect(after?.visitCount).toBe(2) // rollup re-derived from the 2 local visits, NOT the file's 0
    expect(after?.latestVerdict).toBe('worth_a_detour') // latest local visit
    void local
  })

  it('never deletes a local record the file does not tombstone', async () => {
    await createRestaurant({ id: 'keep', name: 'Keep' })
    await applyImport(
      records({
        restaurants: [restaurant({ id: 'other', name: 'Other', updated: '2026-05-01T00:00:00Z' })],
      }),
    )
    expect((await allRestaurants()).map((x) => x.id).sort()).toEqual(['keep', 'other'])
  })
})
