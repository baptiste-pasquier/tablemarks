---
title: Cuisine Categories - Plan
type: feat
date: 2026-09-25
topic: cuisine-categories
status: ready
---

# Cuisine Categories Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Grow the curated cuisines to 24 OSM-keyed categories, label them in the reader's language, color them by hue family, and order them by real usage in the filter bar and both pickers.

**Architecture:** A new catalog module (`cuisineCatalog.ts`) owns identity: the 24 keys, their emoji and family, and `resolveCuisine`, the one reader of a stored cuisine string (curated key, legacy English name, French label, or free text). A new ranking module (`cuisineRanking.ts`, plus a `useRankedCuisines` hook) owns ordering for all three surfaces. `cuisines.ts` keeps only painting (tones, colors, emoji) and derives every curated tone from the family formula. Labels live in i18n under `categories.<key>`.

**Tech Stack:** React 19, TypeScript, i18next 26 / react-i18next 17 (typed keys), Vitest + Testing Library, Tailwind v4.

**Spec:** `docs/journal/specs/2026-09-24-cuisine-categories-design.md`

## Global Constraints

- Curated keys are OSM values and never change once shipped: `burger mexican bakery pastry ice_cream coffee_shop brunch african vegetarian italian pizza greek lebanese spanish kebab french crepe japanese chinese korean thai vietnamese indian bar`.
- A curated pick stores its key; a free-typed name is stored trimmed, as typed, unless it resolves to a curated key.
- Resolution is case-, accent- and whitespace-insensitive (NFD, strip combining marks, collapse spaces, trim, lowercase) against every key and its label in every language of `src/i18n/resources.ts`.
- No data migration; the `cuisine` field and code names (`cuisine*`, `CuisinePicker`) keep their names. Only the UI label becomes "Category" / "Catégorie".
- Family base hues: americas 25, sweet 70, africa 110, vegetarian 140, mediterranean 175, france 245, asia 290, bar 335. Member `i`: hue `base + [0, -12, +12][i % 3]`, chroma `1` if `i < 3` else `0.5`.
- `CUSTOM_TONES`: hues `[47, 96, 125, 151, 210, 267, 318, 354]`, each at chroma `1` then `0.5` (16 tones).
- Filter bar: used categories only, 6 visible. Picker: all categories, 8 visible, current value pinned, "Show all (N)" toggle, "Other…" last. Ties break on the translated label, `localeCompare` in the display language.
- Repo rules (`AGENTS.md`): relative imports ordered framework → third-party → components → data/sync/lib/types → CSS; `import type` for types; `function` declarations for named module functions; no user-facing literal in a component; `en` and `fr` carry the same keys; 300 lines per module, 250 per component, 60 per function; `cn()` for class composition; primitives from `src/features/ui/` first.

## Review Focus

- A place saved before this change with `"French"`, `"Café"` or `"thai"` must show, color, filter and rank exactly like one saved with the new key — pinned in Task 1 (resolution) and Task 4 (`filter.test.ts`).
- A French reader typing the English name ("Bakery") or an English reader typing "Glacier" in "Other…" must get the curated category, not a duplicate custom one — pinned in Task 1 (`storedCuisine`) and Task 5 (picker).
- Switching language in Settings must relabel and re-sort the filter chips without a reload — pinned in Task 4.
- Two custom names that differ only by case or accents ("Éthiopien", "ethiopien") must be one chip and one filter key — pinned in Task 2 and Task 4.
- A place whose category sits outside the picker's top 8 must still show it selected when the picker opens — pinned in Task 5.

---

### Task 1: Catalog, resolution and category labels

**Files:**
- Create: `src/features/facets/cuisineCatalog.ts`
- Create: `src/features/facets/cuisineCatalog.test.ts`
- Modify: `src/i18n/locales/en/translation.json` (add a top-level `categories` object)
- Modify: `src/i18n/locales/fr/translation.json` (same keys)

**Interfaces:**
- Consumes: `resources` from `src/i18n/resources.ts`; `TFunction` type from `i18next`.
- Produces:
  - `type CuisineFamily = 'americas' | 'sweet' | 'africa' | 'vegetarian' | 'mediterranean' | 'france' | 'asia' | 'bar'`
  - `const FAMILY_HUES: Record<CuisineFamily, number>`
  - `const CUISINE_CATALOG` — readonly tuple of `{ key, emoji, family }`, in family order
  - `type CuisineKey` — union of the catalog keys; `type CatalogEntry`
  - `type ResolvedCuisine = { kind: 'curated'; key: CuisineKey; entry: CatalogEntry } | { kind: 'custom'; key: string; label: string }`
  - `function normalizeCuisineText(text: string): string`
  - `function resolveCuisine(value: string | null | undefined): ResolvedCuisine | null`
  - `function storedCuisine(text: string): string | undefined`
  - `function cuisineLabel(value: string | null | undefined, t: TFunction): string`

- [ ] **Step 1: Add the category labels to both locales**

In `src/i18n/locales/en/translation.json`, add a top-level `"categories"` object (place it after `"cuisinePicker"`, keep the file valid JSON):

```json
  "categories": {
    "burger": "Burger",
    "mexican": "Mexican",
    "bakery": "Bakery",
    "pastry": "Pastry",
    "ice_cream": "Ice cream",
    "coffee_shop": "Café",
    "brunch": "Brunch",
    "african": "African",
    "vegetarian": "Vegetarian",
    "italian": "Italian",
    "pizza": "Pizza",
    "greek": "Greek",
    "lebanese": "Lebanese",
    "spanish": "Spanish",
    "kebab": "Kebab",
    "french": "French",
    "crepe": "Crêperie",
    "japanese": "Japanese",
    "chinese": "Chinese",
    "korean": "Korean",
    "thai": "Thai",
    "vietnamese": "Vietnamese",
    "indian": "Indian",
    "bar": "Bar"
  }
```

In `src/i18n/locales/fr/translation.json`, the same keys:

```json
  "categories": {
    "burger": "Burger",
    "mexican": "Mexicain",
    "bakery": "Boulangerie",
    "pastry": "Pâtisserie",
    "ice_cream": "Glacier",
    "coffee_shop": "Café",
    "brunch": "Brunch",
    "african": "Africain",
    "vegetarian": "Végétarien",
    "italian": "Italien",
    "pizza": "Pizza",
    "greek": "Grec",
    "lebanese": "Libanais",
    "spanish": "Espagnol",
    "kebab": "Kebab",
    "french": "Français",
    "crepe": "Crêperie",
    "japanese": "Japonais",
    "chinese": "Chinois",
    "korean": "Coréen",
    "thai": "Thaï",
    "vietnamese": "Vietnamien",
    "indian": "Indien",
    "bar": "Bar"
  }
```

- [ ] **Step 2: Write the failing tests**

Create `src/features/facets/cuisineCatalog.test.ts`:

```ts
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
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run src/features/facets/cuisineCatalog.test.ts`
Expected: FAIL — `Failed to resolve import "./cuisineCatalog"`.

- [ ] **Step 4: Write the catalog module**

Create `src/features/facets/cuisineCatalog.ts`:

```ts
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
```

If `npm run type-check` rejects the template-literal key, write `t(\`categories.${resolved.key}\` as const)`.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/features/facets/cuisineCatalog.test.ts src/i18n/resources.test.ts`
Expected: PASS (the resources test proves `en` and `fr` carry the same keys).

- [ ] **Step 6: Type-check and lint**

Run: `npm run type-check && npx eslint src/features/facets && npx prettier --check src/features/facets src/i18n`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/features/facets/cuisineCatalog.ts src/features/facets/cuisineCatalog.test.ts src/i18n/locales
git commit -m "feat(facets): OSM-keyed category catalog with FR/EN labels"
```

---

### Task 2: Ranking by real usage

**Files:**
- Create: `src/features/facets/cuisineRanking.ts`
- Create: `src/features/facets/cuisineRanking.test.ts`
- Create: `src/features/facets/useRankedCuisines.ts`

**Interfaces:**
- Consumes: `resolveCuisine`, `cuisineLabel`, `CUISINE_CATALOG` (Task 1).
- Produces:
  - `interface RankedCuisine { key: string; value: string; label: string; count: number }` — `key` is the identity and filter key; `value` is what a pick stores (curated key, or custom name as first seen); `label` is the display label.
  - `function rankCuisines(restaurants: ReadonlyArray<{ cuisine?: string | null }>, labelOf: (value: string) => string, locale: string, includeUnused: boolean): RankedCuisine[]`
  - `function splitRows<T extends { key: string }>(ranked: readonly T[], pinned: ReadonlySet<string>, size: number): { visible: T[]; overflow: T[] }`
  - `function useRankedCuisines(restaurants: ReadonlyArray<{ cuisine?: string | null }>, includeUnused: boolean): RankedCuisine[]`

- [ ] **Step 1: Write the failing tests**

Create `src/features/facets/cuisineRanking.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { rankCuisines, splitRows } from './cuisineRanking'
import { CUISINE_CATALOG } from './cuisineCatalog'

const EN: Record<string, string> = { greek: 'Greek', ice_cream: 'Ice cream', french: 'French', bakery: 'Bakery' }
const FR: Record<string, string> = { greek: 'Grec', ice_cream: 'Glacier', french: 'Français', bakery: 'Boulangerie' }
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
    const ranked = rankCuisines(places('Éthiopien', 'ethiopien', 'ETHIOPIEN'), labelIn(EN), 'en', false)
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/features/facets/cuisineRanking.test.ts`
Expected: FAIL — `Failed to resolve import "./cuisineRanking"`.

- [ ] **Step 3: Write the ranking module**

Create `src/features/facets/cuisineRanking.ts`:

```ts
import { CUISINE_CATALOG, resolveCuisine } from './cuisineCatalog'

/** One category as a surface lists it. */
export interface RankedCuisine {
  /** Identity and filter key: the curated key, or a custom name's normalized form. */
  key: string
  /** What a pick stores: the curated key, or the custom name as first seen. */
  value: string
  /** Display label in the current language. */
  label: string
  /** Places carrying it; 0 for an unused curated category. */
  count: number
}

/**
 * Categories ordered by how many places carry them, ties broken on the label in `locale`.
 * With `includeUnused`, curated categories no place carries follow, alphabetically.
 */
export function rankCuisines(
  restaurants: ReadonlyArray<{ cuisine?: string | null }>,
  labelOf: (value: string) => string,
  locale: string,
  includeUnused: boolean,
): RankedCuisine[] {
  const byKey = new Map<string, RankedCuisine>()
  for (const r of restaurants) {
    const resolved = resolveCuisine(r.cuisine)
    if (!resolved) continue
    const entry = byKey.get(resolved.key)
    if (entry) {
      entry.count++
      continue
    }
    const value = resolved.kind === 'curated' ? resolved.key : resolved.label
    byKey.set(resolved.key, { key: resolved.key, value, label: labelOf(value), count: 1 })
  }
  const byLabel = (a: RankedCuisine, b: RankedCuisine) => a.label.localeCompare(b.label, locale)
  const used = [...byKey.values()].sort((a, b) => b.count - a.count || byLabel(a, b))
  if (!includeUnused) return used
  const unused = CUISINE_CATALOG.filter((e) => !byKey.has(e.key))
    .map((e) => ({ key: e.key, value: e.key, label: labelOf(e.key), count: 0 }))
    .sort(byLabel)
  return [...used, ...unused]
}

/**
 * Splits a ranked list into the collapsed row and what "show more" reveals. The row is the top
 * `size`, but a pinned (selected) entry is never hidden: it bumps the lowest-ranked unpinned
 * entry, or the row grows when more are pinned than fit. Rank order is kept on both sides.
 */
export function splitRows<T extends { key: string }>(
  ranked: readonly T[],
  pinned: ReadonlySet<string>,
  size: number,
): { visible: T[]; overflow: T[] } {
  const isPinned = (item: T) => pinned.has(item.key)
  const pinnedRanked = ranked.filter(isPinned)
  const shown = new Set(ranked.slice(0, size))
  if (pinnedRanked.length > size) {
    shown.clear()
    for (const item of pinnedRanked) shown.add(item)
  } else {
    for (const item of pinnedRanked) {
      if (shown.has(item)) continue
      for (let i = ranked.length - 1; i >= 0; i--) {
        const candidate = ranked[i]
        if (shown.has(candidate) && !isPinned(candidate)) {
          shown.delete(candidate)
          break
        }
      }
      shown.add(item)
    }
  }
  return {
    visible: ranked.filter((item) => shown.has(item)),
    overflow: ranked.filter((item) => !shown.has(item)),
  }
}
```

- [ ] **Step 4: Write the hook**

Create `src/features/facets/useRankedCuisines.ts`:

```ts
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { cuisineLabel } from './cuisineCatalog'
import { rankCuisines, type RankedCuisine } from './cuisineRanking'

/** `rankCuisines` in the current language; re-ranks when the language changes. */
export function useRankedCuisines(
  restaurants: ReadonlyArray<{ cuisine?: string | null }>,
  includeUnused: boolean,
): RankedCuisine[] {
  const { t, i18n } = useTranslation()
  const language = i18n.language
  return useMemo(
    () => rankCuisines(restaurants, (value) => cuisineLabel(value, t), language, includeUnused),
    [restaurants, t, language, includeUnused],
  )
}
```

The hook is exercised through `FilterBar` (Task 4) and `CuisinePicker`'s callers (Task 5).

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/features/facets/cuisineRanking.test.ts && npm run type-check`
Expected: PASS, no type errors.

- [ ] **Step 6: Commit**

```bash
git add src/features/facets/cuisineRanking.ts src/features/facets/cuisineRanking.test.ts src/features/facets/useRankedCuisines.ts
git commit -m "feat(facets): rank categories by usage with a translated tie-break"
```

---

### Task 3: Translated labels on the list, the tooltip and the picker trigger

**Files:**
- Modify: `src/features/RestaurantList.tsx` (imports at lines 5-10, label at line 83)
- Modify: `src/features/map/MarkerTooltipContent.tsx` (import at line 6, label at line 51)
- Modify: `src/features/facets/CuisinePicker.tsx` (imports at lines 4-9, `name` at line 39)
- Modify: `src/features/facets/cuisines.ts` (delete `cuisineDisplayName`)
- Test: `src/features/RestaurantList.test.tsx`, `src/features/map/MarkerTooltipContent.test.tsx`

**Interfaces:**
- Consumes: `cuisineLabel(value, t)` (Task 1).
- Produces: `cuisineDisplayName` no longer exists.

- [ ] **Step 1: Write the failing tests**

In `src/features/RestaurantList.test.tsx`, change the first import to `import { act, fireEvent, render, screen, within } from '@testing-library/react'`, add `import { mockI18n } from '../test/setup'` after the `RestaurantList` import, and add inside the `describe`:

```tsx
  it('names a curated category in the display language, legacy values included', async () => {
    await act(async () => {
      await mockI18n.changeLanguage('fr')
    })
    render(
      <RestaurantList
        items={[
          r({ id: 'a', name: 'Maison', cuisine: 'bakery' }),
          r({ id: 'b', name: 'Bouillon', cuisine: 'French' }),
          r({ id: 'c', name: 'Anahuacalli', cuisine: 'Tex-Mex' }),
        ]}
      />,
    )
    expect(screen.getByText('Boulangerie')).toBeInTheDocument()
    expect(screen.getByText('Français')).toBeInTheDocument()
    expect(screen.getByText('Tex-Mex')).toBeInTheDocument()
  })
```

In `src/features/map/MarkerTooltipContent.test.tsx`, add inside the `describe` (the file's `marker()` fixture already exists):

```tsx
  it('names a curated category by its label, not its stored key', () => {
    render(<MarkerTooltipContent marker={marker({ cuisine: 'ice_cream' })} currentPosition={null} />)
    expect(screen.getByText('Ice cream')).toBeInTheDocument()
    expect(screen.queryByText('ice_cream')).not.toBeInTheDocument()
  })
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/features/RestaurantList.test.tsx src/features/map/MarkerTooltipContent.test.tsx`
Expected: FAIL — `Unable to find an element with the text: Boulangerie` (the list prints the raw `bakery`) and `Ice cream` (the tooltip prints `ice_cream`).

- [ ] **Step 3: Switch the three surfaces to `cuisineLabel`**

`src/features/RestaurantList.tsx`: remove `cuisineDisplayName` from the `./facets/cuisines` import, add `import { cuisineLabel } from './facets/cuisineCatalog'` right after it, and replace line 83:

```tsx
                      {cuisineLabel(r.cuisine, t)}
```

`src/features/map/MarkerTooltipContent.tsx`: import line 6 becomes

```ts
import { cuisinePillTokens, emojiForCuisine } from '../facets/cuisines'
import { cuisineLabel } from '../facets/cuisineCatalog'
```

and line 51 becomes `{cuisineLabel(marker.cuisine, t)}`.

`src/features/facets/CuisinePicker.tsx`: remove `cuisineDisplayName` from the `./cuisines` import, add `import { cuisineLabel } from './cuisineCatalog'` after it, and replace line 39:

```ts
  const name = cuisineLabel(chosen, t)
```

`src/features/facets/cuisines.ts`: delete the `cuisineDisplayName` function and its doc comment.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/features && npm run type-check`
Expected: PASS, no type errors.

- [ ] **Step 5: Commit**

```bash
git add src/features/RestaurantList.tsx src/features/RestaurantList.test.tsx src/features/map/MarkerTooltipContent.tsx src/features/map/MarkerTooltipContent.test.tsx src/features/facets/CuisinePicker.tsx src/features/facets/cuisines.ts
git commit -m "feat(facets): show categories in the reader's language"
```

---

### Task 4: Filter bar on the shared ranking, keyed by resolved category

**Files:**
- Modify: `src/features/facets/filter.ts:31-35` (`cuisineKey`)
- Modify: `src/features/facets/FilterBar.tsx` (delete `rankedCuisines` and `splitCuisineRows`, lines 49-110; rewire the cuisine group)
- Modify: `src/i18n/locales/en/translation.json`, `src/i18n/locales/fr/translation.json` (`filters.cuisineGroup`)
- Test: `src/features/facets/filter.test.ts`, `src/features/facets/FilterBar.test.tsx`

**Interfaces:**
- Consumes: `resolveCuisine` (Task 1); `useRankedCuisines`, `splitRows`, `RankedCuisine` (Task 2).
- Produces: `FacetFilter.cuisines` holds `RankedCuisine.key` values (curated key or normalized custom name) plus `UNCATEGORIZED`.

- [ ] **Step 1: Write the failing tests**

Append to the main `describe` in `src/features/facets/filter.test.ts` (reusing its `r()` fixture):

```ts
  it('matches a legacy or translated stored name against its curated filter key', () => {
    const filter = { ...emptyFilter(), cuisines: new Set(['french', 'crepe']) }
    expect(matches(r({ id: 'a', cuisine: 'French' }), filter)).toBe(true)
    expect(matches(r({ id: 'b', cuisine: 'Français' }), filter)).toBe(true)
    expect(matches(r({ id: 'c', cuisine: 'Crêperie' }), filter)).toBe(true)
    expect(matches(r({ id: 'd', cuisine: 'Thai' }), filter)).toBe(false)
  })

  it('matches custom names that differ only by case or accents', () => {
    const filter = { ...emptyFilter(), cuisines: new Set(['ethiopien']) }
    expect(matches(r({ id: 'a', cuisine: 'Éthiopien' }), filter)).toBe(true)
    expect(matches(r({ id: 'b', cuisine: 'ETHIOPIEN' }), filter)).toBe(true)
  })
```

In `src/features/facets/FilterBar.test.tsx`: change the first import to `import { act, render, screen, within } from '@testing-library/react'`; replace `screen.getByText('Cuisine')` with `screen.getByText('Category')` in the two tests that use it (the "separate labels" test and the `layout="inline"` test); then add:

```tsx
  it('folds legacy and translated names into one chip toggling the curated key', async () => {
    const onChange = vi.fn()
    const places = [
      r({ id: 'a', cuisine: 'French' }),
      r({ id: 'b', cuisine: 'french' }),
      r({ id: 'c', cuisine: 'Français' }),
    ]
    render(<FilterBar restaurants={places} filter={emptyFilter()} onChange={onChange} />)

    expect(screen.getAllByRole('button', { name: 'French' })).toHaveLength(1)
    await userEvent.click(screen.getByRole('button', { name: 'French' }))
    expect([...onChange.mock.calls[0][0].cuisines]).toEqual(['french'])
  })

  it('relabels and re-sorts the chips when the language changes', async () => {
    const places = [r({ id: 'a', cuisine: 'greek' }), r({ id: 'b', cuisine: 'ice_cream' })]
    const { rerender } = render(
      <FilterBar restaurants={places} filter={emptyFilter()} onChange={vi.fn()} />,
    )
    const greek = screen.getByRole('button', { name: 'Greek' })
    const iceCream = screen.getByRole('button', { name: 'Ice cream' })
    expect(greek.compareDocumentPosition(iceCream) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()

    await act(async () => {
      await mockI18n.changeLanguage('fr')
    })
    rerender(<FilterBar restaurants={places} filter={emptyFilter()} onChange={vi.fn()} />)

    expect(screen.getByText('Catégorie')).toBeInTheDocument()
    const glacier = screen.getByRole('button', { name: 'Glacier' })
    const grec = screen.getByRole('button', { name: 'Grec' })
    expect(glacier.compareDocumentPosition(grec) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/features/facets/filter.test.ts src/features/facets/FilterBar.test.tsx`
Expected: FAIL — `matches` misses `Français`/`Crêperie`/`Éthiopien` (its key is only lowercased), the bar shows no `Category` label, and in the language test the chips still read `greek` / `ice_cream`.

- [ ] **Step 3: Key the filter by resolved category**

In `src/features/facets/filter.ts`, add `import { resolveCuisine } from './cuisineCatalog'` after the existing imports, and replace `cuisineKey` and its comment:

```ts
/** A place's category as a filter key: its resolved key, or the uncategorized sentinel. */
function cuisineKey(r: Pick<Restaurant, 'cuisine'>): string {
  return resolveCuisine(r.cuisine)?.key ?? UNCATEGORIZED
}
```

Update the `FacetFilter.cuisines` doc comment to: `/** Category keys (see resolveCuisine), plus the UNCATEGORIZED sentinel — normalized for O(1) matching. */`.

- [ ] **Step 4: Rewire `FilterBar`**

In `src/features/facets/FilterBar.tsx`:

1. Imports: add `import { splitRows } from './cuisineRanking'` and `import { useRankedCuisines } from './useRankedCuisines'` after the `./cuisines` import.
2. Delete `rankedCuisines` and `splitCuisineRows` (the functions and their doc comments, lines 49-110).
3. In the component, replace the `ranked` and `{ visible, overflow }` memos with:

```tsx
  const ranked = useRankedCuisines(restaurants, false)
  const hasUncategorized = useMemo(() => restaurants.some((r) => !r.cuisine?.trim()), [restaurants])
  const { visible, overflow } = useMemo(
    () => splitRows(ranked, filter.cuisines, DEFAULT_CUISINE_ROW_SIZE),
    [ranked, filter.cuisines],
  )
```

4. Replace the cuisine chip map:

```tsx
              {shownCuisines.map((c) => (
                <ToggleChip
                  key={c.key}
                  shape="pill"
                  active={filter.cuisines.has(c.key)}
                  activeColor={colorForCuisine(c.value)}
                  onClick={() =>
                    onChange({ ...filter, cuisines: withToggled(filter.cuisines, c.key) })
                  }
                >
                  <span aria-hidden="true" className="text-base leading-none">
                    {emojiForCuisine(c.value)}
                  </span>
                  {c.label}
                </ToggleChip>
              ))}
```

5. In both locale files, set `filters.cuisineGroup` to `"Category"` (en) and `"Catégorie"` (fr).

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/features/facets src/App.test.tsx src/features/map && npm run type-check`
Expected: PASS. `App.test.tsx` still finds its `French` chip: legacy `"French"` resolves to `french`, labelled "French" in English.

- [ ] **Step 6: Commit**

```bash
git add src/features/facets/filter.ts src/features/facets/filter.test.ts src/features/facets/FilterBar.tsx src/features/facets/FilterBar.test.tsx src/i18n/locales
git commit -m "feat(facets): filter on resolved categories, translated and ranked"
```

---

### Task 5: Picker — ranked options, top 8, "Show all", curated match on "Other…"

**Files:**
- Modify: `src/features/facets/CuisinePicker.tsx`
- Modify: `src/features/capture/AddPlace.tsx:8,44`
- Modify: `src/features/visits/RestaurantDetail.tsx:11,54`
- Modify: `src/features/facets/cuisines.ts` (delete `cuisineOptions`)
- Modify: `src/features/facets/cuisines.test.ts` (delete the `cuisineOptions` import and its `describe` block)
- Modify: `src/i18n/locales/en/translation.json`, `src/i18n/locales/fr/translation.json` (`cuisinePicker.showAll`, `cuisinePicker.showLess`)
- Test: `src/features/facets/CuisinePicker.test.tsx`, `src/features/visits/RestaurantDetail.test.tsx`

**Interfaces:**
- Consumes: `resolveCuisine`, `storedCuisine`, `cuisineLabel` (Task 1); `RankedCuisine`, `splitRows`, `useRankedCuisines` (Task 2).
- Produces: `CuisinePicker` props become `{ value: string | null | undefined; options: readonly RankedCuisine[]; onChange: (cuisine: string | undefined) => void }`. `onChange` receives a curated key, a custom name, or `undefined`.

- [ ] **Step 1: Add the toggle labels**

In `cuisinePicker` of `en/translation.json` add `"showAll": "Show all ({{count}})"` and `"showLess": "Show less"`; in `fr/translation.json` add `"showAll": "Voir tout ({{count}})"` and `"showLess": "Réduire"`.

- [ ] **Step 2: Rewrite the picker tests' fixtures and add the new tests**

In `src/features/facets/CuisinePicker.test.tsx`:

1. Replace the imports and `OPTIONS` with:

```tsx
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import { CuisinePicker } from './CuisinePicker'
import { mockI18n } from '../../test/setup'
import type { RankedCuisine } from './cuisineRanking'

function option(value: string, label: string, count = 0): RankedCuisine {
  return { key: value.toLowerCase(), value, label, count }
}

const OPTIONS = [option('french', 'French', 2), option('italian', 'Italian', 1), option('Ramen', 'Ramen', 1)]

const TWELVE = [
  ['bakery', 'Bakery'],
  ['french', 'French'],
  ['coffee_shop', 'Café'],
  ['japanese', 'Japanese'],
  ['pizza', 'Pizza'],
  ['bar', 'Bar'],
  ['italian', 'Italian'],
  ['thai', 'Thai'],
  ['crepe', 'Crêperie'],
  ['greek', 'Greek'],
  ['lebanese', 'Lebanese'],
  ['african', 'African'],
].map(([value, label]) => option(value, label))

/** The category pills in the open picker (every option is a pressable toggle). */
function pills() {
  return within(screen.getByRole('group', { name: 'Categories' }))
    .getAllByRole('button')
    .filter((b) => b.hasAttribute('aria-pressed'))
}
```

2. In `'opens onto every option, …'`, change `expect(onChange).toHaveBeenCalledWith('Italian')` to `expect(onChange).toHaveBeenCalledWith('italian')` (a pick emits the option's `value`). In `'truncates a long option name …'`, change `options={[long]}` to `options={[option(long, long)]}`.

3. Add:

```tsx
  it('opens on the top 8, reveals the rest behind "Show all", and folds back on close', async () => {
    const user = userEvent.setup()
    render(<CuisinePicker value={undefined} options={TWELVE} onChange={vi.fn()} />)
    const trigger = screen.getByRole('button', { name: 'Category: Uncategorized' })

    await user.click(trigger)
    expect(pills()).toHaveLength(8)
    const showAll = screen.getByRole('button', { name: 'Show all (4)' })
    expect(showAll).toHaveAttribute('aria-expanded', 'false')

    await user.click(showAll)
    expect(pills()).toHaveLength(12)
    expect(screen.getByRole('button', { name: 'Show less' })).toHaveAttribute('aria-expanded', 'true')
    // "Other…" stays last.
    const group = screen.getByRole('group', { name: 'Categories' })
    expect(within(group).getAllByRole('button').at(-1)).toHaveTextContent('Other…')

    await user.click(trigger)
    await user.click(trigger)
    expect(pills()).toHaveLength(8)
  })

  it('keeps the chosen category visible and pressed even outside the top 8', async () => {
    const user = userEvent.setup()
    render(<CuisinePicker value="african" options={TWELVE} onChange={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: 'Category: African' }))
    expect(pills()).toHaveLength(8)
    expect(screen.getByRole('button', { name: /African/, pressed: true })).toBeInTheDocument()
  })

  it('shows the chosen category as selected when it is stored under a legacy name', async () => {
    const user = userEvent.setup()
    render(<CuisinePicker value="French" options={TWELVE} onChange={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: 'Category: French' }))
    expect(screen.getByRole('button', { name: /French/, pressed: true })).toBeInTheDocument()
  })

  it('stores the curated key when "Other…" names a known category, in either language', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(
      <>
        <CuisinePicker value={undefined} options={OPTIONS} onChange={onChange} />
        <button type="button">Elsewhere</button>
      </>,
    )

    await user.click(screen.getByRole('button', { name: 'Category: Uncategorized' }))
    await user.click(screen.getByRole('button', { name: 'Other…' }))
    await user.type(screen.getByLabelText('Other category'), 'boulangerie{Enter}')
    expect(onChange).toHaveBeenLastCalledWith('bakery')

    await user.click(screen.getByRole('button', { name: 'Category: Uncategorized' }))
    await user.click(screen.getByRole('button', { name: 'Other…' }))
    await user.type(screen.getByLabelText('Other category'), 'Glacier')
    await user.click(screen.getByRole('button', { name: 'Elsewhere' }))
    expect(onChange).toHaveBeenLastCalledWith('ice_cream')
  })

  it('names the trigger in the display language', async () => {
    await act(async () => {
      await mockI18n.changeLanguage('fr')
    })
    render(<CuisinePicker value="bakery" options={TWELVE} onChange={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Catégorie : Boulangerie' })).toBeInTheDocument()
  })
```

In `src/features/visits/RestaurantDetail.test.tsx`, in `'edits and persists the cuisine through the picker'`: before clicking `/French/`, add `await user.click(screen.getByRole('button', { name: /Show all/ }))` (with no places, French is not in the alphabetical top 8), and change the expectation to `.toBe('french')`.

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run src/features/facets/CuisinePicker.test.tsx src/features/visits/RestaurantDetail.test.tsx`
Expected: FAIL — type/props mismatch (`options` are objects), no `Show all` button, and "Other…" emits `boulangerie` instead of `bakery`.

- [ ] **Step 4: Rewrite the picker**

In `src/features/facets/CuisinePicker.tsx`:

1. Imports become:

```tsx
import { useId, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronDown, ChevronUp, Check, Plus } from 'lucide-react'
import { cuisineAvatarBackground, cuisinePillTokens, emojiForCuisine } from './cuisines'
import { cuisineLabel, resolveCuisine, storedCuisine } from './cuisineCatalog'
import { splitRows, type RankedCuisine } from './cuisineRanking'
import { Button } from '../ui/Button'
import { ToggleChip } from '../ui/ToggleChip'
import { cn } from '../../lib/cn'

const PICKER_ROW_SIZE = 8
```

2. Doc comment: after "Open, every option is a pastel pill", insert "ranked by use — the top eight, the current one always among them, then "Show all" —", and after "\"Other…\" takes a free-typed name" insert "(saved as a curated key when it names one, in either language)".

3. Props: `options: readonly RankedCuisine[]`.

4. State and derived values (replace from `const [open, …]` down to `const name = …`):

```tsx
  const [open, setOpen] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [typing, setTyping] = useState(false)
  const [custom, setCustom] = useState('')
  const optionsId = useId()
  const triggerRef = useRef<HTMLButtonElement>(null)
  const groupRef = useRef<HTMLDivElement>(null)
  const chosen = value?.trim() || undefined
  const chosenKey = resolveCuisine(chosen)?.key
  const name = cuisineLabel(chosen, t)
  const { visible, overflow } = useMemo(
    () => splitRows(options, new Set(chosenKey ? [chosenKey] : []), PICKER_ROW_SIZE),
    [options, chosenKey],
  )
  const shown = expanded ? options : visible
```

5. Handlers:

```tsx
  function pick(next: string | undefined) {
    onChange(next)
    setOpen(false)
    setExpanded(false)
    setTyping(false)
    setCustom('')
  }

  function submitCustom() {
    const next = storedCuisine(custom)
    if (next) pick(next)
  }

  // Closing from the trigger is a cancel: the next opening starts from the top options, not the
  // draft or the expanded list.
  function toggle() {
    if (open) {
      setTyping(false)
      setCustom('')
      setExpanded(false)
    }
    setOpen(!open)
  }
```

and in `keepDraft`, replace `const next = custom.trim()` with `const next = storedCuisine(custom)`.

6. The options map:

```tsx
          {shown.map((option) => {
            const selected = option.key === chosenKey
            const tokens = cuisinePillTokens(option.value)
            return (
              <ToggleChip
                key={option.key}
                shape="pill"
                active={selected}
                tint={tokens}
                onClick={() => pick(selected ? undefined : option.value)}
                className="max-w-full"
              >
                <span aria-hidden="true" className="shrink-0">
                  {emojiForCuisine(option.value)}
                </span>
                <span className="min-w-0 truncate">{option.label}</span>
                {selected && (
                  <Check size={14} strokeWidth={2.6} aria-hidden="true" className="shrink-0" />
                )}
              </ToggleChip>
            )
          })}
          {overflow.length > 0 && (
            <Button
              type="button"
              variant="secondary"
              size="xs"
              aria-expanded={expanded}
              onClick={() => setExpanded(!expanded)}
            >
              {expanded
                ? t('cuisinePicker.showLess')
                : t('cuisinePicker.showAll', { count: overflow.length })}
            </Button>
          )}
```

The `typing ? … : …` "Other…" block stays after it, unchanged.

- [ ] **Step 5: Feed the picker from the ranking hook**

`src/features/capture/AddPlace.tsx`: replace `import { cuisineOptions } from '../facets/cuisines'` with `import { useRankedCuisines } from '../facets/useRankedCuisines'`, and line 44 with:

```tsx
  const options = useRankedCuisines(restaurants, true)
```

`src/features/visits/RestaurantDetail.tsx`: same import swap, and line 54 becomes `const options = useRankedCuisines(restaurants, true)`.

In both files, drop `useMemo` from the `react` import if nothing else uses it (ESLint and `type-check` will say).

- [ ] **Step 6: Delete `cuisineOptions`**

Delete `cuisineOptions` and its doc comment from `src/features/facets/cuisines.ts`; in `cuisines.test.ts`, delete `cuisineOptions` from the import list and the whole `describe('cuisineOptions', …)` block.

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npx vitest run src/features && npm run type-check && npx eslint src/features`
Expected: PASS; `AddPlace.test.tsx`'s "Ramen" tests still pass (a custom name is saved as typed).

- [ ] **Step 8: Commit**

```bash
git add src/features/facets/CuisinePicker.tsx src/features/facets/CuisinePicker.test.tsx src/features/capture/AddPlace.tsx src/features/visits/RestaurantDetail.tsx src/features/visits/RestaurantDetail.test.tsx src/features/facets/cuisines.ts src/features/facets/cuisines.test.ts src/i18n/locales
git commit -m "feat(facets): rank the category picker by usage, top 8 then show all"
```

---

### Task 6: Hue families and catalog emoji

**Files:**
- Modify: `src/features/facets/cuisines.ts` (palette half and emoji)
- Modify: `src/features/facets/cuisines.test.ts`
- Modify: the four color assertions that name a hue — `src/features/RestaurantList.test.tsx:88,97`, `src/features/facets/CuisinePicker.test.tsx:17`, `src/features/facets/FilterBar.test.tsx:159`, `src/features/map/MarkerTooltipContent.test.tsx:45`

**Interfaces:**
- Consumes: `CUISINE_CATALOG`, `FAMILY_HUES`, `resolveCuisine`, `CuisineKey` (Task 1).
- Produces: `CURATED_TONES: ReadonlyMap<CuisineKey, CuisineTone>`; `CUSTOM_TONES` (16 tones); `CURATED_CUISINES` no longer exists. `toneForCuisine`, `colorForCuisine`, `cuisinePillTokens`, `cuisineAvatarBackground`, `emojiForCuisine` keep their signatures.

- [ ] **Step 1: Rewrite the palette tests**

In `src/features/facets/cuisines.test.ts`:

1. The import list becomes `colorForCuisine, cuisineAvatarBackground, cuisinePillTokens, emojiForCuisine, toneForCuisine, CURATED_TONES, CUSTOM_TONES, UNCATEGORIZED_COLOR, UNCATEGORIZED_EMOJI, GENERIC_CUISINE_EMOJI` from `./cuisines`, plus `import { CUISINE_CATALOG, FAMILY_HUES } from './cuisineCatalog'`.

2. In `describe('colorForCuisine')`: the first test becomes

```ts
  it('derives the solid form from the category tone, whatever name it is stored under', () => {
    expect(colorForCuisine('french')).toBe('oklch(0.48 0.15 245)')
    expect(colorForCuisine('French')).toBe(colorForCuisine('french'))
    expect(colorForCuisine('Français')).toBe(colorForCuisine('french'))
  })
```

and in `'never maps a real cuisine onto the neutral color'`, iterate `[...CUISINE_CATALOG.map((e) => e.key), 'Ethiopian', 'Peruvian', 'Ramen']`.

3. Replace `describe('the cuisine hue wheel', …)` with:

```ts
describe('the hue families', () => {
  it('tones each member from its family base: 0, -12, +12, then the same muted', () => {
    expect(toneForCuisine('japanese')).toEqual({ hue: 290, chroma: 1 })
    expect(toneForCuisine('chinese')).toEqual({ hue: 278, chroma: 1 })
    expect(toneForCuisine('korean')).toEqual({ hue: 302, chroma: 1 })
    expect(toneForCuisine('thai')).toEqual({ hue: 290, chroma: 0.5 })
    expect(toneForCuisine('vietnamese')).toEqual({ hue: 278, chroma: 0.5 })
    expect(toneForCuisine('indian')).toEqual({ hue: 302, chroma: 0.5 })
    expect(toneForCuisine('coffee_shop')).toEqual({ hue: 70, chroma: 0.5 })
    expect(toneForCuisine('bar')).toEqual({ hue: 335, chroma: 1 })
  })

  it('gives every curated category a tone within 12 degrees of its family base', () => {
    expect(CURATED_TONES.size).toBe(CUISINE_CATALOG.length)
    for (const entry of CUISINE_CATALOG) {
      const tone = CURATED_TONES.get(entry.key)!
      expect(Math.abs(tone.hue - FAMILY_HUES[entry.family])).toBeLessThanOrEqual(12)
    }
  })

  it('never gives two curated categories of different families the same tone', () => {
    const owner = new Map<string, string>()
    for (const entry of CUISINE_CATALOG) {
      const { hue, chroma } = CURATED_TONES.get(entry.key)!
      const id = `${hue}:${chroma}`
      expect(owner.get(id) ?? entry.family).toBe(entry.family)
      owner.set(id, entry.family)
    }
  })

  it('offers 16 fallback tones, each at least 10 degrees from every curated hue', () => {
    expect(CUSTOM_TONES).toHaveLength(16)
    for (const tone of CUSTOM_TONES) {
      for (const [key, curated] of CURATED_TONES) {
        const d = Math.abs(tone.hue - curated.hue)
        const gap = Math.min(d, 360 - d)
        expect(gap, `fallback hue ${tone.hue} vs ${key}`).toBeGreaterThanOrEqual(10)
      }
    }
  })

  it('resolves a free-text category to one fallback tone, whatever its case or accents', () => {
    const tone = toneForCuisine('Éthiopien')
    expect(CUSTOM_TONES).toContainEqual(tone)
    expect(toneForCuisine('ethiopien')).toEqual(tone)
  })
})
```

4. In `describe('cuisinePillTokens')`: the Thai test becomes Japanese — `cuisinePillTokens('japanese')` equals `{ background: 'oklch(0.96 0.045 290)', color: 'oklch(0.4 0.13 290)' }`; the Café test uses `'coffee_shop'` and expects `{ background: 'oklch(0.96 0.0225 70)', color: 'oklch(0.4 0.065 70)' }`.

5. In `describe('cuisineAvatarBackground')`: expect `cuisineAvatarBackground('japanese')` → `'oklch(0.93 0.07 290)'` and `cuisineAvatarBackground('coffee_shop')` → `'oklch(0.93 0.035 70)'`.

6. In `describe('emojiForCuisine')`, replace `'maps each curated cuisine to its own specific assigned emoji'` with:

```ts
  it('takes each curated emoji from the catalog, whatever name the category is stored under', () => {
    for (const entry of CUISINE_CATALOG) expect(emojiForCuisine(entry.key)).toBe(entry.emoji)
    expect(emojiForCuisine('Boulangerie')).toBe('🥐')
    expect(emojiForCuisine('Café')).toBe('☕️')
  })
```

7. In `describe('cuisine palette contrast floors')`, in `everyPaintedName`, start from `const names: string[] = CUISINE_CATALOG.map(({ key }) => key)`, and update the block comment's "twelve curated hues and the twenty-two fallbacks" to "twenty-four curated tones and the sixteen fallbacks".

8. Update the hue-bearing assertions in the other test files:
   - `RestaurantList.test.tsx:88` → `'oklch(0.93 0.035 290)'`, `:97` → `'oklch(0.4 0.065 290)'` (Thai is Asia's fourth member: hue 290, chroma 0.5). Update the comment above them if it names hue 281.
   - `CuisinePicker.test.tsx:17` → `'oklch(0.4 0.13 245)'`, and its comment "French is hue 249 on the wheel" → "French leads the France family, hue 245".
   - `FilterBar.test.tsx:159` → `'oklch(0.48 0.075 290)'`, and its comment "Thai is hue 281" → "Thai is Asia's fourth member, hue 290 at half chroma".
   - `MarkerTooltipContent.test.tsx:45` → `'oklch(0.4 0.13 290)'`, and its comment "Japanese is hue 313 on the wheel" → "Japanese leads the Asia family, hue 290".

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/features`
Expected: FAIL — `CURATED_TONES` is not exported, `CUSTOM_TONES` has 22 tones, `toneForCuisine('japanese')` is a fallback tone, `emojiForCuisine('bakery')` is `🍴`.

- [ ] **Step 3: Rewrite the palette half of `cuisines.ts`**

In `src/features/facets/cuisines.ts`:

1. Add at the top: `import { CUISINE_CATALOG, FAMILY_HUES, resolveCuisine, type CuisineKey } from './cuisineCatalog'`.
2. Delete `CURATED_CUISINES`, `CURATED_BY_KEY`, `FALLBACK_HUES`, the old `CUSTOM_TONES`, `CUISINE_EMOJI` and `normalize`, with their comments.
3. Insert after `GENERIC_CUISINE_EMOJI`:

```ts
// A family's first three members sit on its base hue and 12 degrees either side; the next three
// repeat those hues at half chroma. Color names the family, the emoji names the member.
const MEMBER_HUE_OFFSETS = [0, -12, 12]
const MUTED_CHROMA = 0.5

function familyTones(): ReadonlyMap<CuisineKey, CuisineTone> {
  const tones = new Map<CuisineKey, CuisineTone>()
  const position = new Map<string, number>()
  for (const entry of CUISINE_CATALOG) {
    const i = position.get(entry.family) ?? 0
    position.set(entry.family, i + 1)
    tones.set(entry.key, {
      hue: FAMILY_HUES[entry.family] + MEMBER_HUE_OFFSETS[i % 3],
      chroma: i < 3 ? 1 : MUTED_CHROMA,
    })
  }
  return tones
}

/** Every curated category's tone, derived from its family and its place in the catalog. */
export const CURATED_TONES = familyTones()

// Fallback wheel for free-text categories, assigned by name hash: the midpoints of the gaps
// between family bands, so a user category never passes for a family member, at full then half
// chroma. Collisions past 16 are acceptable: the color is a scannability hint, not an identifier.
const FALLBACK_HUES = [47, 96, 125, 151, 210, 267, 318, 354]

export const CUSTOM_TONES: readonly CuisineTone[] = [
  ...FALLBACK_HUES.map((hue) => ({ hue, chroma: 1 })),
  ...FALLBACK_HUES.map((hue) => ({ hue, chroma: MUTED_CHROMA })),
]
```

4. `toneForCuisine` becomes:

```ts
/** The one category-to-tone source. Every rendered category color goes through here. */
export function toneForCuisine(cuisine: string | null | undefined): CuisineTone {
  const resolved = resolveCuisine(cuisine)
  if (!resolved) return UNCATEGORIZED_TONE
  if (resolved.kind === 'curated') return CURATED_TONES.get(resolved.key) ?? UNCATEGORIZED_TONE
  return CUSTOM_TONES[hashString(resolved.key) % CUSTOM_TONES.length]
}
```

5. `emojiForCuisine` becomes:

```ts
/** The one category-to-emoji source, resolved the same way as `toneForCuisine`. */
export function emojiForCuisine(cuisine: string | null | undefined): string {
  const resolved = resolveCuisine(cuisine)
  if (!resolved) return UNCATEGORIZED_EMOJI
  return resolved.kind === 'curated' ? resolved.entry.emoji : GENERIC_CUISINE_EMOJI
}
```

6. Replace the module's opening doc comment's last sentence so it points at the families: "Recipes, families and their measured contrast floors: docs/reference/design-tokens.md."

- [ ] **Step 4: Run the full suite**

Run: `npm test && npm run type-check && npx eslint . && npx prettier . --check`
Expected: all PASS. The contrast `it.each` now runs over 24 curated keys plus 16 probes.

- [ ] **Step 5: Commit**

```bash
git add src/features/facets/cuisines.ts src/features/facets/cuisines.test.ts src/features/RestaurantList.test.tsx src/features/facets/CuisinePicker.test.tsx src/features/facets/FilterBar.test.tsx src/features/map/MarkerTooltipContent.test.tsx
git commit -m "feat(facets): color categories by hue family"
```

---

### Task 7: Documentation

**Files:**
- Modify: `docs/reference/design-tokens.md` (section "The cuisine palette", `### Rules` and the hue table)
- Modify: `docs/reference/data-model.md:31`
- Modify: `CONCEPTS.md` (`### Cuisine`)
- Modify: `README.md:7`
- Create: `docs/journal/decisions/0007-store-categories-as-openstreetmap-values.md`

- [ ] **Step 1: Design tokens**

In `docs/reference/design-tokens.md`, keep the recipe table and the paragraph under it; replace everything from `### Rules` down to (not including) `## Icons` with:

```markdown
### Rules

- **A category's color says its family.** Each family owns a base hue. Member `i` of a family,
  in the order of `src/features/facets/cuisineCatalog.ts`, takes the hue
  `base + [0, −12, +12][i mod 3]`, at chroma 1 for the first three and 0.5 after. Members look
  alike on purpose; the emoji tells them apart.
- **A new curated category joins a family**, it does not get a hue of its own. A seventh member
  would repeat a tone, so a family that full gets split instead.
- **A free-text category hashes into `CUSTOM_TONES`**, 16 tones on the midpoints of the gaps
  between family bands. No fallback hue sits within 10 degrees of a curated hue.
- **Uncategorized is achromatic**, not a gray hex.

| Family        | Base hue | Members, in order                                      |
| ------------- | -------- | ------------------------------------------------------ |
| Americas      | 25       | Burger, Mexican                                        |
| Sweet         | 70       | Bakery, Pastry, Ice cream, Café, Brunch                |
| Africa        | 110      | African                                                |
| Vegetarian    | 140      | Vegetarian                                             |
| Mediterranean | 175      | Italian, Pizza, Greek, Lebanese, Spanish, Kebab        |
| France        | 245      | French, Crêperie                                       |
| Asia          | 290      | Japanese, Chinese, Korean, Thai, Vietnamese, Indian    |
| Bar           | 335      | Bar                                                    |

Fallback hues: 47, 96, 125, 151, 210, 267, 318, 354.
```

- [ ] **Step 2: Data model, concepts, README**

`docs/reference/data-model.md` line 31 becomes:

```
cuisine?                       a curated key (an OpenStreetMap value: french, bakery…) or free text
```

In `CONCEPTS.md`, replace the body of `### Cuisine` with:

```markdown
A Restaurant's single optional category, labelled "Category" in the interface: a cuisine
(French, Indian) or a kind of place (bakery, bar). A curated category is stored as its
OpenStreetMap key and shown in the reader's language; a free-typed one is stored as typed. Each
category maps to one color, shared by its map marker and its filter chip, and curated categories
of one family share a hue; a Restaurant with no category is "uncategorized."
```

`README.md` line 7 becomes `- Filter by category (cuisine, bakery, bar…) and status, all on a map`.

- [ ] **Step 3: ADR**

Create `docs/journal/decisions/0007-store-categories-as-openstreetmap-values.md`:

```markdown
---
status: "accepted"
date: 2026-09-25
decision-makers: [Baptiste Pasquier]
---

# Store categories as OpenStreetMap values

## Context and Problem Statement

A place's category was stored as an English display name ("French", "Café"), so it could not be
translated, and a French user typing "Français" created a second category. Categories also need
to line up with OpenStreetMap, which a later prefill will read.

## Considered Options

* Keep display names, translate by lookup
* Our own slugs (`cafe`, `creperie`)
* OpenStreetMap values (`coffee_shop`, `crepe`)

## Decision Outcome

Chosen: **OpenStreetMap values**. A curated category is stored as its OSM `cuisine=*` value, or,
for the places OSM tags elsewhere, the value of that tag (`shop=bakery`, `shop=pastry`,
`amenity=bar`). A free-typed category is stored as typed. Labels live in i18n.

Every read goes through `resolveCuisine`, which matches keys and every language's labels without
regard to case or accents, so values written before this decision ("French") resolve to their key
and no migration runs.

### Consequences

* Good: a prefill from OSM maps a tag to a category without a translation table.
* Good: one category per meaning, whatever language it was picked or typed in.
* Bad: a key can never be renamed once shipped, since stored records carry it.
```

- [ ] **Step 4: Run the docs gate**

Run: `npm run check:docs && npx prettier --check docs CONCEPTS.md README.md`
Expected: `docs/ structure OK` (the existing `deployment.md` length warning is unrelated). If the gate rejects the ADR frontmatter, match `docs/journal/decisions/0006-warm-the-accent-to-paprika.md` exactly.

- [ ] **Step 5: Commit**

```bash
git add docs/reference/design-tokens.md docs/reference/data-model.md CONCEPTS.md README.md docs/journal/decisions/0007-store-categories-as-openstreetmap-values.md
git commit -m "docs: category families, OSM keys and translated labels"
```

---

## Final verification

- [ ] Run: `npm test && npm run type-check && npx eslint . && npx prettier . --check && npm run check:docs`
- [ ] Run the app (`npm run dev`), switch the language in Settings, and check against `.mockups/20-categories.html`: filter chips relabel and re-sort, the picker opens on 8 with "Show all", "Other…" with "boulangerie" saves Bakery, and markers show the family colors.
