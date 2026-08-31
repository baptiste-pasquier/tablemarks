import { describe, it, expect } from 'vitest'
import { sortRestaurants } from './sort'
import type { Restaurant } from '../../types/models'
import type { GeoPoint } from '../../lib/geolocate'

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

const HERE: GeoPoint = { lat: 0, lng: 0 }

function ids(list: Restaurant[]): string[] {
  return list.map((x) => x.id)
}

describe('sortRestaurants — distance', () => {
  it('orders nearest-first when all items have resolved coordinates', () => {
    const far = r({ id: 'far', lat: 0, lng: 2 })
    const near = r({ id: 'near', lat: 0, lng: 0.1 })
    const mid = r({ id: 'mid', lat: 0, lng: 1 })
    const out = sortRestaurants([far, near, mid], 'distance', 'nearest', HERE)
    expect(ids(out)).toEqual(['near', 'mid', 'far'])
  })

  it('orders farthest-first when reversed', () => {
    const far = r({ id: 'far', lat: 0, lng: 2 })
    const near = r({ id: 'near', lat: 0, lng: 0.1 })
    const mid = r({ id: 'mid', lat: 0, lng: 1 })
    const out = sortRestaurants([far, near, mid], 'distance', 'farthest', HERE)
    expect(ids(out)).toEqual(['far', 'mid', 'near'])
  })

  it('trails a single coordinate-less item after every distance-ordered item, in either direction', () => {
    const near = r({ id: 'near', lat: 0, lng: 0.1 })
    const far = r({ id: 'far', lat: 0, lng: 2 })
    const noCoords = r({ id: 'no-coords', lat: null, lng: null })

    const nearestFirst = sortRestaurants([noCoords, far, near], 'distance', 'nearest', HERE)
    expect(ids(nearestFirst)).toEqual(['near', 'far', 'no-coords'])

    const farthestFirst = sortRestaurants([noCoords, far, near], 'distance', 'farthest', HERE)
    expect(ids(farthestFirst)).toEqual(['far', 'near', 'no-coords'])
  })

  it('orders several coordinate-less items among themselves most-recent-first regardless of Distance direction', () => {
    const near = r({ id: 'near', lat: 0, lng: 0.1 })
    const older = r({ id: 'older', lat: null, lng: null, added: '2020-01-01' })
    const newer = r({ id: 'newer', lat: null, lng: null, added: '2023-01-01' })

    const nearestFirst = sortRestaurants([older, near, newer], 'distance', 'nearest', HERE)
    expect(ids(nearestFirst)).toEqual(['near', 'newer', 'older'])

    // Reversing the Distance direction must NOT flip the trailing block's internal order.
    const farthestFirst = sortRestaurants([older, near, newer], 'distance', 'farthest', HERE)
    expect(ids(farthestFirst)).toEqual(['near', 'newer', 'older'])
  })

  it('behaves like the coordinate-less path when position is null or undefined, without throwing', () => {
    const a = r({ id: 'a', lat: 0, lng: 0.1, added: '2020-01-01' })
    const b = r({ id: 'b', lat: 0, lng: 2, added: '2023-01-01' })

    const withNull = sortRestaurants([a, b], 'distance', 'nearest', null)
    expect(ids(withNull)).toEqual(['b', 'a']) // most-recent-first by added, not by distance

    const withUndefined = sortRestaurants([a, b], 'distance', 'nearest', undefined)
    expect(ids(withUndefined)).toEqual(['b', 'a'])
  })
})

describe('sortRestaurants — date', () => {
  it('orders a never-visited restaurant by added and a visited one by latestVisitDate, not visit count or verdict', () => {
    const neverVisited = r({ id: 'never-visited', added: '2024-06-01', visitCount: 0 })
    const visited = r({
      id: 'visited',
      added: '2020-01-01', // older `added`, irrelevant once visited
      visitCount: 5,
      latestVisitDate: '2024-07-01',
      latestVerdict: 'never_again',
    })
    const out = sortRestaurants([neverVisited, visited], 'date', 'newest', undefined)
    expect(ids(out)).toEqual(['visited', 'never-visited'])
  })

  it('sorts a restaurant with no usable date last by default, first when reversed', () => {
    const dated = r({ id: 'dated', added: '2024-01-01' })
    const undated = r({ id: 'undated' }) // no `added`, never visited

    const mostRecentFirst = sortRestaurants([undated, dated], 'date', 'newest', undefined)
    expect(ids(mostRecentFirst)).toEqual(['dated', 'undated'])

    const oldestFirst = sortRestaurants([undated, dated], 'date', 'oldest', undefined)
    expect(ids(oldestFirst)).toEqual(['undated', 'dated'])
  })

  it('treats an unparsable added date the same as a fully absent one (sorts as oldest)', () => {
    const dated = r({ id: 'dated', added: '2024-01-01' })
    const malformed = r({ id: 'malformed', added: 'not-a-date' })

    const mostRecentFirst = sortRestaurants([malformed, dated], 'date', 'newest', undefined)
    expect(ids(mostRecentFirst)).toEqual(['dated', 'malformed'])
  })

  it('keeps two undated restaurants in their original relative order across a direction reversal (stable tie-break)', () => {
    const first = r({ id: 'first' })
    const second = r({ id: 'second' })

    const mostRecentFirst = sortRestaurants([first, second], 'date', 'newest', undefined)
    expect(ids(mostRecentFirst)).toEqual(['first', 'second'])

    const oldestFirst = sortRestaurants([first, second], 'date', 'oldest', undefined)
    expect(ids(oldestFirst)).toEqual(['first', 'second'])

    // Reversing twice returns them to where they started.
    const backToMostRecentFirst = sortRestaurants([first, second], 'date', 'newest', undefined)
    expect(ids(backToMostRecentFirst)).toEqual(['first', 'second'])
  })
})

describe('sortRestaurants — misc', () => {
  it('returns an empty array for empty input, no error', () => {
    expect(sortRestaurants([], 'distance', 'nearest', HERE)).toEqual([])
    expect(sortRestaurants([], 'date', 'newest', undefined)).toEqual([])
  })

  it('does not mutate the input array, and is idempotent across repeated calls', () => {
    const a = r({ id: 'a', lat: 0, lng: 2, added: '2020-01-01' })
    const b = r({ id: 'b', lat: 0, lng: 0.1, added: '2023-01-01' })
    const input = [a, b]
    const snapshot = [...input]

    const first = sortRestaurants(input, 'distance', 'nearest', HERE)
    expect(input).toEqual(snapshot) // input untouched
    expect(ids(input)).toEqual(['a', 'b']) // original order preserved

    const second = sortRestaurants(input, 'distance', 'nearest', HERE)
    expect(ids(second)).toEqual(ids(first))
  })
})
