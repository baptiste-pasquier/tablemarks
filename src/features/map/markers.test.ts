import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { toMarkers, pickMostRecentRestaurantCenter } from './markers'
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

describe('pickMostRecentRestaurantCenter', () => {
  // Deterministic timezone-dependent tests stub TZ, matching src/lib/dates.test.ts's convention —
  // V8 re-resolves the local timezone from it on every Date call. 'America/Bogota' is a real,
  // DST-free UTC-5 zone.
  beforeEach(() => {
    vi.stubEnv('TZ', 'America/Bogota')
  })
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('returns null for an empty restaurant list', () => {
    expect(pickMostRecentRestaurantCenter([])).toBeNull()
  })

  it('returns null when no restaurant has an added timestamp or a visit', () => {
    const restaurants = [
      r({ id: 'a', lat: 1, lng: 1 }),
      r({ id: 'b', lat: 2, lng: 2 }),
    ]
    expect(pickMostRecentRestaurantCenter(restaurants)).toBeNull()
  })

  it('picks the restaurant added today over one visited yesterday', () => {
    const restaurants = [
      r({ id: 'added-today', lat: 1, lng: 1, added: '2026-08-30T15:00:00.000Z' }),
      r({ id: 'visited-yesterday', lat: 2, lng: 2, latestVisitDate: '2026-08-29' }),
    ]
    expect(pickMostRecentRestaurantCenter(restaurants)).toEqual({ lat: 1, lng: 1 })
  })

  it('picks the restaurant visited today over one added yesterday', () => {
    const restaurants = [
      r({ id: 'added-yesterday', lat: 1, lng: 1, added: '2026-08-29T15:00:00.000Z' }),
      r({ id: 'visited-today', lat: 2, lng: 2, latestVisitDate: '2026-08-30' }),
    ]
    expect(pickMostRecentRestaurantCenter(restaurants)).toEqual({ lat: 2, lng: 2 })
  })

  it('picks the restaurant visited today over one added earlier today, since its key is the start of the next local day', () => {
    const restaurants = [
      r({ id: 'added-earlier-today', lat: 1, lng: 1, added: '2026-08-30T10:00:00.000Z' }),
      r({ id: 'visited-today', lat: 2, lng: 2, latestVisitDate: '2026-08-30' }),
    ]
    expect(pickMostRecentRestaurantCenter(restaurants)).toEqual({ lat: 2, lng: 2 })
  })

  it('uses the true per-restaurant max of added and latestVisitDate, not an added-first chain', () => {
    // "old-added-recent-visit" was added long ago but visited today — its own visit signal must
    // win over a competitor whose only (older) signal is a more recent added timestamp.
    const restaurants = [
      r({
        id: 'old-added-recent-visit',
        lat: 1,
        lng: 1,
        added: '2020-01-01T00:00:00.000Z',
        latestVisitDate: '2026-08-30',
      }),
      r({ id: 'mid-added-no-visit', lat: 2, lng: 2, added: '2025-01-01T00:00:00.000Z' }),
    ]
    expect(pickMostRecentRestaurantCenter(restaurants)).toEqual({ lat: 1, lng: 1 })
  })

  it('breaks a tie on shared latestVisitDate by the greater updated timestamp', () => {
    const restaurants = [
      r({
        id: 'earlier-updated',
        lat: 1,
        lng: 1,
        latestVisitDate: '2026-08-30',
        updated: '2026-08-30T10:00:00.000Z',
      }),
      r({
        id: 'later-updated',
        lat: 2,
        lng: 2,
        latestVisitDate: '2026-08-30',
        updated: '2026-08-30T12:00:00.000Z',
      }),
    ]
    expect(pickMostRecentRestaurantCenter(restaurants)).toEqual({ lat: 2, lng: 2 })
  })

  it('skips a pending restaurant even when it has the most recent signal, falling back to the next-most-recent resolved one', () => {
    const restaurants = [
      r({
        id: 'pending-most-recent',
        pending: true,
        lat: null,
        lng: null,
        latestVisitDate: '2026-08-30',
      }),
      r({ id: 'resolved-older', lat: 3, lng: 3, added: '2026-08-01T00:00:00.000Z' }),
    ]
    expect(pickMostRecentRestaurantCenter(restaurants)).toEqual({ lat: 3, lng: 3 })
  })

  it('treats a synced `added: \'\'` sentinel as absent, not as a real (always-losing) key', () => {
    // `added: ''` is a deliberate "absent" state reachable after a PocketBase field-retype sync
    // (see sync/portability/schema.ts's isOptionalTimestamp) — it must not shadow a real
    // latestVisitDate signal on the same restaurant.
    const restaurants = [
      r({ id: 'synced-empty-added-recent-visit', lat: 1, lng: 1, added: '', latestVisitDate: '2026-08-30' }),
      r({ id: 'older-added', lat: 2, lng: 2, added: '2026-08-01T00:00:00.000Z' }),
    ]
    expect(pickMostRecentRestaurantCenter(restaurants)).toEqual({ lat: 1, lng: 1 })
  })

  it('returns null when the only restaurant with a signal is pending', () => {
    const restaurants = [
      r({
        id: 'pending-only-signal',
        pending: true,
        lat: null,
        lng: null,
        latestVisitDate: '2026-08-30',
      }),
      r({ id: 'resolved-no-signal', lat: 3, lng: 3 }),
    ]
    expect(pickMostRecentRestaurantCenter(restaurants)).toBeNull()
  })
})
