import type { TFunction } from 'i18next'
import { resources } from '../../i18n/resources'

export type CuisineFamily =
  | 'americas'
  | 'sweet'
  | 'africa'
  | 'vegetarian'
  | 'mediterranean'
  | 'france'
  | 'asia'
  | 'bar'

/** Base OKLCH hue per family. Members spread around it (see `cuisines.ts`). */
export const FAMILY_HUES: Record<CuisineFamily, number> = {
  americas: 25,
  sweet: 70,
  africa: 110,
  vegetarian: 140,
  mediterranean: 175,
  france: 245,
  asia: 290,
  bar: 335,
}

/**
 * Curated categories, in family order: a member's position within its family sets its tone.
 * Each key is the stored value and never changes once shipped. It is the OpenStreetMap
 * `cuisine=*` value where OSM has one, else the value of the tag OSM carries it on
 * (`shop=bakery`, `shop=pastry`, `amenity=bar`). Labels live in i18n under `categories.<key>`.
 */
export const CUISINE_CATALOG = [
  { key: 'burger', emoji: '🍔', family: 'americas' },
  { key: 'mexican', emoji: '🌮', family: 'americas' },
  { key: 'bakery', emoji: '🥐', family: 'sweet' },
  { key: 'pastry', emoji: '🍰', family: 'sweet' },
  { key: 'ice_cream', emoji: '🍦', family: 'sweet' },
  { key: 'coffee_shop', emoji: '☕️', family: 'sweet' },
  { key: 'brunch', emoji: '🍳', family: 'sweet' },
  { key: 'african', emoji: '🌍', family: 'africa' },
  { key: 'vegetarian', emoji: '🥦', family: 'vegetarian' },
  { key: 'italian', emoji: '🍝', family: 'mediterranean' },
  { key: 'pizza', emoji: '🍕', family: 'mediterranean' },
  { key: 'greek', emoji: '🫒', family: 'mediterranean' },
  { key: 'lebanese', emoji: '🧆', family: 'mediterranean' },
  { key: 'spanish', emoji: '🥘', family: 'mediterranean' },
  { key: 'kebab', emoji: '🥙', family: 'mediterranean' },
  { key: 'french', emoji: '🥖', family: 'france' },
  { key: 'crepe', emoji: '🥞', family: 'france' },
  { key: 'japanese', emoji: '🍣', family: 'asia' },
  { key: 'chinese', emoji: '🥡', family: 'asia' },
  { key: 'korean', emoji: '🍲', family: 'asia' },
  { key: 'thai', emoji: '🍜', family: 'asia' },
  { key: 'vietnamese', emoji: '🥢', family: 'asia' },
  { key: 'indian', emoji: '🍛', family: 'asia' },
  { key: 'bar', emoji: '🍹', family: 'bar' },
] as const satisfies ReadonlyArray<{ key: string; emoji: string; family: CuisineFamily }>

export type CatalogEntry = (typeof CUISINE_CATALOG)[number]
export type CuisineKey = CatalogEntry['key']

export type ResolvedCuisine =
  | { kind: 'curated'; key: CuisineKey; entry: CatalogEntry }
  | { kind: 'custom'; key: string; label: string }

/** The comparison form of a typed name: no accents, single spaces, trimmed, lowercase. */
export function normalizeCuisineText(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').replace(/\s+/g, ' ').trim().toLowerCase()
}

// Every key and every label in every language, so a value picked or typed in either language,
// or stored before keys existed ("French"), resolves to the same entry.
function buildAliases(): ReadonlyMap<string, CatalogEntry> {
  const aliases = new Map<string, CatalogEntry>()
  for (const entry of CUISINE_CATALOG) {
    aliases.set(normalizeCuisineText(entry.key), entry)
    for (const { translation } of Object.values(resources)) {
      aliases.set(normalizeCuisineText(translation.categories[entry.key]), entry)
    }
  }
  return aliases
}

const ALIASES = buildAliases()

/** The one reader of a stored cuisine. Tone, emoji, label, filter key and ranking all go through it. */
export function resolveCuisine(value: string | null | undefined): ResolvedCuisine | null {
  const label = value?.trim()
  if (!label) return null
  const key = normalizeCuisineText(label)
  const entry = ALIASES.get(key)
  return entry ? { kind: 'curated', key: entry.key, entry } : { kind: 'custom', key, label }
}

/** What a typed name is saved as: its curated key when it names one, else the trimmed text. */
export function storedCuisine(text: string): string | undefined {
  const resolved = resolveCuisine(text)
  if (!resolved) return undefined
  return resolved.kind === 'curated' ? resolved.key : resolved.label
}

/** The one display name: translated for a curated key, as typed for a custom one. */
export function cuisineLabel(value: string | null | undefined, t: TFunction): string {
  const resolved = resolveCuisine(value)
  if (!resolved) return t('common.uncategorized')
  return resolved.kind === 'curated' ? t(`categories.${resolved.key}`) : resolved.label
}
