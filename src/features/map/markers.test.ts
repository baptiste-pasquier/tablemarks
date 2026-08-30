import { describe, it, expect } from 'vitest'
import { toMarkers } from './markers'
import { colorForCuisine } from '../facets/cuisines'
import { emptyFilter } from '../facets/filter'
import type { Restaurant } from '../../types/models'

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

describe('toMarkers', () => {
  it('carries pending, visitCount, latestVerdict, and cuisine through unchanged', () => {
    const markers = toMarkers([
      r({
        id: 'a',
        name: 'A',
        lat: 48,
        lng: 2,
        visitCount: 2,
        latestVerdict: 'go_back',
        cuisine: 'French',
      }),
    ])
    expect(markers).toEqual([
      {
        id: 'a',
        lat: 48,
        lng: 2,
        name: 'A',
        pending: false,
        visitCount: 2,
        latestVerdict: 'go_back',
        cuisine: 'French',
        color: colorForCuisine('French'),
        dimmed: false,
      },
    ])
  })

  it('produces a null latestVerdict for a to-try restaurant (visitCount: 0)', () => {
    const markers = toMarkers([r({ id: 'a', visitCount: 0, latestVerdict: null })])
    expect(markers[0].visitCount).toBe(0)
    expect(markers[0].latestVerdict).toBeNull()
  })

  it('leaves cuisine unset when the restaurant has none, rather than synthesizing a default', () => {
    const markers = toMarkers([r({ id: 'a' })])
    expect(markers[0].cuisine).toBeUndefined()
  })

  it('flags non-matching markers dimmed but still places them (R9)', () => {
    const filter = { ...emptyFilter(), cuisines: new Set(['french']) }
    const markers = toMarkers(
      [r({ id: 'a', cuisine: 'French' }), r({ id: 'b', cuisine: 'Thai' })],
      filter,
    )
    expect(markers.map((m) => m.id)).toEqual(['a', 'b']) // both still placed
    expect(markers.find((m) => m.id === 'a')!.dimmed).toBe(false)
    expect(markers.find((m) => m.id === 'b')!.dimmed).toBe(true)
  })

  it('colors markers by cuisine, neutral when uncategorized', () => {
    const markers = toMarkers([r({ id: 'a', cuisine: 'French' }), r({ id: 'b' })])
    expect(markers.find((m) => m.id === 'a')!.color).toBe(colorForCuisine('French'))
    expect(markers.find((m) => m.id === 'b')!.color).toBe(colorForCuisine(undefined))
  })

  it('skips provisional records and ones without coordinates', () => {
    const markers = toMarkers([
      r({ id: 'pending', pending: true }),
      r({ id: 'nocoord', lat: null, lng: null }),
      r({ id: 'ok', lat: 10, lng: 20 }),
    ])
    expect(markers.map((m) => m.id)).toEqual(['ok'])
  })

  it('always produces pending: false, since pending restaurants are filtered out beforehand', () => {
    const markers = toMarkers([
      r({ id: 'a', pending: false }),
      r({ id: 'b', pending: true }),
    ])
    expect(markers.map((m) => m.id)).toEqual(['a'])
    expect(markers.every((m) => m.pending === false)).toBe(true)
  })
})
