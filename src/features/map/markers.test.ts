import { describe, it, expect } from 'vitest'
import { toMarkers } from './markers'
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
  it('includes resolved restaurants and labels them with the rollup', () => {
    const markers = toMarkers([
      r({ id: 'a', name: 'A', lat: 48, lng: 2, visitCount: 2, latestVerdict: 'go_back' }),
    ])
    expect(markers).toEqual([{ id: 'a', lat: 48, lng: 2, name: 'A', label: 'Go back · 2 visits' }])
  })

  it('skips provisional records and ones without coordinates', () => {
    const markers = toMarkers([
      r({ id: 'pending', pending: true }),
      r({ id: 'nocoord', lat: null, lng: null }),
      r({ id: 'ok', lat: 10, lng: 20 }),
    ])
    expect(markers.map((m) => m.id)).toEqual(['ok'])
  })
})
