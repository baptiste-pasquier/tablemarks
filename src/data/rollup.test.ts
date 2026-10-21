import { beforeEach, describe, it, expect } from 'vitest'
import { freshDB } from '../test/idb'
import { rollupOf, recomputeRollup } from './rollup'
import { createRestaurant, getRestaurant, updateRestaurant } from './restaurants'
import { createVisit, removeVisit } from './visits'
import type { Visit } from '../types/models'

beforeEach(freshDB)

function visit(
  date: string | null,
  verdict: Visit['verdict'],
  deleted = false,
  updated = date ?? '2026-01-01T00:00:00.000Z',
): Visit {
  return { id: `${date}-${updated}`, restaurantId: 'r', date, verdict, updated, deleted }
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
    expect(r).toEqual({
      latestVerdict: 'once_was_enough',
      latestVisitDate: '2026-02-11',
      visitCount: 3,
    })
  })

  it('ignores deleted visits', () => {
    const r = rollupOf([visit('2026-02-11', 'never_again', true), visit('2025-08-20', 'go_back')])
    expect(r).toEqual({ latestVerdict: 'go_back', latestVisitDate: '2025-08-20', visitCount: 1 })
  })

  it('lets a dated visit win over an undated one recorded later', () => {
    const r = rollupOf([
      visit('2024-03-01', 'go_back', false, '2024-03-01T00:00:00.000Z'),
      visit(null, 'never_again', false, '2026-10-01T00:00:00.000Z'),
    ])
    expect(r).toEqual({ latestVerdict: 'go_back', latestVisitDate: '2024-03-01', visitCount: 2 })
  })

  it('takes the most recently recorded undated visit when none is dated', () => {
    const r = rollupOf([
      visit(null, 'go_back', false, '2026-01-01T00:00:00.000Z'),
      visit(null, 'worth_a_detour', false, '2026-02-01T00:00:00.000Z'),
    ])
    expect(r).toEqual({ latestVerdict: 'worth_a_detour', latestVisitDate: null, visitCount: 2 })
  })
})

describe('recomputeRollup (persisted)', () => {
  it('falls back to the undated verdict once the only dated visit is deleted', async () => {
    const r = await createRestaurant({ name: 'X', lat: 1, lng: 1 })
    await createVisit({ restaurantId: r.id, date: null, verdict: 'once_was_enough' })
    const dated = await createVisit({ restaurantId: r.id, date: '2025-01-01', verdict: 'go_back' })
    await removeVisit(dated.id)
    const after = await getRestaurant(r.id)
    expect(after?.latestVerdict).toBe('once_was_enough')
    expect(after?.latestVisitDate).toBeNull()
    expect(after?.visitCount).toBe(1)
  })

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

  it('leaves `updated` unchanged (U2 invariant) even though it writes through the shared mutateRestaurant helper', async () => {
    // recomputeRollup is a local-derived cache, never the sync source of truth — bumping `updated`
    // here would make every device's background rollup recompute look like a new local edit and
    // break the last-write-wins sync comparison. Contrast with updateRestaurant, a real local edit,
    // which must still bump it through the same shared helper.
    const r = await createRestaurant({ name: 'X', lat: 1, lng: 1 })
    await createVisit({ restaurantId: r.id, date: '2024-01-01', verdict: 'go_back' })

    const rolled = await recomputeRollup(r.id)
    expect(rolled?.visitCount).toBe(1)
    expect(rolled?.updated).toBe(r.updated) // unchanged

    const edited = await updateRestaurant(r.id, { cuisine: 'French' })
    expect(edited.updated >= r.updated).toBe(true) // still bumps (or ties within the same ms), unlike the rollup write above
  })
})
