import { CUISINE_CATALOG, type CuisineKey } from './cuisineCatalog'

const CATALOG_KEYS: ReadonlySet<string> = new Set(CUISINE_CATALOG.map((entry) => entry.key))

/** OSM `cuisine` values the catalog files under another of its keys. */
const CUISINE_ALIASES: Readonly<Record<string, CuisineKey>> = {
  sushi: 'japanese',
  ramen: 'japanese',
  noodle: 'japanese',
  italian_pizza: 'pizza',
  pasta: 'italian',
  falafel: 'lebanese',
  tea: 'coffee_shop',
}

/** What the kind of place says when its `cuisine` tag says nothing the catalog knows. */
const CLASS_CATEGORIES: Readonly<Record<string, CuisineKey>> = {
  'amenity=cafe': 'coffee_shop',
  'amenity=bar': 'bar',
  'amenity=pub': 'bar',
  'amenity=ice_cream': 'ice_cream',
  'shop=bakery': 'bakery',
  'shop=pastry': 'pastry',
}

/**
 * The catalog category an OpenStreetMap object suggests: the first `cuisine` value that is a
 * catalog key, else the first alias, else the kind of place. Vague values ("regional", "asian")
 * are neither keys nor aliases, so they are skipped. A value the catalog does not know suggests
 * nothing: OSM never creates a custom category.
 */
export function suggestCategory(c: {
  cuisineTag?: string
  osmClass?: string
}): CuisineKey | undefined {
  const values = (c.cuisineTag ?? '')
    .split(';')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean)
  const direct = values.find((value) => CATALOG_KEYS.has(value))
  if (direct) return direct as CuisineKey
  const alias = values.find((value) => Object.hasOwn(CUISINE_ALIASES, value))
  if (alias) return CUISINE_ALIASES[alias]
  return c.osmClass ? CLASS_CATEGORIES[c.osmClass] : undefined
}
