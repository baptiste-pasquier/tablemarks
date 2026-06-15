import { beforeEach, describe, it, expect } from 'vitest'
import { freshDB } from '../test/idb'
import { rollupOf, recomputeRollup } from './rollup'
import { createRestaurant, getRestaurant } from './restaurants'
import { createVisit, removeVisit } from './visits'
import type { Visit } from '../types/models'

beforeEach(freshDB)

function visit(date: string, verdict: Visit['verdict'], deleted = false): Visit {
  return { id: date, restaurantId: 'r', date, verdict, updated: date, deleted, needsPush: false }
}

describe('rollupOf (pure)', () => {
  it('returns nulls for no visits', () => {
    expect(rollupOf([])).toEqual({ latestVerdict: null, latestVisitDate: null, visitCount: 0 })
  })

  it('picks the latest-by-date verdict regardless of input order', () => {
    const r = rollupOf([
      visit('2025-08-20', 'go_back'),
      visit('2026-02-11', 'once_was_enough'),
      visit('2025-11-03', 'worth_a_detour'),
    ])
    expect(r).toEqual({ latestVerdict: 'once_was_enough', latestVisitDate: '2026-02-11', visitCount: 3 })
  })

  it('ignores deleted visits', () => {
    const r = rollupOf([visit('2026-02-11', 'never_again', true), visit('2025-08-20', 'go_back')])
    expect(r).toEqual({ latestVerdict: 'go_back', latestVisitDate: '2025-08-20', visitCount: 1 })
  })
})

describe('recomputeRollup (persisted)', () => {
  it('writes latest verdict + count onto the restaurant', async () => {
    const r = await createRestaurant({ name: 'X', lat: 1, lng: 1 })
    await createVisit({ restaurantId: r.id, date: '2024-01-01', verdict: 'go_back' })
    await createVisit({ restaurantId: r.id, date: '2026-06-01', verdict: 'once_was_enough' })
    const rolled = await recomputeRollup(r.id)
    expect(rolled?.visitCount).toBe(2)
    expect(rolled?.latestVerdict).toBe('once_was_enough')
    expect(rolled?.latestVisitDate).toBe('2026-06-01')
  })

  it('returns a place to to-try when its last visit is removed', async () => {
    const r = await createRestaurant({ name: 'X', lat: 1, lng: 1 })
    const v = await createVisit({ restaurantId: r.id, verdict: 'go_back' })
    expect((await getRestaurant(r.id))?.visitCount).toBe(1)
    await removeVisit(v.id)
    const after = await getRestaurant(r.id)
    expect(after?.visitCount).toBe(0)
    expect(after?.latestVerdict).toBeNull()
  })
})
