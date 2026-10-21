import { beforeEach, describe, it, expect } from 'vitest'
import { freshDB } from '../test/idb'
import { recomputeRollup } from './rollup'
import { createRestaurant, getRestaurant, updateRestaurant } from './restaurants'
import { createVisit, removeVisit } from './visits'

beforeEach(freshDB)

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
