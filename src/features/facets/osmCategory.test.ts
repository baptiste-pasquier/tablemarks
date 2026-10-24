import { describe, expect, it } from 'vitest'
import { suggestCategory } from './osmCategory'

describe('suggestCategory', () => {
  it.each([
    [{ cuisineTag: 'french' }, 'french'],
    [{ cuisineTag: 'crepe;french;international' }, 'crepe'],
    [{ cuisineTag: 'regional;french' }, 'french'],
    [{ cuisineTag: 'asian;thai' }, 'thai'],
    [{ cuisineTag: 'pasta;italian_pizza;italian;pizza' }, 'italian'],
    [{ cuisineTag: 'sushi' }, 'japanese'],
    [{ cuisineTag: 'falafel;israeli' }, 'lebanese'],
    [{ cuisineTag: ' Japanese ' }, 'japanese'],
    [{ osmClass: 'amenity=cafe' }, 'coffee_shop'],
    [{ osmClass: 'shop=pastry' }, 'pastry'],
    [{ osmClass: 'amenity=biergarten' }, 'bar'],
    [{ osmClass: 'shop=ice_cream' }, 'ice_cream'],
    [{ osmClass: 'shop=coffee' }, 'coffee_shop'],
    [{ osmClass: 'shop=tea' }, 'coffee_shop'],
    [{ cuisineTag: 'coffee_shop', osmClass: 'amenity=bar' }, 'coffee_shop'],
  ] as const)('%o → %s', (input, expected) => {
    expect(suggestCategory(input)).toBe(expected)
  })

  it.each([
    [{ cuisineTag: 'ethiopian' }],
    [{ cuisineTag: 'regional;international' }],
    [{ osmClass: 'amenity=restaurant' }],
    [{}],
    [{ cuisineTag: 'constructor' }],
  ])('suggests nothing for %o', (input) => {
    expect(suggestCategory(input)).toBeUndefined()
  })
})
