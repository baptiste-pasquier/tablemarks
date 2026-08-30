import { describe, it, expect } from 'vitest'
import { toMarkers } from './markers'
import { colorForCuisine } from '../facets/cuisines'
import { emptyFilter } from '../facets/filter'
import { mockI18n } from '../../test/setup'
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
    expect(markers).toEqual([
      {
        id: 'a',
        lat: 48,
        lng: 2,
        name: 'A',
        label: 'Go back · 2 visits',
        color: colorForCuisine(undefined),
        dimmed: false,
      },
    ])
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

  it('re-translates the label when the active language changes (App.tsx\'s i18n.language memo dependency)', async () => {
    const restaurant = r({ id: 'a', name: 'A', visitCount: 2, latestVerdict: 'go_back' })

    const englishLabel = toMarkers([restaurant])[0].label
    expect(englishLabel).toBe('Go back · 2 visits')

    await mockI18n.changeLanguage('fr')
    try {
      const frenchLabel = toMarkers([restaurant])[0].label
      expect(frenchLabel).toBe("J'y retourne · 2 visites")
      expect(frenchLabel).not.toBe(englishLabel)
    } finally {
      await mockI18n.changeLanguage('en')
    }
  })
})
