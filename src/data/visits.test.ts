import { beforeEach, describe, it, expect } from 'vitest'
import { freshDB } from '../test/idb'
import { createRestaurant, getRestaurant } from './restaurants'
import {
  createVisit,
  updateVisit,
  removeVisit,
  visitsForRestaurant,
  allVisitsForSync,
  markVisitSynced,
} from './visits'

beforeEach(freshDB)

describe('visit repository', () => {
  it('defaults the date to today and links the restaurant', async () => {
    const r = await createRestaurant({ name: 'X', lat: 1, lng: 1 })
    const v = await createVisit({ restaurantId: r.id, verdict: 'go_back' })
    expect(v.restaurantId).toBe(r.id)
    expect(v.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect((await getRestaurant(r.id))?.visitCount).toBe(1)
  })

  it('lists a restaurant visits most-recent-first and excludes deleted', async () => {
    const r = await createRestaurant({ name: 'X', lat: 1, lng: 1 })
    await createVisit({ restaurantId: r.id, date: '2025-01-01', verdict: 'go_back' })
    const mid = await createVisit({
      restaurantId: r.id,
      date: '2025-06-01',
      verdict: 'worth_a_detour',
    })
    await createVisit({ restaurantId: r.id, date: '2026-01-01', verdict: 'never_again' })
    await removeVisit(mid.id)
    const dates = (await visitsForRestaurant(r.id)).map((v) => v.date)
    expect(dates).toEqual(['2026-01-01', '2025-01-01'])
  })

  it('recomputes the rollup when a visit is edited', async () => {
    const r = await createRestaurant({ name: 'X', lat: 1, lng: 1 })
    const v = await createVisit({ restaurantId: r.id, date: '2025-01-01', verdict: 'never_again' })
    await updateVisit(v.id, { verdict: 'go_back' })
    expect((await getRestaurant(r.id))?.latestVerdict).toBe('go_back')
  })

  it('a newly created visit has no syncedUpdated and reads as pending', async () => {
    const r = await createRestaurant({ name: 'X', lat: 1, lng: 1 })
    const v = await createVisit({ restaurantId: r.id, verdict: 'go_back' })
    const all = await allVisitsForSync()
    const rec = all.find((x) => x.id === v.id)
    expect(rec?.syncedUpdated).toBeUndefined()
    expect(rec?.updated !== rec?.syncedUpdated).toBe(true)
  })

  it('markVisitSynced sets syncedUpdated without changing updated or other fields', async () => {
    const r = await createRestaurant({ name: 'X', lat: 1, lng: 1 })
    const v = await createVisit({ restaurantId: r.id, verdict: 'go_back' })
    await markVisitSynced(v.id, v.updated)
    const all = await allVisitsForSync()
    const after = all.find((x) => x.id === v.id)
    expect(after?.syncedUpdated).toBe(v.updated)
    expect(after?.updated).toBe(v.updated)
    expect(after?.verdict).toBe(v.verdict)
  })

  it('markVisitSynced skips the stamp when the record changed since the caller read it (review #2)', async () => {
    const r = await createRestaurant({ name: 'X', lat: 1, lng: 1 })
    const v = await createVisit({ restaurantId: r.id, verdict: 'go_back' })

    await markVisitSynced(v.id, 'stale-value-that-does-not-match-current-updated')

    const all = await allVisitsForSync()
    const after = all.find((x) => x.id === v.id)
    expect(after?.syncedUpdated).toBeUndefined() // stale stamp was not written
    expect(after?.updated).toBe(v.updated) // record itself untouched
    expect(after?.verdict).toBe(v.verdict)
  })

  it('allVisitsForSync distinguishes synced from pending records', async () => {
    const r = await createRestaurant({ name: 'X', lat: 1, lng: 1 })
    const synced = await createVisit({ restaurantId: r.id, verdict: 'go_back' })
    const pending = await createVisit({ restaurantId: r.id, verdict: 'never_again' })
    await markVisitSynced(synced.id, synced.updated)

    const all = await allVisitsForSync()
    const syncedRec = all.find((x) => x.id === synced.id)
    const pendingRec = all.find((x) => x.id === pending.id)

    expect(syncedRec?.syncedUpdated).toBe(syncedRec?.updated)
    expect(pendingRec?.syncedUpdated).not.toBe(pendingRec?.updated)
  })
})
