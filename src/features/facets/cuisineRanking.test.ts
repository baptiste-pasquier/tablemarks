import { describe, expect, it } from 'vitest'
import { rankCuisines, splitRows } from './cuisineRanking'
import { CUISINE_CATALOG } from './cuisineCatalog'

const EN: Record<string, string> = {
  greek: 'Greek',
  ice_cream: 'Ice cream',
  french: 'French',
  bakery: 'Bakery',
}
const FR: Record<string, string> = {
  greek: 'Grec',
  ice_cream: 'Glacier',
  french: 'Français',
  bakery: 'Boulangerie',
}
const labelIn = (table: Record<string, string>) => (value: string) => table[value] ?? value

const places = (...cuisines: Array<string | undefined>) => cuisines.map((cuisine) => ({ cuisine }))

describe('rankCuisines', () => {
  it('orders used categories by place count, most first', () => {
    const ranked = rankCuisines(places('french', 'bakery', 'bakery'), labelIn(EN), 'en', false)
    expect(ranked.map((c) => [c.key, c.count])).toEqual([
      ['bakery', 2],
      ['french', 1],
    ])
  })

  it('breaks ties on the translated label, in the display language', () => {
    const data = places('greek', 'ice_cream')
    expect(rankCuisines(data, labelIn(EN), 'en', false).map((c) => c.label)).toEqual([
      'Greek',
      'Ice cream',
    ])
    expect(rankCuisines(data, labelIn(FR), 'fr', false).map((c) => c.label)).toEqual([
      'Glacier',
      'Grec',
    ])
  })

  it('folds legacy names and label variants into their curated key', () => {
    const ranked = rankCuisines(places('French', 'french', 'Français'), labelIn(EN), 'en', false)
    expect(ranked).toEqual([{ key: 'french', value: 'french', label: 'French', count: 3 }])
  })

  it('folds custom names that differ only by case or accents, keeping the first spelling', () => {
    const ranked = rankCuisines(
      places('Éthiopien', 'ethiopien', 'ETHIOPIEN'),
      labelIn(EN),
      'en',
      false,
    )
    expect(ranked).toEqual([{ key: 'ethiopien', value: 'Éthiopien', label: 'Éthiopien', count: 3 }])
  })

  it('skips places with no category', () => {
    expect(rankCuisines(places(undefined, '  '), labelIn(EN), 'en', false)).toEqual([])
  })

  it('appends every unused curated category, alphabetically, only when asked', () => {
    const ranked = rankCuisines(places('bakery'), labelIn(EN), 'en', true)
    expect(ranked).toHaveLength(CUISINE_CATALOG.length)
    expect(ranked[0]).toMatchObject({ key: 'bakery', count: 1 })
    const unused = ranked.slice(1)
    expect(unused.every((c) => c.count === 0)).toBe(true)
    expect(unused.map((c) => c.label)).toEqual(
      [...unused.map((c) => c.label)].sort((a, b) => a.localeCompare(b, 'en')),
    )
  })
})

describe('splitRows', () => {
  const ranked = ['a', 'b', 'c', 'd', 'e'].map((key) => ({ key }))
  const keys = (items: Array<{ key: string }>) => items.map((i) => i.key)

  it('shows the first `size` entries and overflows the rest', () => {
    const { visible, overflow } = splitRows(ranked, new Set(), 3)
    expect(keys(visible)).toEqual(['a', 'b', 'c'])
    expect(keys(overflow)).toEqual(['d', 'e'])
  })

  it('pins a selected entry into the visible row, bumping the lowest-ranked unpinned one', () => {
    const { visible, overflow } = splitRows(ranked, new Set(['e']), 3)
    expect(keys(visible)).toEqual(['a', 'b', 'e'])
    expect(keys(overflow)).toEqual(['c', 'd'])
  })

  it('grows the row when more entries are pinned than fit', () => {
    const { visible, overflow } = splitRows(ranked, new Set(['a', 'c', 'd', 'e']), 3)
    expect(keys(visible)).toEqual(['a', 'c', 'd', 'e'])
    expect(keys(overflow)).toEqual(['b'])
  })
})
