import { beforeEach, describe, it, expect } from 'vitest'
import { freshDB } from '../test/idb'
import { createRestaurant, getRestaurant } from './restaurants'
import { createVisit, updateVisit, removeVisit, visitsForRestaurant } from './visits'

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
    const mid = await createVisit({ restaurantId: r.id, date: '2025-06-01', verdict: 'worth_a_detour' })
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
})
