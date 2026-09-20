import { describe, it, expect } from 'vitest'
import {
  activeFilterCount,
  emptyFilter,
  isEmptyFilter,
  matches,
  withToggled,
  UNCATEGORIZED,
} from './filter'
import type { Restaurant, Verdict } from '../../types/models'

function r(over: Partial<Restaurant> & Pick<Restaurant, 'id'>): Restaurant {
  return {
    name: 'R',
    lat: 1,
    lng: 2,
    pending: false,
    latestVerdict: null,
    latestVisitDate: null,
    visitCount: 0,
    updated: '1',
    deleted: false,
    ...over,
  }
}

describe('matches', () => {
  it('an empty filter matches everything', () => {
    expect(matches(r({ id: 'a' }), emptyFilter())).toBe(true)
    expect(matches(r({ id: 'b', cuisine: 'Thai', visitCount: 3 }), emptyFilter())).toBe(true)
  })

  it('ORs within a facet and ANDs across facets (AE3)', () => {
    // cuisine = Indian OR Thai AND status = to-try (filter cuisines are stored lowercased)
    const filter = {
      ...emptyFilter(),
      cuisines: new Set(['indian', 'thai']),
      statuses: new Set(['to_try' as const]),
    }

    expect(matches(r({ id: 'thai-totry', cuisine: 'Thai' }), filter)).toBe(true)
    expect(matches(r({ id: 'indian-totry', cuisine: 'Indian' }), filter)).toBe(true)
    // right cuisine but visited -> fails the status facet
    expect(matches(r({ id: 'thai-visited', cuisine: 'Thai', visitCount: 2 }), filter)).toBe(false)
    // to-try but wrong cuisine -> fails the cuisine facet
    expect(matches(r({ id: 'french-totry', cuisine: 'French' }), filter)).toBe(false)
  })

  it('matches cuisine case-insensitively (place casing varies; filter stores lowercase)', () => {
    const filter = { ...emptyFilter(), cuisines: new Set(['french']) }
    expect(matches(r({ id: 'a', cuisine: 'french' }), filter)).toBe(true)
    expect(matches(r({ id: 'b', cuisine: 'French' }), filter)).toBe(true)
    expect(matches(r({ id: 'c', cuisine: 'FRENCH' }), filter)).toBe(true)
  })

  it('filters on the latest verdict, excluding places without one', () => {
    const filter = { ...emptyFilter(), verdicts: new Set<Verdict>(['go_back']) }
    expect(matches(r({ id: 'a', latestVerdict: 'go_back' }), filter)).toBe(true)
    expect(matches(r({ id: 'b', latestVerdict: 'never_again' }), filter)).toBe(false)
    expect(matches(r({ id: 'c', latestVerdict: null }), filter)).toBe(false)
  })

  it('an uncategorized place matches only when no cuisine filter, or the uncategorized chip, is active', () => {
    const place = r({ id: 'a' }) // no cuisine
    expect(matches(place, emptyFilter())).toBe(true)
    expect(matches(place, { ...emptyFilter(), cuisines: new Set(['french']) })).toBe(false)
    expect(matches(place, { ...emptyFilter(), cuisines: new Set([UNCATEGORIZED]) })).toBe(true)
    // a categorized place does NOT match the uncategorized chip
    expect(
      matches(r({ id: 'b', cuisine: 'French' }), {
        ...emptyFilter(),
        cuisines: new Set([UNCATEGORIZED]),
      }),
    ).toBe(false)
  })
})

describe('withToggled / isEmptyFilter', () => {
  it('toggles a value in and back out without mutating the input', () => {
    const base = new Set(['French'])
    const added = withToggled(base, 'Thai')
    expect([...added].sort()).toEqual(['French', 'Thai'])
    expect([...base]).toEqual(['French']) // input untouched
    expect([...withToggled(added, 'French')]).toEqual(['Thai'])
  })

  it('reports empty vs active filters', () => {
    expect(isEmptyFilter(emptyFilter())).toBe(true)
    expect(isEmptyFilter({ ...emptyFilter(), statuses: new Set(['visited' as const]) })).toBe(false)
  })
})

describe('activeFilterCount', () => {
  it('is 0 for an empty filter', () => {
    expect(activeFilterCount(emptyFilter())).toBe(0)
  })

  it('counts one active cuisine as 1', () => {
    expect(activeFilterCount({ ...emptyFilter(), cuisines: new Set(['thai']) })).toBe(1)
  })

  it('sums active selections across cuisines, statuses, and verdicts', () => {
    const filter = {
      cuisines: new Set(['thai', 'french']),
      statuses: new Set(['to_try' as const]),
      verdicts: new Set<Verdict>(['go_back', 'never_again']),
    }
    expect(activeFilterCount(filter)).toBe(5)
  })

  it('counts the uncategorized-cuisine sentinel once, like any other cuisine entry', () => {
    expect(activeFilterCount({ ...emptyFilter(), cuisines: new Set([UNCATEGORIZED]) })).toBe(1)
  })
})
