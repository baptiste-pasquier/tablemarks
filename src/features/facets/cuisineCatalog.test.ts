import { beforeAll, describe, expect, it } from 'vitest'
import i18next, { type TFunction } from 'i18next'
import {
  CUISINE_CATALOG,
  FAMILY_HUES,
  cuisineLabel,
  normalizeCuisineText,
  resolveCuisine,
  storedCuisine,
} from './cuisineCatalog'
import { resources } from '../../i18n/resources'

async function translator(lng: 'en' | 'fr'): Promise<TFunction> {
  const instance = i18next.createInstance()
  await instance.init({ resources, lng, fallbackLng: 'en', interpolation: { escapeValue: false } })
  return instance.t
}

let en: TFunction
let fr: TFunction
beforeAll(async () => {
  en = await translator('en')
  fr = await translator('fr')
})

describe('the category catalog', () => {
  it('holds 24 unique OSM-style keys, each with its own emoji and a known family', () => {
    expect(CUISINE_CATALOG).toHaveLength(24)
    const keys = CUISINE_CATALOG.map((e) => e.key)
    expect(new Set(keys).size).toBe(24)
    expect(new Set(CUISINE_CATALOG.map((e) => e.emoji)).size).toBe(24)
    for (const entry of CUISINE_CATALOG) {
      expect(entry.key).toMatch(/^[a-z_]+$/)
      expect(FAMILY_HUES[entry.family]).toBeTypeOf('number')
    }
  })

  it('has a non-empty label for every key in every language', () => {
    for (const { translation } of Object.values(resources)) {
      for (const entry of CUISINE_CATALOG) {
        expect(translation.categories[entry.key]).toBeTruthy()
      }
    }
  })

  it('never lets one normalized label point at two different keys', () => {
    const owner = new Map<string, string>()
    for (const { translation } of Object.values(resources)) {
      for (const entry of CUISINE_CATALOG) {
        for (const alias of [entry.key, translation.categories[entry.key]]) {
          const n = normalizeCuisineText(alias)
          expect(owner.get(n) ?? entry.key).toBe(entry.key)
          owner.set(n, entry.key)
        }
      }
    }
  })
})

describe('resolveCuisine', () => {
  it.each([
    ['bakery', 'bakery'],
    ['Bakery', 'bakery'],
    ['BOULANGERIE', 'bakery'],
    ['  boulangerie ', 'bakery'],
    ['Crêperie', 'crepe'],
    ['creperie', 'crepe'],
    ['CREPE', 'crepe'],
    ['Café', 'coffee_shop'],
    ['cafe', 'coffee_shop'],
    ['coffee_shop', 'coffee_shop'],
    ['Coffee shop', 'coffee_shop'],
    ['coffee shop', 'coffee_shop'],
    ['ice_cream', 'ice_cream'],
    ['Ice cream', 'ice_cream'],
    ['ice  cream', 'ice_cream'],
    ['Glacier', 'ice_cream'],
    ['Thaï', 'thai'],
  ])('resolves %j to the curated key %s', (input, key) => {
    expect(resolveCuisine(input)).toMatchObject({ kind: 'curated', key })
  })

  it('resolves every name the previous curated list stored, so no migration is needed', () => {
    const legacy: Record<string, string> = {
      Pizza: 'pizza',
      Indian: 'indian',
      Burger: 'burger',
      Mexican: 'mexican',
      Italian: 'italian',
      Korean: 'korean',
      Vietnamese: 'vietnamese',
      French: 'french',
      Thai: 'thai',
      Japanese: 'japanese',
      Chinese: 'chinese',
      Café: 'coffee_shop',
    }
    for (const [stored, key] of Object.entries(legacy)) {
      expect(resolveCuisine(stored)).toMatchObject({ kind: 'curated', key })
    }
  })

  it('keeps anything else custom, keyed by its normalized form and labelled as typed', () => {
    expect(resolveCuisine('Tex-Mex')).toEqual({ kind: 'custom', key: 'tex-mex', label: 'Tex-Mex' })
    expect(resolveCuisine('  Éthiopien ')).toEqual({
      kind: 'custom',
      key: 'ethiopien',
      label: 'Éthiopien',
    })
    expect(resolveCuisine('ETHIOPIEN')?.key).toBe('ethiopien')
  })

  it('does not treat Object.prototype members as curated', () => {
    for (const name of ['constructor', '__proto__', 'hasOwnProperty']) {
      expect(resolveCuisine(name)?.kind).toBe('custom')
    }
  })

  it('returns null for no category', () => {
    expect(resolveCuisine(undefined)).toBeNull()
    expect(resolveCuisine(null)).toBeNull()
    expect(resolveCuisine('')).toBeNull()
    expect(resolveCuisine('   ')).toBeNull()
  })
})

describe('storedCuisine', () => {
  it('stores the curated key for a known name in either language', () => {
    expect(storedCuisine('Boulangerie')).toBe('bakery')
    expect(storedCuisine('Bakery')).toBe('bakery')
    expect(storedCuisine('glacier')).toBe('ice_cream')
  })

  it('stores a custom name trimmed, as typed, and nothing for a blank one', () => {
    expect(storedCuisine('  Tex-Mex ')).toBe('Tex-Mex')
    expect(storedCuisine('   ')).toBeUndefined()
  })
})

describe('cuisineLabel', () => {
  it('labels a curated category in the display language, legacy values included', () => {
    expect(cuisineLabel('bakery', en)).toBe('Bakery')
    expect(cuisineLabel('bakery', fr)).toBe('Boulangerie')
    expect(cuisineLabel('French', fr)).toBe('Français')
    expect(cuisineLabel('coffee_shop', en)).toBe('Café')
  })

  it('shows a custom category as typed, and uncategorized when there is none', () => {
    expect(cuisineLabel(' Tex-Mex ', fr)).toBe('Tex-Mex')
    expect(cuisineLabel(undefined, en)).toBe('Uncategorized')
    expect(cuisineLabel('  ', fr)).toBe('Non catégorisé')
  })
})
