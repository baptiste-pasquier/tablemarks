import { describe, it, expect } from 'vitest'
import { findNearMatch } from './dedup'
import type { Restaurant } from '../types/models'

function r(over: Partial<Restaurant> & Pick<Restaurant, 'id'>): Restaurant {
  return {
    name: 'R',
    lat: 48.8566,
    lng: 2.3522,
    pending: false,
    latestVerdict: null,
    latestVisitDate: null,
    visitCount: 0,
    updated: '1',
    deleted: false,
    ...over,
  }
}

describe('findNearMatch', () => {
  it('matches the same Maps link', () => {
    const existing = [r({ id: 'a', mapsUrl: 'https://maps.app.goo.gl/x', lat: 0, lng: 0 })]
    const match = findNearMatch(
      { lat: 10, lng: 10, mapsUrl: 'https://maps.app.goo.gl/x' },
      existing,
    )
    expect(match?.id).toBe('a')
  })

  it('matches a point within ~50m', () => {
    const existing = [r({ id: 'a', lat: 48.8566, lng: 2.3522 })]
    // ~11m north
    const match = findNearMatch({ lat: 48.8567, lng: 2.3522 }, existing)
    expect(match?.id).toBe('a')
  })

  it('does not match a far-away point', () => {
    const existing = [r({ id: 'a', lat: 48.8566, lng: 2.3522 })]
    expect(findNearMatch({ lat: 40.0, lng: -3.0 }, existing)).toBeNull()
  })

  it('ignores tombstoned records', () => {
    const existing = [r({ id: 'a', lat: 48.8566, lng: 2.3522, deleted: true })]
    expect(findNearMatch({ lat: 48.8566, lng: 2.3522 }, existing)).toBeNull()
  })

  it('matches the same OSM object even far from any saved position', () => {
    const saved = r({ id: 'a', lat: 0, lng: 0, osm: { type: 'node', id: 7, checkedAt: 'x' } })
    expect(findNearMatch({ lat: 45, lng: 4, osm: { type: 'node', id: 7 } }, [saved])?.id).toBe('a')
    expect(findNearMatch({ lat: 45, lng: 4, osm: { type: 'way', id: 7 } }, [saved])).toBeNull()
  })
})
