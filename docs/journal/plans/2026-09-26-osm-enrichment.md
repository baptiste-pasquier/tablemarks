---
title: OpenStreetMap Enrichment - Plan
type: feat
date: 2026-09-26
topic: osm-enrichment
status: ready
---

# OpenStreetMap Enrichment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep a read-only OpenStreetMap snapshot on each place (identity, address parts, hours, phone, website) and use it to add places faster (OSM results, category suggestion, link preview) and to show the zone, the open state and call/site actions on the list and the detail.

**Architecture:** One optional `osm: OsmSnapshot` object on `Restaurant`, stored as one PocketBase `json` field; everything shown from it (short zone, compact address, open state) is derived at render. `src/capture/` owns the Nominatim client (`geocode.ts`), the tag mapping (`osmTags.ts`) and a new resolve-then-commit capture (`capturePaste` returns a preview, `commitCapture` writes). `src/lib/openingHours.ts` is an in-house parser. The UI adds `src/features/places/` (display helpers and small components), a state hook for the add modal, and a `PlaceInfo` block extracted from the detail modal.

**Tech Stack:** React 19, TypeScript, i18next 26 / react-i18next 17 (typed keys), Vitest + Testing Library, Tailwind v4, lucide-react, PocketBase JS migrations.

**Spec:** `docs/journal/specs/2026-09-25-osm-enrichment-design.md`

## Global Constraints

- Nominatim only (`https://nominatim.openstreetmap.org`), every request triggered by a user gesture, 10 s timeout, `format=jsonv2&extratags=1&addressdetails=1&accept-language=<i18n language>`. No Overpass, no Google Places, no new runtime dependency.
- `osm` is read-only in the app: written only by capture, "Complete" and "Refresh", always replaced whole. The category (`cuisine`) is the only user-owned field it can pre-fill, and only when the place has none.
- No derived value is stored: short zone, compact address, open state and week table are computed at render.
- Match radius 75 m; `near` search box ±0.0015°; "opens soon" window 120 minutes.
- Eatery = `amenity` ∈ {restaurant, fast_food, cafe, bar, pub, ice_cream, food_court} or `shop` ∈ {bakery, pastry}.
- The results fold reads "N other results" — no list of kinds: translating OSM's place types is out of scope.
- `EXPORT_SCHEMA_VERSION` stays 1. The device-local dismissal list lives at `localStorage['tablemarks:osmDismissed']`.
- Repo rules (`AGENTS.md`): relative imports ordered framework → third-party → components → data/sync/lib/types → CSS; `import type` for types; `function` declarations for named module functions; no user-facing literal in a component; `en` and `fr` carry the same keys (`src/i18n/resources.test.ts` enforces it); 300 lines per module, 250 per component, 60 per function; `cn()` for class composition; primitives from `src/features/ui/` first; a component file exports only components (`react-refresh/only-export-components`).
- Every task ends green on: `npm test`, `npm run type-check`, `npx eslint .`, `npx prettier . --check`.

## Review Focus

- **A span past midnight, read after midnight** (`Fr 11:00-02:00` on Saturday at 01:00): must read "Open until 02:00", not "Closed" — test in Task 4.
- **Remote or imported `osm` that is `null` or malformed** (an old server row, a hand-edited export): must not crash or persist garbage; `null` reads as absent, garbage as absent (remote) or a rejected file (import) — tests in Task 1.
- **Typing after a selection or a preview:** "Add" must never commit a stale place for new text; any edit returns the button to "Search" — test in Task 8.
- **A manual category, then another result selected:** the user's category survives; a suggestion never overwrites it — test in Task 8.
- **`localStorage` unavailable** (private mode, blocked storage): "Not this one" must not throw; the button simply comes back next time — test in Task 11.

---

### Task 1: The `osm` snapshot in the data model, sync and import

**Files:**
- Modify: `src/types/models.ts` (add `OsmType`, `OSM_TYPES`, `OsmSnapshot`, `readOsmSnapshot`, `Restaurant.osm`)
- Modify: `src/data/restaurants.ts` (`RestaurantInput.osm`, `RestaurantPatch` includes `osm`, `createRestaurant` writes it)
- Modify: `src/sync/mappers.ts`
- Modify: `src/sync/portability/schema.ts:96-133`
- Create: `pocketbase/pb_migrations/1790380000_restaurant_osm_field.js`
- Modify: `docs/reference/data-model.md`
- Test: `src/sync/mappers.test.ts`, `src/sync/portability/import.test.ts`, `src/data/restaurants.test.ts`

**Interfaces:**
- Produces: `type OsmType = 'node' | 'way' | 'relation'`; `interface OsmSnapshot { type; id: number; checkedAt: string; street?; postcode?; city?; suburb?; quarter?; openingHours?; phone?; website? }` (all optional ones `string`); `readOsmSnapshot(x: unknown): OsmSnapshot | null` (a clean copy with known keys only, or null when invalid); `Restaurant.osm?: OsmSnapshot`; `RestaurantInput.osm?`; `RestaurantPatch` accepts `osm`.

- [ ] **Step 1: Write the failing tests**

Append to `src/sync/mappers.test.ts` inside `describe('mappers', …)`:

```ts
  const osm = {
    type: 'node',
    id: 3602657896,
    checkedAt: '2026-09-19T10:00:00.000Z',
    street: '80 Rue de Charonne',
    postcode: '75011',
    city: 'Paris',
    openingHours: 'Mo 19:00-22:30; Tu-Fr 12:15-14:00,19:00-22:30',
  } as const

  it('round-trips the OSM snapshot', () => {
    const remote = restaurantToRemote({ ...restaurant, osm }, 'user1')
    expect(remote.osm).toEqual(osm)
    expect(restaurantFromRemote(remote).osm).toEqual(osm)
  })

  it('reads an empty remote JSON field (null) as no snapshot', () => {
    const remote = { ...restaurantToRemote(restaurant, 'user1'), osm: null }
    expect(restaurantFromRemote(remote).osm).toBeUndefined()
  })

  it('drops a malformed remote snapshot instead of trusting it', () => {
    const remote = { ...restaurantToRemote(restaurant, 'user1'), osm: { type: 'area', id: 'x' } }
    expect(restaurantFromRemote(remote).osm).toBeUndefined()
  })
```

Append to `src/sync/portability/import.test.ts` inside `describe('parseImport', …)`:

```ts
  function withOsm(osm: unknown): string {
    const base = JSON.parse(envelope()) as { records: { restaurants: Record<string, unknown>[] } }
    base.records.restaurants[0].osm = osm
    return JSON.stringify(base)
  }

  it('keeps a well-formed OSM snapshot, known keys only', () => {
    const res = parseImport(
      withOsm({ type: 'way', id: 42, checkedAt: '2026-09-19T10:00:00Z', city: 'Lyon', extra: 1 }),
    )
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.records.restaurants[0].osm).toEqual({
      type: 'way',
      id: 42,
      checkedAt: '2026-09-19T10:00:00Z',
      city: 'Lyon',
    })
  })

  it('rejects a restaurant whose OSM snapshot is malformed', () => {
    expect(parseImport(withOsm({ type: 'node', id: 1.5, checkedAt: 'x' })).ok).toBe(false)
    expect(parseImport(withOsm({ type: 'node', id: 1, checkedAt: '2026-01-01', city: 3 })).ok).toBe(
      false,
    )
  })
```

Append to `src/data/restaurants.test.ts` (inside its top-level `describe`, reusing its `freshDB` setup):

```ts
  it('stores an OSM snapshot on create and replaces it on update', async () => {
    const osm = { type: 'node' as const, id: 1, checkedAt: '2026-09-19T10:00:00.000Z' }
    const r = await createRestaurant({ name: 'X', lat: 1, lng: 1, osm })
    expect((await getRestaurant(r.id))?.osm).toEqual(osm)
    const next = { ...osm, checkedAt: '2026-09-26T10:00:00.000Z', phone: '+33 1 00 00 00 00' }
    await updateRestaurant(r.id, { osm: next })
    expect((await getRestaurant(r.id))?.osm).toEqual(next)
  })
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/sync/mappers.test.ts src/sync/portability/import.test.ts src/data/restaurants.test.ts`
Expected: FAIL (type errors on `osm`, `remote.osm` undefined, snapshot not kept).

- [ ] **Step 3: Add the type and its reader to `src/types/models.ts`**

Insert after `interface SyncFields`:

```ts
/** The kind of OpenStreetMap object a snapshot came from. */
export type OsmType = 'node' | 'way' | 'relation'

export const OSM_TYPES: readonly OsmType[] = ['node', 'way', 'relation']

/**
 * A read-only snapshot of one OpenStreetMap object, replaced whole on refresh and never edited in
 * the app. Raw parts only: the short zone, the compact address and the open state are derived at
 * render (`features/places/placeDisplay.ts`, `lib/openingHours.ts`), never stored.
 */
export interface OsmSnapshot {
  type: OsmType
  id: number
  /** ISO instant the snapshot was fetched. */
  checkedAt: string
  /** `house_number` + `road` ("80 Rue de Charonne"). */
  street?: string
  postcode?: string
  /** `city` ?? `town` ?? `village` ?? `municipality`. */
  city?: string
  suburb?: string
  /** `city_block` ?? `quarter` ?? `neighbourhood`: shown on the detail only. */
  quarter?: string
  /** The raw `opening_hours` tag. */
  openingHours?: string
  phone?: string
  website?: string
}

const OSM_TEXT_KEYS = [
  'street',
  'postcode',
  'city',
  'suburb',
  'quarter',
  'openingHours',
  'phone',
  'website',
] as const

/**
 * The one reader of a snapshot that crossed a boundary (a PocketBase row, an import file): a
 * clean copy holding only the known keys, or null when the shape is wrong.
 */
export function readOsmSnapshot(x: unknown): OsmSnapshot | null {
  if (typeof x !== 'object' || x === null) return null
  const o = x as Record<string, unknown>
  if (!(OSM_TYPES as readonly unknown[]).includes(o.type)) return null
  if (typeof o.id !== 'number' || !Number.isSafeInteger(o.id) || o.id <= 0) return null
  if (typeof o.checkedAt !== 'string' || Number.isNaN(Date.parse(o.checkedAt))) return null
  const snapshot: OsmSnapshot = { type: o.type as OsmType, id: o.id, checkedAt: o.checkedAt }
  for (const key of OSM_TEXT_KEYS) {
    const value = o[key]
    if (value === undefined) continue
    if (typeof value !== 'string') return null
    snapshot[key] = value
  }
  return snapshot
}
```

In `interface Restaurant`, after `added?: string`:

```ts
  /** The OpenStreetMap object this place is matched to, as last fetched. Absent until matched. */
  osm?: OsmSnapshot
```

- [ ] **Step 4: Write it through the repository (`src/data/restaurants.ts`)**

Add to `RestaurantInput` after `note?: string`:

```ts
  osm?: OsmSnapshot
```

Change the import to `import type { OsmSnapshot, Restaurant } from '../types/models'`, add `'osm'` to the `Pick` in `RestaurantPatch`, and in `createRestaurant` add `osm: input.osm,` after `note: input.note,`.

- [ ] **Step 5: Map it to and from PocketBase (`src/sync/mappers.ts`)**

Import `readOsmSnapshot` alongside `VERDICTS`. Add to `RemoteRestaurant` after `added?: string`:

```ts
  /** PocketBase `json` field: an empty one comes back as null. */
  osm?: unknown
```

In `restaurantToRemote`, after `added: r.added,` add `osm: r.osm,`. In `restaurantFromRemote`, after the `added:` line add:

```ts
    // A malformed row is treated as unmatched, like a drifted verdict is coerced (`asVerdict`).
    osm: readOsmSnapshot(r.osm) ?? undefined,
```

A client that predates this field never sends `osm`, and `upsert` uses `update(id, body)`, which leaves absent fields untouched, so it cannot erase a snapshot on the server.

- [ ] **Step 6: Validate it on import (`src/sync/portability/schema.ts`)**

Import `readOsmSnapshot` with the other model imports. In `asRestaurant`, before the final `return {`:

```ts
  // Absent is fine; present must be a well-formed snapshot, or the file is refused like any
  // other malformed field.
  const osm = r.osm === undefined ? undefined : readOsmSnapshot(r.osm)
  if (osm === null) return null
```

and add `osm,` after `added: …,` in the returned object.

- [ ] **Step 7: Add the PocketBase field**

Create `pocketbase/pb_migrations/1790380000_restaurant_osm_field.js`:

```js
/// <reference path="../pb_data/types.d.ts" />

// Adds `osm` to `restaurants`: the read-only OpenStreetMap snapshot (see
// docs/reference/data-model.md). One JSON field rather than a column per tag, so a later tag
// needs no migration. Owner-scoped rules on the collection already cover it.

migrate(
  (app) => {
    const restaurants = app.findCollectionByNameOrId('restaurants')
    restaurants.fields.add(new JSONField({ name: 'osm', required: false, maxSize: 8192 }))
    app.save(restaurants)
  },
  (app) => {
    const restaurants = app.findCollectionByNameOrId('restaurants')
    restaurants.fields.removeByName('osm')
    app.save(restaurants)
  },
)
```

- [ ] **Step 8: Document the field (`docs/reference/data-model.md`)**

In the `## Restaurant` code block, after the `note?` line add:

```
osm?                           read-only OpenStreetMap snapshot (below), replaced whole on refresh
```

After the "Status is derived" paragraph add:

```markdown
### OSM snapshot

`osm` holds `type` (`node` | `way` | `relation`), `id`, `checkedAt` (ISO instant) and, when OSM has
them, `street`, `postcode`, `city`, `suburb`, `quarter`, `openingHours` (the raw tag), `phone` and
`website`. It is written only by capture, "Complete from OpenStreetMap" and "Refresh", never
edited, and always replaced whole. The short zone ("Paris 11e"), the compact address and the open
state are derived from it at render. It is one PocketBase `json` field; an empty field reads as
absent, a malformed one as absent on sync and as a rejected file on import.
```

In `## Local ↔ PocketBase mapping`, add a line stating that `osm` passes through unchanged as a `json` field.

- [ ] **Step 9: Run the tests to verify they pass**

Run: `npx vitest run src/sync/mappers.test.ts src/sync/portability/import.test.ts src/data/restaurants.test.ts && npm run type-check`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add src/types/models.ts src/data/restaurants.ts src/data/restaurants.test.ts src/sync/mappers.ts src/sync/mappers.test.ts src/sync/portability/schema.ts src/sync/portability/import.test.ts pocketbase/pb_migrations/1790380000_restaurant_osm_field.js docs/reference/data-model.md
git commit -m "feat(data): store a read-only OpenStreetMap snapshot on a place"
```

---

### Task 2: Nominatim rows to candidates, and the category OSM suggests

**Files:**
- Create: `src/lib/foldText.ts`
- Modify: `src/features/facets/cuisineCatalog.ts` (`normalizeCuisineText` delegates to `foldText`)
- Create: `src/capture/osmTags.ts`
- Modify: `src/capture/geocode.ts` (only the `GeoCandidate` interface grows)
- Create: `src/features/facets/osmCategory.ts`
- Test: `src/lib/foldText.test.ts`, `src/capture/osmTags.test.ts`, `src/features/facets/osmCategory.test.ts`

**Interfaces:**
- Consumes: `OsmSnapshot`, `OsmType` (Task 1); `CUISINE_CATALOG`, `CuisineKey` (`cuisineCatalog.ts`).
- Produces: `foldText(text: string): string`; `interface NominatimRow`; `candidateFrom(row: NominatimRow, checkedAt: string): GeoCandidate`; `isEatery(c: Pick<GeoCandidate, 'osmClass'>): boolean`; `GeoCandidate` gains `osm?: OsmSnapshot`, `osmClass?: string` (`"amenity=restaurant"`), `cuisineTag?: string` (raw); `suggestCategory(c: { cuisineTag?: string; osmClass?: string }): CuisineKey | undefined`.

- [ ] **Step 1: Write the failing tests**

`src/lib/foldText.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { foldText } from './foldText'

describe('foldText', () => {
  it('folds case, Latin accents, underscores and spacing', () => {
    expect(foldText('  Café_du   Coin ')).toBe('cafe du coin')
  })

  it('keeps marks that change a word in another script', () => {
    expect(foldText('パン')).toBe('パン')
  })
})
```

`src/capture/osmTags.test.ts` (rows are real Nominatim replies from 2026-09-25, trimmed):

```ts
import { describe, expect, it } from 'vitest'
import { candidateFrom, isEatery, type NominatimRow } from './osmTags'

const CHECKED = '2026-09-26T10:00:00.000Z'

const SEPTIME: NominatimRow = {
  osm_type: 'node',
  osm_id: 3602657896,
  lat: '48.8536026',
  lon: '2.3809558',
  category: 'amenity',
  type: 'restaurant',
  name: 'Septime',
  display_name: 'Septime, 80, Rue de Charonne, Paris 11e Arrondissement, Paris, 75011, France',
  address: {
    house_number: '80',
    road: 'Rue de Charonne',
    city_block: 'Quartier Sainte-Marguerite',
    suburb: 'Paris 11e Arrondissement',
    city: 'Paris',
    postcode: '75011',
  },
  extratags: {
    cuisine: 'french',
    'contact:phone': '+33 1 43 67 38 29',
    'contact:website': 'http://septime-charonne.fr/',
    opening_hours: 'Mo 19:00-22:30; Tu-Fr 12:15-14:00,19:00-22:30',
  },
}

describe('candidateFrom', () => {
  it('maps a restaurant row to a candidate with its snapshot', () => {
    expect(candidateFrom(SEPTIME, CHECKED)).toEqual({
      name: 'Septime',
      lat: 48.8536026,
      lng: 2.3809558,
      address: SEPTIME.display_name,
      osmClass: 'amenity=restaurant',
      cuisineTag: 'french',
      osm: {
        type: 'node',
        id: 3602657896,
        checkedAt: CHECKED,
        street: '80 Rue de Charonne',
        postcode: '75011',
        city: 'Paris',
        suburb: 'Paris 11e Arrondissement',
        quarter: 'Quartier Sainte-Marguerite',
        openingHours: 'Mo 19:00-22:30; Tu-Fr 12:15-14:00,19:00-22:30',
        phone: '+33 1 43 67 38 29',
        website: 'http://septime-charonne.fr/',
      },
    })
  })

  it('prefers the plain phone/website tags, and falls back through town and village', () => {
    const c = candidateFrom(
      {
        ...SEPTIME,
        address: { village: "Collonges-au-Mont-d'Or", postcode: '69660' },
        extratags: { phone: '+33 1', 'contact:phone': '+33 2', website: 'https://a.fr' },
      },
      CHECKED,
    )
    expect(c.osm).toMatchObject({ city: "Collonges-au-Mont-d'Or", phone: '+33 1', website: 'https://a.fr' })
    expect(c.osm).not.toHaveProperty('street')
  })

  it('has no snapshot and no class for a row without an OSM identity', () => {
    const c = candidateFrom({ display_name: 'Chez Marcel, Paris', lat: '1', lon: '2' }, CHECKED)
    expect(c).toEqual({ name: 'Chez Marcel', lat: 1, lng: 2, address: 'Chez Marcel, Paris' })
  })
})

describe('isEatery', () => {
  it.each([
    ['amenity=restaurant', true],
    ['amenity=cafe', true],
    ['amenity=pub', true],
    ['shop=pastry', true],
    ['shop=bakery', true],
    ['shop=leather', false],
    ['highway=residential', false],
  ])('%s → %s', (osmClass, expected) => {
    expect(isEatery({ osmClass })).toBe(expected)
  })

  it('is false without a class', () => {
    expect(isEatery({})).toBe(false)
  })
})
```

`src/features/facets/osmCategory.test.ts`:

```ts
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
    [{ cuisineTag: 'coffee_shop', osmClass: 'amenity=bar' }, 'coffee_shop'],
  ] as const)('%o → %s', (input, expected) => {
    expect(suggestCategory(input)).toBe(expected)
  })

  it.each([
    [{ cuisineTag: 'ethiopian' }],
    [{ cuisineTag: 'regional;international' }],
    [{ osmClass: 'amenity=restaurant' }],
    [{}],
  ])('suggests nothing for %o', (input) => {
    expect(suggestCategory(input)).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/foldText.test.ts src/capture/osmTags.test.ts src/features/facets/osmCategory.test.ts`
Expected: FAIL (modules not found).

- [ ] **Step 3: Extract `foldText`**

Create `src/lib/foldText.ts` by moving the body and the doc comment of `normalizeCuisineText` from `src/features/facets/cuisineCatalog.ts`:

```ts
/**
 * The comparison form of a name: no Latin accents, underscores as spaces, single spaces, trimmed,
 * lowercase. A mark is stripped only from a Latin letter: in other scripts it changes the word
 * (パン is bread, ハン is not; й is not и), so those are recomposed intact.
 */
export function foldText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/(\p{Script=Latin})\p{M}+/gu, '$1')
    .normalize('NFC')
    .replace(/[\s_]+/g, ' ')
    .trim()
    .toLowerCase()
}
```

In `cuisineCatalog.ts`, add `import { foldText } from '../../lib/foldText'` and replace the function with:

```ts
/** The comparison form of a typed name (`foldText`), so "Coffee shop" meets the key `coffee_shop`. */
export function normalizeCuisineText(text: string): string {
  return foldText(text)
}
```

- [ ] **Step 4: Grow `GeoCandidate` in `src/capture/geocode.ts`**

Add `import type { OsmSnapshot } from '../types/models'` and replace the interface:

```ts
export interface GeoCandidate {
  name: string
  lat: number
  lng: number
  address?: string
  /** The OpenStreetMap object behind this result. Absent for a row without an OSM identity. */
  osm?: OsmSnapshot
  /** How Nominatim classes the object, `category=type` ("amenity=restaurant", "shop=leather"). */
  osmClass?: string
  /** The raw `cuisine` tag ("falafel;israeli"), read by `suggestCategory`. */
  cuisineTag?: string
}
```

- [ ] **Step 5: Write `src/capture/osmTags.ts`**

```ts
import type { GeoCandidate } from './geocode'
import type { OsmSnapshot, OsmType } from '../types/models'

/** One row of Nominatim's `jsonv2` reply, requested with `addressdetails=1&extratags=1`. */
export interface NominatimRow {
  display_name: string
  lat: string
  lon: string
  name?: string
  osm_type?: string
  osm_id?: number
  category?: string
  type?: string
  address?: Record<string, string>
  extratags?: Record<string, string> | null
}

/** The kinds of place this app saves: exactly the families of the category catalog. */
const EATERY_CLASSES: ReadonlySet<string> = new Set([
  'amenity=restaurant',
  'amenity=fast_food',
  'amenity=cafe',
  'amenity=bar',
  'amenity=pub',
  'amenity=ice_cream',
  'amenity=food_court',
  'shop=bakery',
  'shop=pastry',
])

export function isEatery(candidate: Pick<GeoCandidate, 'osmClass'>): boolean {
  return candidate.osmClass !== undefined && EATERY_CLASSES.has(candidate.osmClass)
}

function asOsmType(value: string | undefined): OsmType | undefined {
  return value === 'node' || value === 'way' || value === 'relation' ? value : undefined
}

/** Drops the keys whose value is undefined, so a record carries only what OSM had. */
function compact<T extends object>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T
}

function snapshotFrom(row: NominatimRow, checkedAt: string): OsmSnapshot | undefined {
  const type = asOsmType(row.osm_type)
  if (!type || row.osm_id === undefined) return undefined
  const a = row.address ?? {}
  const tags = row.extratags ?? {}
  const street = [a.house_number, a.road].filter(Boolean).join(' ')
  return compact({
    type,
    id: row.osm_id,
    checkedAt,
    street: street || undefined,
    postcode: a.postcode,
    city: a.city ?? a.town ?? a.village ?? a.municipality,
    suburb: a.suburb,
    quarter: a.city_block ?? a.quarter ?? a.neighbourhood,
    openingHours: tags.opening_hours,
    phone: tags.phone ?? tags['contact:phone'],
    website: tags.website ?? tags['contact:website'],
  })
}

/** A Nominatim row as a candidate, with its snapshot stamped `checkedAt`. */
export function candidateFrom(row: NominatimRow, checkedAt: string): GeoCandidate {
  return compact({
    name: row.name || row.display_name.split(',')[0],
    lat: parseFloat(row.lat),
    lng: parseFloat(row.lon),
    address: row.display_name,
    osm: snapshotFrom(row, checkedAt),
    osmClass: row.category && row.type ? `${row.category}=${row.type}` : undefined,
    cuisineTag: row.extratags?.cuisine,
  })
}
```

- [ ] **Step 6: Write `src/features/facets/osmCategory.ts`**

```ts
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
  const alias = values.find((value) => value in CUISINE_ALIASES)
  if (alias) return CUISINE_ALIASES[alias]
  return c.osmClass ? CLASS_CATEGORIES[c.osmClass] : undefined
}
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npx vitest run src/lib/foldText.test.ts src/capture/osmTags.test.ts src/features/facets/osmCategory.test.ts src/features/facets/cuisineCatalog.test.ts && npm run type-check`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/lib/foldText.ts src/lib/foldText.test.ts src/features/facets/cuisineCatalog.ts src/capture/osmTags.ts src/capture/osmTags.test.ts src/capture/geocode.ts src/features/facets/osmCategory.ts src/features/facets/osmCategory.test.ts
git commit -m "feat(capture): read OSM tags into candidates and a suggested category"
```

---

### Task 3: The Nominatim client: enriched search, lookup, match near a point

**Files:**
- Modify: `src/capture/geocode.ts`
- Modify (stubs gain `lookup`): `src/capture/capture.test.ts:30`, `src/capture/resolvePending.test.ts:39`, `src/features/capture/AddPlace.test.tsx:26,231,238`, `src/sync/bootstrap.test.ts:143`
- Test: `src/capture/geocode.test.ts`

**Interfaces:**
- Consumes: `candidateFrom`, `isEatery`, `NominatimRow` (Task 2); `foldText` (Task 2); `haversineMeters` (`src/lib/geo.ts`).
- Produces: `interface SearchOptions { signal?: AbortSignal; near?: { lat: number; lng: number } }`; `GeocodeProvider.search(query, options?)`, `.reverse(lat, lng, signal?)`, `.lookup(type: OsmType, id: number, signal?): Promise<GeoCandidate | null>`; `searchPlaces(query: string, signal?: AbortSignal)`; `matchNear(name: string, lat: number, lng: number, signal?: AbortSignal): Promise<GeoCandidate | null>`; `lookupOsm(type: OsmType, id: number, signal?: AbortSignal): Promise<GeoCandidate | null>`; `MATCH_RADIUS_M = 75`.

- [ ] **Step 1: Write the failing tests**

Replace `src/capture/geocode.test.ts` with:

```ts
import { describe, it, expect, vi, afterEach } from 'vitest'
import { lookupOsm, matchNear, nominatim, setGeocodeProvider, type GeoCandidate } from './geocode'

afterEach(() => {
  vi.unstubAllGlobals()
  setGeocodeProvider(nominatim)
})

function stubFetch(body: unknown, ok = true) {
  const fetchMock = vi.fn(async (_url: string) => ({ ok, status: ok ? 200 : 503, json: async () => body }))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function calledUrl(fetchMock: ReturnType<typeof stubFetch>): URL {
  return new URL(fetchMock.mock.calls[0][0])
}

describe('nominatim provider', () => {
  it('maps search rows to candidates', async () => {
    stubFetch([
      { display_name: 'Chez Marcel, Paris, France', name: 'Chez Marcel', lat: '48.8566', lon: '2.3522' },
    ])
    const out = await nominatim.search('chez marcel')
    expect(out).toEqual([
      { name: 'Chez Marcel', lat: 48.8566, lng: 2.3522, address: 'Chez Marcel, Paris, France' },
    ])
  })

  it('asks for ten rows with tags, address parts and the app language', async () => {
    const fetchMock = stubFetch([])
    await nominatim.search('septime')
    const url = calledUrl(fetchMock)
    expect(url.pathname).toBe('/search')
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      q: 'septime',
      limit: '10',
      format: 'jsonv2',
      extratags: '1',
      addressdetails: '1',
      'accept-language': 'en',
    })
    expect(url.searchParams.has('viewbox')).toBe(false)
  })

  it('bounds a near search to a small box around the point', async () => {
    const fetchMock = stubFetch([])
    await nominatim.search('le servan', { near: { lat: 48.86, lng: 2.38 } })
    const url = calledUrl(fetchMock)
    expect(url.searchParams.get('bounded')).toBe('1')
    const [left, top, right, bottom] = url.searchParams.get('viewbox')!.split(',').map(Number)
    expect(left).toBeCloseTo(2.3785)
    expect(top).toBeCloseTo(48.8615)
    expect(right).toBeCloseTo(2.3815)
    expect(bottom).toBeCloseTo(48.8585)
  })

  it('throws when search fails', async () => {
    stubFetch(null, false)
    await expect(nominatim.search('x')).rejects.toThrow(/failed/i)
  })

  it('looks an object up by type and id', async () => {
    const fetchMock = stubFetch([
      { osm_type: 'way', osm_id: 42, display_name: 'X, Lyon', name: 'X', lat: '45', lon: '4.8' },
    ])
    const found = await nominatim.lookup('way', 42)
    expect(calledUrl(fetchMock).searchParams.get('osm_ids')).toBe('W42')
    expect(found?.osm).toMatchObject({ type: 'way', id: 42 })
  })

  it('reads an empty lookup as an object gone from OSM', async () => {
    stubFetch([])
    expect(await nominatim.lookup('node', 1)).toBeNull()
  })

  it('returns a display name for reverse geocoding', async () => {
    stubFetch({ display_name: '1 Rue de Rivoli, Paris' })
    expect(await nominatim.reverse(48.85, 2.35)).toBe('1 Rue de Rivoli, Paris')
  })
})

describe('matchNear', () => {
  const HERE = { lat: 48.8586, lng: 2.38 }

  function candidate(over: Partial<GeoCandidate>): GeoCandidate {
    return {
      name: 'Le Servan',
      lat: HERE.lat,
      lng: HERE.lng,
      osmClass: 'amenity=restaurant',
      osm: { type: 'node', id: 1, checkedAt: '2026-09-26T10:00:00.000Z' },
      ...over,
    }
  }

  function provide(rows: GeoCandidate[]) {
    const search = vi.fn(async () => rows)
    setGeocodeProvider({ search, reverse: async () => undefined, lookup: async () => null })
    return search
  }

  it('searches near the point and keeps the nearest eatery with the same name', async () => {
    const search = provide([
      candidate({ lat: HERE.lat + 0.0005, osm: { type: 'node', id: 2, checkedAt: 'x' } }),
      candidate({ lat: HERE.lat + 0.0002 }),
    ])
    const found = await matchNear('le servan', HERE.lat, HERE.lng)
    expect(search).toHaveBeenCalledWith('le servan', { near: HERE, signal: undefined })
    expect(found?.osm?.id).toBe(1)
  })

  it('matches a name that contains the other once folded', async () => {
    provide([candidate({ name: 'Mokonuts Cafe and Bakery', osmClass: 'shop=pastry' })])
    expect(await matchNear('Mokonuts', HERE.lat, HERE.lng)).not.toBeNull()
  })

  it.each([
    ['a non-eatery', { osmClass: 'shop=leather' }],
    ['a place past 75 m', { lat: HERE.lat + 0.001 }],
    ['another name', { name: 'Double Dragon' }],
    ['a row without an OSM identity', { osm: undefined }],
  ])('ignores %s', async (_label, over) => {
    provide([candidate(over)])
    expect(await matchNear('Le Servan', HERE.lat, HERE.lng)).toBeNull()
  })

  it('does not search for an empty name', async () => {
    const search = provide([candidate({})])
    expect(await matchNear('  ', HERE.lat, HERE.lng)).toBeNull()
    expect(search).not.toHaveBeenCalled()
  })

  it('passes lookups through to the provider', async () => {
    const lookup = vi.fn(async () => null)
    setGeocodeProvider({ search: async () => [], reverse: async () => undefined, lookup })
    await lookupOsm('relation', 9)
    expect(lookup).toHaveBeenCalledWith('relation', 9, undefined)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/capture/geocode.test.ts`
Expected: FAIL (`lookup`, `matchNear`, `lookupOsm` missing; URL params absent).

- [ ] **Step 3: Rewrite `src/capture/geocode.ts` below the `GeoCandidate` interface**

```ts
import { candidateFrom, isEatery, type NominatimRow } from './osmTags'
import i18n from '../i18n/config'
import { foldText } from '../lib/foldText'
import { haversineMeters } from '../lib/geo'
import type { OsmSnapshot, OsmType } from '../types/models'

// (GeoCandidate interface from Task 2 stays here.)

export interface SearchOptions {
  signal?: AbortSignal
  /** Restrict the search to a small box around this point, to match a known position to OSM. */
  near?: { lat: number; lng: number }
}

export interface GeocodeProvider {
  search(query: string, options?: SearchOptions): Promise<GeoCandidate[]>
  reverse(lat: number, lng: number, signal?: AbortSignal): Promise<string | undefined>
  /** The object as OSM has it now, or null when OSM no longer has it. */
  lookup(type: OsmType, id: number, signal?: AbortSignal): Promise<GeoCandidate | null>
}

// Default provider: Nominatim (OpenStreetMap) — no API key, free. Honor the usage policy
// (max ~1 req/s): every call here follows a user gesture, never a keystroke or a loop.
const NOMINATIM = 'https://nominatim.openstreetmap.org'

/** Half the side of the `near` box, in degrees: ~165 m north–south, ~110 m east–west in Paris. */
const NEAR_BOX_DEG = 0.0015

/** How far a Maps position may sit from its OSM object and still be the same place. */
export const MATCH_RADIUS_M = 75

function detailParams(): string {
  const language = encodeURIComponent(i18n.language || 'en')
  return `format=jsonv2&extratags=1&addressdetails=1&accept-language=${language}`
}

async function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal: signal ?? AbortSignal.timeout(10_000),
  })
  if (!res.ok) throw new Error(`Geocoding request failed (${res.status})`)
  return (await res.json()) as T
}

function viewbox({ lat, lng }: { lat: number; lng: number }): string {
  const d = NEAR_BOX_DEG
  return `${lng - d},${lat + d},${lng + d},${lat - d}`
}

export const nominatim: GeocodeProvider = {
  async search(query, options = {}) {
    let url = `${NOMINATIM}/search?${detailParams()}&limit=10&q=${encodeURIComponent(query)}`
    if (options.near) url += `&bounded=1&viewbox=${viewbox(options.near)}`
    const checkedAt = new Date().toISOString()
    const rows = await getJson<NominatimRow[]>(url, options.signal)
    return rows.map((row) => candidateFrom(row, checkedAt))
  },

  async reverse(lat, lng, signal) {
    const url = `${NOMINATIM}/reverse?format=jsonv2&lat=${lat}&lon=${lng}`
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: signal ?? AbortSignal.timeout(10_000),
    })
    if (!res.ok) return undefined
    const data = (await res.json()) as { display_name?: string }
    return data.display_name
  },

  async lookup(type, id, signal) {
    const ref = `${type[0].toUpperCase()}${id}`
    const rows = await getJson<NominatimRow[]>(`${NOMINATIM}/lookup?${detailParams()}&osm_ids=${ref}`, signal)
    return rows[0] ? candidateFrom(rows[0], new Date().toISOString()) : null
  },
}

let provider: GeocodeProvider = nominatim

/** Override the geocoding provider (e.g. in tests or to swap to Photon/Geoapify). */
export function setGeocodeProvider(p: GeocodeProvider): void {
  provider = p
}

export function searchPlaces(query: string, signal?: AbortSignal): Promise<GeoCandidate[]> {
  return provider.search(query, { signal })
}

export function reverseGeocode(
  lat: number,
  lng: number,
  signal?: AbortSignal,
): Promise<string | undefined> {
  return provider.reverse(lat, lng, signal)
}

export function lookupOsm(type: OsmType, id: number, signal?: AbortSignal): Promise<GeoCandidate | null> {
  return provider.lookup(type, id, signal)
}

/**
 * The OpenStreetMap object a known position and name most likely are: the nearest eatery within
 * `MATCH_RADIUS_M` whose folded name contains the other ("Mokonuts" meets "Mokonuts Cafe and
 * Bakery"). Null when none qualifies. Throws when the request fails, so a caller can tell
 * "nothing there" from "could not ask".
 */
export async function matchNear(
  name: string,
  lat: number,
  lng: number,
  signal?: AbortSignal,
): Promise<GeoCandidate | null> {
  const wanted = foldText(name)
  if (!wanted) return null
  const rows = await provider.search(name, { near: { lat, lng }, signal })
  let best: GeoCandidate | null = null
  let bestDistance = MATCH_RADIUS_M
  for (const c of rows) {
    const got = foldText(c.name)
    if (!c.osm || !isEatery(c) || !got || !(got.includes(wanted) || wanted.includes(got))) continue
    const distance = haversineMeters(lat, lng, c.lat, c.lng)
    if (distance <= bestDistance) {
      best = c
      bestDistance = distance
    }
  }
  return best
}
```

The import block above replaces the file's imports (one `import type { OsmSnapshot, OsmType }` line: `GeoCandidate` uses the first, the provider the second).

- [ ] **Step 4: Give every provider stub a `lookup`**

In `src/capture/capture.test.ts:30`, `src/capture/resolvePending.test.ts:39`, `src/features/capture/AddPlace.test.tsx:26`, `:231`, `:238` and `src/sync/bootstrap.test.ts:143`, add `lookup: async () => null,` to the object passed to `setGeocodeProvider`. Nothing else changes in those files in this task.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/capture src/features/capture src/sync/bootstrap.test.ts && npm run type-check`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/capture/geocode.ts src/capture/geocode.test.ts src/capture/capture.test.ts src/capture/resolvePending.test.ts src/features/capture/AddPlace.test.tsx src/sync/bootstrap.test.ts
git commit -m "feat(capture): enriched Nominatim search, lookup and match near a point"
```

---

### Task 4: Reading `opening_hours`

**Files:**
- Create: `src/lib/openingHours.ts`
- Test: `src/lib/openingHours.test.ts`

**Interfaces:**
- Produces: `interface Span { start: number; end: number }` (minutes from the day's midnight; `end` > 1440 runs into the next day); `type Week = Span[][]` (7 days, Monday first); `type OpenState = { kind: 'open'; closesAt: number | null } | { kind: 'opens-soon'; opensAt: number } | { kind: 'closed'; opensAt: number } | { kind: 'closed-today' }`; `parseOpeningHours(raw: string): Week | null`; `openStateAt(week: Week, at: Date): OpenState`; `openStateOf(raw: string | undefined, at: Date): OpenState | null`; `formatClock(minutes: number): string`; `weekdayIndex(at: Date): number` (0 = Monday); `OPENS_SOON_MINUTES = 120`.

- [ ] **Step 1: Write the failing tests**

`src/lib/openingHours.test.ts` (values are real Paris tags from 2026-09-25):

```ts
import { describe, expect, it } from 'vitest'
import { formatClock, openStateAt, openStateOf, parseOpeningHours, type Week } from './openingHours'

/** 2026-09-21 is a Monday; `day` 0 = Monday. Local time, like the app. */
function at(day: number, clock: string): Date {
  const [h, m] = clock.split(':').map(Number)
  return new Date(2026, 8, 21 + day, h, m)
}

function week(raw: string): Week {
  const parsed = parseOpeningHours(raw)
  if (!parsed) throw new Error(`unparseable: ${raw}`)
  return parsed
}

const H = (clock: string) => {
  const [h, m] = clock.split(':').map(Number)
  return h * 60 + m
}

describe('parseOpeningHours', () => {
  it('reads days, ranges and several spans a day', () => {
    const w = week('Mo 19:00-22:30; Tu-Fr 12:15-14:00,19:00-22:30')
    expect(w[0]).toEqual([{ start: H('19:00'), end: H('22:30') }])
    expect(w[3]).toEqual([
      { start: H('12:15'), end: H('14:00') },
      { start: H('19:00'), end: H('22:30') },
    ])
    expect(w[5]).toEqual([])
    expect(w[6]).toEqual([])
  })

  it('wraps a range through Sunday', () => {
    const w = week('Su-Th 11:00-24:00, Fr,Sa 11:00-02:00')
    expect(w[6]).toEqual([{ start: H('11:00'), end: 1440 }])
    expect(w[4]).toEqual([{ start: H('11:00'), end: 1440 + H('02:00') }])
  })

  it('adds a comma rule to the days it names, and replaces them with a semicolon rule', () => {
    expect(week('Mo-Fr 19:30-22:30, Tu-Fr 12:00-14:00')[1]).toEqual([
      { start: H('12:00'), end: H('14:00') },
      { start: H('19:30'), end: H('22:30') },
    ])
    expect(week('Mo-Su 12:00-23:00; We off')[2]).toEqual([])
  })

  it('applies a rule without days to every day', () => {
    const w = week('18:00-23:00, Mo-Sa 11:30-14:30')
    expect(w[6]).toEqual([{ start: H('18:00'), end: H('23:00') }])
    expect(w[0]).toHaveLength(2)
  })

  it('reads 24/7 and ignores public-holiday selectors', () => {
    expect(week('24/7').every((d) => d.length === 1 && d[0].end === 1440)).toBe(true)
    expect(week('Mo-Su,PH 11:00-23:00')[0]).toEqual([{ start: H('11:00'), end: H('23:00') }])
    expect(week('Mo-Fr 12:00-14:00; PH off')[0]).toHaveLength(1)
  })

  it.each([
    '',
    'Mo-Sa',
    'Mo-Fr 10:00-20:00 || "by appointment"',
    '11:30-23:00; Mo-Th 15:00-18:30 closed',
    'Mo-Fr 08:00-sunset',
    'week 1-20 Mo-Fr 12:00-14:00',
    'Jan-Mar Mo-Fr 12:00-14:00',
    'Mo 25:00-26:00',
  ])('refuses %j', (raw) => {
    expect(parseOpeningHours(raw)).toBeNull()
  })
})

describe('openStateAt', () => {
  const servan = week('Mo-Fr 19:30-22:30, Tu-Fr 12:00-14:00')

  it('is open inside a span, with its closing time', () => {
    expect(openStateAt(servan, at(1, '12:30'))).toEqual({ kind: 'open', closesAt: H('14:00') })
  })

  it('opens soon within two hours, closed with a time beyond', () => {
    expect(openStateAt(servan, at(1, '18:40'))).toEqual({ kind: 'opens-soon', opensAt: H('19:30') })
    expect(openStateAt(servan, at(1, '15:00'))).toEqual({ kind: 'closed', opensAt: H('19:30') })
  })

  it('is closed today once the last span is over, or on a day off', () => {
    expect(openStateAt(servan, at(1, '23:00'))).toEqual({ kind: 'closed-today' })
    expect(openStateAt(servan, at(5, '12:30'))).toEqual({ kind: 'closed-today' })
  })

  it("stays open past midnight on yesterday's span", () => {
    const late = week('Mo-Fr 11:00-02:00')
    expect(openStateAt(late, at(5, '01:00'))).toEqual({ kind: 'open', closesAt: H('02:00') })
    expect(openStateAt(late, at(4, '23:30'))).toEqual({ kind: 'open', closesAt: H('02:00') })
    expect(openStateAt(late, at(5, '02:00'))).toEqual({ kind: 'closed-today' })
  })

  it('has no closing time around the clock', () => {
    expect(openStateAt(week('24/7'), at(3, '03:00'))).toEqual({ kind: 'open', closesAt: null })
  })
})

describe('openStateOf and formatClock', () => {
  it('is null for an absent or unreadable value', () => {
    expect(openStateOf(undefined, at(0, '12:00'))).toBeNull()
    expect(openStateOf('sunrise-sunset', at(0, '12:00'))).toBeNull()
  })

  it('formats minutes as a 24-hour clock, wrapping past midnight', () => {
    expect(formatClock(H('09:05'))).toBe('09:05')
    expect(formatClock(1440)).toBe('00:00')
    expect(formatClock(1440 + 90)).toBe('01:30')
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/openingHours.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Write `src/lib/openingHours.ts`**

```ts
/**
 * A reader for the common subset of OpenStreetMap's `opening_hours` syntax: weekday selectors
 * (singles, ranges wrapping through Sunday, comma lists), time spans (several a day, past
 * midnight), `off`/`closed`, `24/7`, and `PH` (accepted, not modelled). Anything else — weeks,
 * months, dates, `sunrise`, comments, `||` fallbacks, "closed" spans — makes the whole value
 * unreadable, and the UI shows it raw. This subset reads ~95% of the Paris values measured.
 */

const DAY_CODES = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'] as const
type DayCode = (typeof DAY_CODES)[number]
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6]
const MINUTES_PER_DAY = 1440

/** How close an opening must be to read as "opens soon". */
export const OPENS_SOON_MINUTES = 120

/** An opening interval in minutes from its day's midnight; `end` past 1440 runs into the next day. */
export interface Span {
  start: number
  end: number
}

/** Seven days of spans, Monday first. An empty day is closed. */
export type Week = Span[][]

export type OpenState =
  /** `closesAt` is null when the place is open around the clock. */
  | { kind: 'open'; closesAt: number | null }
  | { kind: 'opens-soon'; opensAt: number }
  | { kind: 'closed'; opensAt: number }
  | { kind: 'closed-today' }

const DAY = '(?:Mo|Tu|We|Th|Fr|Sa|Su|PH)'
const RULE = new RegExp(`^(?:(${DAY}(?:-${DAY})?(?:,${DAY}(?:-${DAY})?)*)\\s+)?(.+)$`)
// A comma that ends one rule and starts the next ("Su-Th 11:00-24:00, Fr,Sa 11:00-02:00"): it
// follows a time or off/closed and precedes a weekday. A comma inside a weekday list ("Mo,We")
// follows a letter, and one inside a time list precedes a digit, so neither matches.
const ADDITIONAL_RULE = new RegExp(`(?<=\\d|off|closed)\\s*,\\s*(?=${DAY}\\b)`)
const TIME = /^(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})$/

function parseDays(selector: string): number[] {
  const days = new Set<number>()
  for (const part of selector.split(',')) {
    const [from, to] = part.split('-')
    // Public holidays are not modelled: a `PH` selector names no weekday.
    if (from === 'PH') continue
    const start = DAY_CODES.indexOf(from as DayCode)
    const end = to === undefined ? start : DAY_CODES.indexOf(to as DayCode)
    for (let d = start; ; d = (d + 1) % 7) {
      days.add(d)
      if (d === end) break
    }
  }
  return [...days]
}

function parseTimes(text: string): Span[] | null {
  if (text === 'off' || text === 'closed') return []
  const spans: Span[] = []
  for (const part of text.split(',')) {
    const m = TIME.exec(part.trim())
    if (!m) return null
    const [sh, sm, eh, em] = m.slice(1).map(Number)
    const start = sh * 60 + sm
    let end = eh * 60 + em
    if (sm > 59 || em > 59 || start >= MINUTES_PER_DAY || end > 2 * MINUTES_PER_DAY) return null
    if (end <= start) end += MINUTES_PER_DAY
    spans.push({ start, end })
  }
  return spans
}

function parseRule(rule: string): { days: number[]; spans: Span[] } | null {
  if (rule === '24/7') return { days: ALL_DAYS, spans: [{ start: 0, end: MINUTES_PER_DAY }] }
  const m = RULE.exec(rule)
  if (!m) return null
  const spans = parseTimes(m[2].trim())
  if (!spans) return null
  return { days: m[1] === undefined ? ALL_DAYS : parseDays(m[1]), spans }
}

export function parseOpeningHours(raw: string): Week | null {
  const chunks = raw
    .split(';')
    .map((chunk) => chunk.trim())
    .filter(Boolean)
  if (chunks.length === 0) return null
  const week: Week = Array.from({ length: 7 }, () => [])
  for (const chunk of chunks) {
    for (const [i, text] of chunk.split(ADDITIONAL_RULE).entries()) {
      const rule = parseRule(text.trim())
      if (!rule) return null
      // `;` starts a normal rule, which replaces its days; `,` an additional one, which adds.
      for (const d of rule.days) week[d] = i === 0 ? [...rule.spans] : [...week[d], ...rule.spans]
    }
  }
  for (const day of week) day.sort((a, b) => a.start - b.start)
  return week
}

/** 0 for Monday … 6 for Sunday, in the device's time zone. */
export function weekdayIndex(at: Date): number {
  return (at.getDay() + 6) % 7
}

/**
 * The state at an instant, in the device's time zone: OSM's reply carries no zone, and places are
 * almost always browsed in the zone they are in.
 */
export function openStateAt(week: Week, at: Date): OpenState {
  const minute = at.getHours() * 60 + at.getMinutes()
  const today = weekdayIndex(at)
  for (const s of week[(today + 6) % 7]) {
    if (minute < s.end - MINUTES_PER_DAY) return { kind: 'open', closesAt: s.end - MINUTES_PER_DAY }
  }
  for (const s of week[today]) {
    if (s.start <= minute && minute < s.end) {
      const allDay = s.start === 0 && s.end >= MINUTES_PER_DAY
      return { kind: 'open', closesAt: allDay ? null : s.end % MINUTES_PER_DAY }
    }
  }
  const next = week[today].find((s) => s.start > minute)
  if (!next) return { kind: 'closed-today' }
  return next.start - minute <= OPENS_SOON_MINUTES
    ? { kind: 'opens-soon', opensAt: next.start }
    : { kind: 'closed', opensAt: next.start }
}

/** The state for a raw tag, or null when it is absent or unreadable. */
export function openStateOf(raw: string | undefined, at: Date): OpenState | null {
  const week = raw ? parseOpeningHours(raw) : null
  return week ? openStateAt(week, at) : null
}

/** "19:30" for minutes from midnight, wrapping past midnight. */
export function formatClock(minutes: number): string {
  const m = ((minutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/openingHours.test.ts && npm run type-check`
Expected: PASS. If a `refuses` case unexpectedly parses, fix the grammar, not the test.

- [ ] **Step 5: Commit**

```bash
git add src/lib/openingHours.ts src/lib/openingHours.test.ts
git commit -m "feat(lib): read the common subset of OSM opening_hours"
```

---

### Task 5: Zone, compact address and OSM link

**Files:**
- Create: `src/features/places/placeDisplay.ts`
- Modify: `src/i18n/locales/en/translation.json`, `src/i18n/locales/fr/translation.json` (new top-level `place` object)
- Test: `src/features/places/placeDisplay.test.ts`

**Interfaces:**
- Consumes: `OsmSnapshot`, `Restaurant` (Task 1).
- Produces: `shortZone(osm: OsmSnapshot, t: TFunction, language: string): string | undefined`; `detailZone(osm, t, language): string | undefined`; `compactAddress(r: Pick<Restaurant, 'address' | 'osm'>): string | undefined`; `osmObjectUrl(osm: Pick<OsmSnapshot, 'type' | 'id'>): string`; `websiteLabel(url: string): string`; i18n `place.arrondissement`, `place.ordinalSuffix.{zero,one,two,few,many,other}`.

- [ ] **Step 1: Add the i18n keys**

`en` — new top-level object (later tasks add more keys to it):

```json
"place": {
  "arrondissement": "{{city}} {{number}}{{suffix}}",
  "ordinalSuffix": { "zero": "th", "one": "st", "two": "nd", "few": "rd", "many": "th", "other": "th" }
}
```

`fr`:

```json
"place": {
  "arrondissement": "{{city}} {{number}}{{suffix}}",
  "ordinalSuffix": { "zero": "e", "one": "er", "two": "e", "few": "e", "many": "e", "other": "e" }
}
```

All six plural categories exist in both files so the template-literal key type-checks and `resources.test.ts` parity holds; French only ever selects `one` and `other`.

- [ ] **Step 2: Write the failing tests**

`src/features/places/placeDisplay.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { compactAddress, detailZone, osmObjectUrl, shortZone, websiteLabel } from './placeDisplay'
import { mockI18n } from '../../test/setup'
import type { OsmSnapshot } from '../../types/models'

const t = mockI18n.t.bind(mockI18n)

function osm(over: Partial<OsmSnapshot>): OsmSnapshot {
  return { type: 'node', id: 1, checkedAt: '2026-09-26T10:00:00.000Z', ...over }
}

describe('shortZone', () => {
  it.each([
    [{ city: 'Paris', postcode: '75011' }, 'Paris 11th'],
    [{ city: 'Paris', postcode: '75001' }, 'Paris 1st'],
    [{ city: 'Paris', postcode: '75116' }, 'Paris 16th'],
    [{ city: 'Lyon', postcode: '69001' }, 'Lyon 1st'],
    [{ city: 'Marseille', postcode: '13007' }, 'Marseille 7th'],
    [{ city: 'Bordeaux', postcode: '33000', suburb: 'Bordeaux Sud' }, 'Bordeaux'],
    [{ city: 'Aix-en-Provence', postcode: '13100' }, 'Aix-en-Provence'],
    [{ city: 'Paris', postcode: '75021' }, 'Paris'],
  ])('%o → %s in English', (over, expected) => {
    expect(shortZone(osm(over), t, 'en')).toBe(expected)
  })

  it('writes French ordinals', async () => {
    await mockI18n.changeLanguage('fr')
    const tFr = mockI18n.t.bind(mockI18n)
    expect(shortZone(osm({ city: 'Paris', postcode: '75011' }), tFr, 'fr')).toBe('Paris 11e')
    expect(shortZone(osm({ city: 'Lyon', postcode: '69001' }), tFr, 'fr')).toBe('Lyon 1er')
  })

  it('is undefined without a city', () => {
    expect(shortZone(osm({ postcode: '75011' }), t, 'en')).toBeUndefined()
  })
})

describe('detailZone', () => {
  it('adds the quarter to an arrondissement, the suburb elsewhere', () => {
    expect(
      detailZone(
        osm({ city: 'Paris', postcode: '75011', suburb: 'Paris 11e Arrondissement', quarter: 'Quartier de la Roquette' }),
        t,
        'en',
      ),
    ).toBe('Paris 11th · Quartier de la Roquette')
    expect(detailZone(osm({ city: 'New York', suburb: 'Manhattan' }), t, 'en')).toBe(
      'New York · Manhattan',
    )
  })

  it('does not repeat the city', () => {
    expect(detailZone(osm({ city: 'Lyon', suburb: 'Lyon' }), t, 'en')).toBe('Lyon')
  })
})

describe('compactAddress, osmObjectUrl, websiteLabel', () => {
  it('prefers the OSM street, else the stored address', () => {
    expect(compactAddress({ address: '32, Rue Saint-Maur, Paris…', osm: osm({ street: '32 Rue Saint-Maur' }) })).toBe(
      '32 Rue Saint-Maur',
    )
    expect(compactAddress({ address: '1 Rue de Paris' })).toBe('1 Rue de Paris')
  })

  it('links the OSM object', () => {
    expect(osmObjectUrl({ type: 'way', id: 42 })).toBe('https://www.openstreetmap.org/way/42')
  })

  it('shows a website by its host', () => {
    expect(websiteLabel('https://www.leservan.com/fr/')).toBe('leservan.com')
    expect(websiteLabel('not a url')).toBe('not a url')
  })
})
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run src/features/places/placeDisplay.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 4: Write `src/features/places/placeDisplay.ts`**

```ts
import type { TFunction } from 'i18next'
import type { OsmSnapshot, Restaurant } from '../../types/models'

/** Cities split into numbered arrondissements, keyed by their postcode's département. */
const ARRONDISSEMENTS: Readonly<Record<string, { city: string; count: number }>> = {
  '75': { city: 'Paris', count: 20 },
  '69': { city: 'Lyon', count: 9 },
  '13': { city: 'Marseille', count: 16 },
}

/** The arrondissement of a Paris, Lyon or Marseille address, else null. 75116 is Paris 16e. */
function arrondissement(osm: OsmSnapshot): number | null {
  const postcode = osm.postcode
  if (!postcode || !/^\d{5}$/.test(postcode)) return null
  const known = ARRONDISSEMENTS[postcode.slice(0, 2)]
  if (!known || osm.city !== known.city) return null
  const n = postcode === '75116' ? 16 : Number(postcode.slice(2))
  return n >= 1 && n <= known.count ? n : null
}

/** The zone a list card and a search result show: "Paris 11e", else the city. */
export function shortZone(osm: OsmSnapshot, t: TFunction, language: string): string | undefined {
  const n = arrondissement(osm)
  if (n === null) return osm.city
  const category = new Intl.PluralRules(language, { type: 'ordinal' }).select(n)
  const suffix = t(`place.ordinalSuffix.${category}`)
  return t('place.arrondissement', { city: osm.city, number: n, suffix })
}

/** The detail's subtitle: the short zone, then the quarter (arrondissement) or the suburb. */
export function detailZone(osm: OsmSnapshot, t: TFunction, language: string): string | undefined {
  const zone = shortZone(osm, t, language)
  const area = arrondissement(osm) === null ? osm.suburb : osm.quarter
  if (!zone) return area
  return area && area !== osm.city && area !== zone ? `${zone} · ${area}` : zone
}

/** "32 Rue Saint-Maur" once matched to OSM; the stored address otherwise, unchanged. */
export function compactAddress(r: Pick<Restaurant, 'address' | 'osm'>): string | undefined {
  return r.osm?.street ?? r.address
}

/** Where "Correct" sends the user: the object's page on openstreetmap.org. */
export function osmObjectUrl(osm: Pick<OsmSnapshot, 'type' | 'id'>): string {
  return `https://www.openstreetmap.org/${osm.type}/${osm.id}`
}

/** A website by its host ("leservan.com"), or the value as-is when it is not a URL. */
export function websiteLabel(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/features/places/placeDisplay.test.ts src/i18n && npm run type-check`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/features/places/placeDisplay.ts src/features/places/placeDisplay.test.ts src/i18n/locales/en/translation.json src/i18n/locales/fr/translation.json
git commit -m "feat(places): short zone, compact address and OSM link"
```

---

### Task 6: The open-state label and a minute clock

**Files:**
- Create: `src/features/places/openStateLabel.ts`
- Create: `src/features/places/OpenStateText.tsx`
- Create: `src/features/places/useNow.ts`
- Modify: `src/i18n/locales/en/translation.json`, `src/i18n/locales/fr/translation.json` (new top-level `openState`)
- Modify: `docs/reference/design-tokens.md` (a short "Open state" section)
- Test: `src/features/places/OpenStateText.test.tsx`, `src/features/places/useNow.test.ts`

**Interfaces:**
- Consumes: `OpenState`, `formatClock` (Task 4).
- Produces: `openStateLabel(state: OpenState, t: TFunction): string`; `<OpenStateText state={OpenState} className? />`; `useNow(intervalMs = 60_000): Date`.

- [ ] **Step 1: Add the i18n keys**

`en`:

```json
"openState": {
  "openUntil": "Open until {{time}}",
  "openAllDay": "Open 24 hours",
  "opensAt": "Opens at {{time}}",
  "closedOpensAt": "Closed · opens at {{time}}",
  "closedToday": "Closed today"
}
```

`fr`:

```json
"openState": {
  "openUntil": "Ouvert jusqu’à {{time}}",
  "openAllDay": "Ouvert 24 h/24",
  "opensAt": "Ouvre à {{time}}",
  "closedOpensAt": "Fermé · ouvre à {{time}}",
  "closedToday": "Fermé aujourd’hui"
}
```

- [ ] **Step 2: Write the failing tests**

`src/features/places/OpenStateText.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { OpenStateText } from './OpenStateText'

describe('OpenStateText', () => {
  it.each([
    [{ kind: 'open', closesAt: 23 * 60 }, 'Open until 23:00', 'text-emerald-700'],
    [{ kind: 'open', closesAt: null }, 'Open 24 hours', 'text-emerald-700'],
    [{ kind: 'opens-soon', opensAt: 19 * 60 + 30 }, 'Opens at 19:30', 'text-amber-700'],
    [{ kind: 'closed', opensAt: 19 * 60 }, 'Closed · opens at 19:00', 'text-gray-600'],
    [{ kind: 'closed-today' }, 'Closed today', 'text-gray-600'],
  ] as const)('%o reads %s', (state, label, tone) => {
    render(<OpenStateText state={state} />)
    expect(screen.getByText(label)).toHaveClass(tone)
  })
})
```

`src/features/places/useNow.test.ts`:

```ts
import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useNow } from './useNow'

afterEach(() => vi.useRealTimers())

describe('useNow', () => {
  it('ticks once a minute', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 8, 21, 18, 40))
    const { result } = renderHook(() => useNow())
    expect(result.current.getMinutes()).toBe(40)
    act(() => vi.advanceTimersByTime(60_000))
    expect(result.current.getMinutes()).toBe(41)
  })
})
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run src/features/places/OpenStateText.test.tsx src/features/places/useNow.test.ts`
Expected: FAIL (modules not found).

- [ ] **Step 4: Write the three modules**

`src/features/places/openStateLabel.ts`:

```ts
import type { TFunction } from 'i18next'
import { formatClock, type OpenState } from '../../lib/openingHours'

export function openStateLabel(state: OpenState, t: TFunction): string {
  switch (state.kind) {
    case 'open':
      return state.closesAt === null
        ? t('openState.openAllDay')
        : t('openState.openUntil', { time: formatClock(state.closesAt) })
    case 'opens-soon':
      return t('openState.opensAt', { time: formatClock(state.opensAt) })
    case 'closed':
      return t('openState.closedOpensAt', { time: formatClock(state.opensAt) })
    case 'closed-today':
      return t('openState.closedToday')
  }
}
```

`src/features/places/OpenStateText.tsx`:

```tsx
import { useTranslation } from 'react-i18next'
import { openStateLabel } from './openStateLabel'
import { cn } from '../../lib/cn'
import type { OpenState } from '../../lib/openingHours'

// Green, orange, gray: open, about to open, not now. Measured on white: emerald-700 5.5:1,
// amber-700 5.0:1, gray-600 7.5:1 — all AA for the 12px text they carry.
const TONE: Record<OpenState['kind'], { text: string; dot: string }> = {
  open: { text: 'text-emerald-700', dot: 'bg-emerald-500' },
  'opens-soon': { text: 'text-amber-700', dot: 'bg-amber-500' },
  closed: { text: 'text-gray-600', dot: 'bg-gray-400' },
  'closed-today': { text: 'text-gray-600', dot: 'bg-gray-400' },
}

/** "● Open until 23:00": the dot is decorative, the words carry the state. */
export function OpenStateText({ state, className }: { state: OpenState; className?: string }) {
  const { t } = useTranslation()
  const tone = TONE[state.kind]
  return (
    <span className={cn('inline-flex items-center gap-1.5 font-semibold', tone.text, className)}>
      <span aria-hidden="true" className={cn('h-1.5 w-1.5 shrink-0 rounded-full', tone.dot)} />
      {openStateLabel(state, t)}
    </span>
  )
}
```

The test queries `getByText(label)`, which returns the outer span (the dot has no text), so the tone class sits on the element the test finds.

`src/features/places/useNow.ts`:

```ts
import { useEffect, useState } from 'react'

/** The current time, refreshed every `intervalMs`: one timer for a whole list of open states. */
export function useNow(intervalMs = 60_000): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return now
}
```

- [ ] **Step 5: Document the colors**

In `docs/reference/design-tokens.md`, after `## Verdicts and statuses`, add:

```markdown
## Open state

The open/closed line on cards, previews and the detail (`features/places/OpenStateText.tsx`)
uses Tailwind's palette, not a brand token: `emerald-700` text on an `emerald-500` dot for open,
`amber-700` / `amber-500` for opening within two hours, `gray-600` / `gray-400` otherwise. The
dot is decorative; the words carry the state.
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run src/features/places src/i18n && npm run type-check && npx eslint src/features/places`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/features/places/openStateLabel.ts src/features/places/OpenStateText.tsx src/features/places/OpenStateText.test.tsx src/features/places/useNow.ts src/features/places/useNow.test.ts src/i18n/locales/en/translation.json src/i18n/locales/fr/translation.json docs/reference/design-tokens.md
git commit -m "feat(places): open-state label and a minute clock"
```

---

### Task 7: Capture resolves to a preview, and a commit writes

**Files:**
- Modify: `src/capture/capture.ts`
- Modify: `src/capture/dedup.ts`
- Modify: `src/features/capture/AddPlace.tsx` (interim: commit a preview immediately, so the modal keeps its one-click behaviour until Task 8)
- Test: `src/capture/capture.test.ts`, `src/capture/dedup.test.ts`

**Interfaces:**
- Consumes: `matchNear`, `reverseGeocode`, `GeoCandidate` (Task 3); `RestaurantInput.osm` (Task 1).
- Produces: `interface PlaceDraft { name: string; lat: number | null; lng: number | null; address?: string; mapsUrl?: string; pending: boolean; match?: GeoCandidate; matchFailed?: boolean }`; `CaptureResult` = `preview { draft }` | `duplicate { match: Restaurant }` | `needs-search { query }` | `needs-backend { link, reason }` | `link-unresolvable { link }` (the `created` and `provisional` variants are gone); `type CommitResult = { status: 'created'; restaurant: Restaurant } | { status: 'duplicate'; match: Restaurant }`; `draftFromCandidate(c: GeoCandidate): PlaceDraft`; `withoutMatch(draft: PlaceDraft): PlaceDraft`; `commitCapture(draft: PlaceDraft, cuisine?: string): Promise<CommitResult>`; `DedupCandidate.osm?: Pick<OsmSnapshot, 'type' | 'id'>`. `captureSearchPick` is removed.

- [ ] **Step 1: Write the failing tests**

Add to `src/capture/dedup.test.ts`:

```ts
  it('matches the same OSM object even far from any saved position', () => {
    const saved = r({ id: 'a', lat: 0, lng: 0, osm: { type: 'node', id: 7, checkedAt: 'x' } })
    expect(findNearMatch({ lat: 45, lng: 4, osm: { type: 'node', id: 7 } }, [saved])?.id).toBe('a')
    expect(findNearMatch({ lat: 45, lng: 4, osm: { type: 'way', id: 7 } }, [saved])).toBeNull()
  })
```

In `src/capture/capture.test.ts`: change the import to `import { capturePaste, commitCapture, draftFromCandidate, withoutMatch, type PlaceDraft } from './capture'`, change the `beforeEach` provider to also return a near match by default:

```ts
const SERVAN_OSM = { type: 'node' as const, id: 1, checkedAt: '2026-09-26T10:00:00.000Z', city: 'Paris' }

function provider(near: GeoCandidate[] = []) {
  setGeocodeProvider({
    search: async (_q, options) => (options?.near ? near : []),
    reverse: async () => '1 Rue de Rivoli, Paris',
    lookup: async () => null,
  })
}
```

with `provider()` in `beforeEach` and `import type { GeoCandidate } from './geocode'`. Then replace the tests that expected `created`/`provisional` from `capturePaste` with:

```ts
  async function draftOf(input: string): Promise<PlaceDraft> {
    const res = await capturePaste(input)
    if (res.status !== 'preview') throw new Error(`expected a preview, got ${res.status}`)
    return res.draft
  }

  it('previews a full URL without saving it', async () => {
    const draft = await draftOf(FULL_URL)
    expect(draft).toMatchObject({ name: 'Chez Marcel', pending: false, address: '1 Rue de Rivoli, Paris' })
    expect(draft.lat).toBeCloseTo(48.8566)
    expect(draft.match).toBeUndefined()
    expect(await allRestaurants()).toEqual([])
  })

  it('attaches the OSM object found near the link, and takes its address', async () => {
    provider([{ name: 'Chez Marcel', lat: 48.8567, lng: 2.3522, osmClass: 'amenity=restaurant', osm: SERVAN_OSM, address: 'Chez Marcel, 3 Rue X, Paris' }])
    const draft = await draftOf(FULL_URL)
    expect(draft.match?.osm).toEqual(SERVAN_OSM)
    expect(draft.address).toBe('Chez Marcel, 3 Rue X, Paris')
  })

  it('says when the match could not be asked, and still previews', async () => {
    setGeocodeProvider({
      search: async () => {
        throw new Error('down')
      },
      reverse: async () => undefined,
      lookup: async () => null,
    })
    expect(await draftOf(FULL_URL)).toMatchObject({ matchFailed: true, match: undefined })
  })

  it('commits a preview with its category and snapshot', async () => {
    provider([{ name: 'Chez Marcel', lat: 48.8567, lng: 2.3522, osmClass: 'amenity=restaurant', osm: SERVAN_OSM }])
    const res = await commitCapture(await draftOf(FULL_URL), 'french')
    expect(res.status).toBe('created')
    if (res.status !== 'created') return
    expect(res.restaurant).toMatchObject({ name: 'Chez Marcel', cuisine: 'french', osm: SERVAN_OSM, pending: false })
  })

  it('reverse-geocodes on commit once the match is refused', async () => {
    provider([{ name: 'Chez Marcel', lat: 48.8567, lng: 2.3522, osmClass: 'amenity=restaurant', osm: SERVAN_OSM, address: 'OSM address' }])
    const res = await commitCapture(withoutMatch(await draftOf(FULL_URL)))
    if (res.status !== 'created') throw new Error(res.status)
    expect(res.restaurant.osm).toBeUndefined()
    expect(res.restaurant.address).toBe('1 Rue de Rivoli, Paris')
  })

  it('resolves a short link server-side into a preview', async () => {
    vi.mocked(resolveShortLink).mockResolvedValue({ lat: 40, lng: -3, name: 'Madrid spot' })
    expect(await draftOf(SHORT_URL)).toMatchObject({ name: 'Madrid spot', lat: 40, mapsUrl: SHORT_URL })
  })

  it('previews then saves a provisional record when a configured backend cannot resolve a short link', async () => {
    vi.mocked(resolveShortLink).mockRejectedValue(new Error('offline'))
    const draft = await draftOf(SHORT_URL)
    expect(draft).toMatchObject({ pending: true, lat: null, name: SHORT_URL })
    expect(await allRestaurants()).toEqual([])
    const res = await commitCapture(draft, 'pizza')
    if (res.status !== 'created') throw new Error(res.status)
    expect(res.restaurant).toMatchObject({ pending: true, lat: null, cuisine: 'pizza', mapsUrl: SHORT_URL })
  })

  it('flags a duplicate at preview when the same place was saved', async () => {
    await commitCapture(await draftOf(FULL_URL))
    expect((await capturePaste(FULL_URL)).status).toBe('duplicate')
    expect((await allRestaurants()).length).toBe(1)
  })

  it('flags a duplicate at commit for a search pick of an already-saved OSM object', async () => {
    const candidate = { name: 'Chez Marcel', lat: 10, lng: 10, osmClass: 'amenity=restaurant', osm: SERVAN_OSM }
    await commitCapture(draftFromCandidate(candidate))
    const again = await commitCapture(draftFromCandidate({ ...candidate, lat: 11 }))
    expect(again.status).toBe('duplicate')
  })
```

In the two `describe` blocks for absent/unavailable backends, change each `expect(res.status).toBe('created')` on `FULL_URL` to `expect(res.status).toBe('preview')`, and in the absent block drop the `allRestaurants().length` assertion that followed it (nothing is saved at preview any more).

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/capture/capture.test.ts src/capture/dedup.test.ts`
Expected: FAIL (`commitCapture` missing, `preview` status never returned).

- [ ] **Step 3: Match on OSM identity in `src/capture/dedup.ts`**

```ts
import { haversineMeters } from '../lib/geo'
import type { OsmSnapshot, Restaurant } from '../types/models'

export interface DedupCandidate {
  lat: number
  lng: number
  mapsUrl?: string
  osm?: Pick<OsmSnapshot, 'type' | 'id'>
}

/**
 * Find an already-saved place matching the candidate: the same OSM object, the same Maps link,
 * or coordinates within the near-match radius (~50 m default). Tombstoned records are ignored.
 */
export function findNearMatch(
  candidate: DedupCandidate,
  existing: Restaurant[],
  radiusM = 50,
): Restaurant | null {
  for (const r of existing) {
    if (r.deleted) continue
    if (candidate.osm && r.osm?.type === candidate.osm.type && r.osm.id === candidate.osm.id) return r
    if (candidate.mapsUrl && r.mapsUrl && candidate.mapsUrl === r.mapsUrl) return r
    if (r.lat !== null && r.lng !== null) {
      if (haversineMeters(candidate.lat, candidate.lng, r.lat, r.lng) <= radiusM) return r
    }
  }
  return null
}
```

- [ ] **Step 4: Resolve then commit in `src/capture/capture.ts`**

Change the geocode import to `import { matchNear, reverseGeocode, type GeoCandidate } from './geocode'`. Replace the `created` and `provisional` members of `CaptureResult` with `| { status: 'preview'; draft: PlaceDraft }` (keep every other member and its comment). Add above it:

```ts
/** A place identified but not saved yet: what the add form previews before "Add". */
export interface PlaceDraft {
  name: string
  lat: number | null
  lng: number | null
  address?: string
  mapsUrl?: string
  /** Awaiting coordinate resolution: a short link pasted while the server could not answer. */
  pending: boolean
  /** The OpenStreetMap object this place is matched to, kept unless the user refuses it. */
  match?: GeoCandidate
  /** The match request failed (network, Nominatim), as opposed to finding nothing. */
  matchFailed?: boolean
}

export type CommitResult =
  | { status: 'created'; restaurant: Restaurant }
  | { status: 'duplicate'; match: Restaurant }
```

Replace `finalize` with:

```ts
async function preview(place: ResolvedPlace): Promise<CaptureResult> {
  const existing = await allRestaurants()
  const near = findNearMatch({ lat: place.lat, lng: place.lng, mapsUrl: place.mapsUrl }, existing)
  if (near) return { status: 'duplicate', match: near }

  let match: GeoCandidate | undefined
  let matchFailed = false
  if (place.name) {
    try {
      match = (await matchNear(place.name, place.lat, place.lng)) ?? undefined
    } catch {
      matchFailed = true
    }
  }
  const sameObject = match?.osm && findNearMatch({ lat: place.lat, lng: place.lng, osm: match.osm }, existing)
  if (sameObject) return { status: 'duplicate', match: sameObject }

  // OSM's address when matched; otherwise the reverse geocode the app always used.
  const address = match
    ? match.address
    : await reverseGeocode(place.lat, place.lng).catch(() => undefined)
  const draft: PlaceDraft = {
    name: place.name ?? address?.split(',')[0] ?? 'New place',
    lat: place.lat,
    lng: place.lng,
    address,
    mapsUrl: place.mapsUrl,
    pending: false,
    match,
    matchFailed,
  }
  return { status: 'preview', draft }
}
```

In `capturePaste`, replace both `return finalize(...)` calls with `return preview(...)` (same arguments), and replace the offline branch's two lines with:

```ts
      // Offline, or the server did not answer: preview a provisional record; "Add" saves it and it
      // resolves when connectivity returns. It is never matched to OSM later — that would be a
      // silent match; the user completes it from its detail.
      return {
        status: 'preview',
        draft: { name: text, lat: null, lng: null, mapsUrl: text, pending: true },
      }
```

Replace `captureSearchPick` with:

```ts
/** The draft for a picked search result: its OSM object comes along when it has one. */
export function draftFromCandidate(candidate: GeoCandidate): PlaceDraft {
  return {
    name: candidate.name,
    lat: candidate.lat,
    lng: candidate.lng,
    address: candidate.address,
    pending: false,
    match: candidate.osm ? candidate : undefined,
  }
}

/** "Not this one": drop the match and the address that came with it; commit reverse-geocodes. */
export function withoutMatch(draft: PlaceDraft): PlaceDraft {
  return { ...draft, match: undefined, address: undefined, matchFailed: false }
}

/**
 * Save a previewed place with the form's category. Duplicates are checked again: a search pick
 * reaches here without a preview, and another device may have synced the place meanwhile.
 */
export async function commitCapture(draft: PlaceDraft, cuisine?: string): Promise<CommitResult> {
  if (draft.pending || draft.lat === null || draft.lng === null) {
    const restaurant = await createRestaurant({
      name: draft.name,
      mapsUrl: draft.mapsUrl,
      pending: true,
      cuisine,
    })
    return { status: 'created', restaurant }
  }
  const { lat, lng } = draft
  const osm = draft.match?.osm
  const match = findNearMatch({ lat, lng, mapsUrl: draft.mapsUrl, osm }, await allRestaurants())
  if (match) return { status: 'duplicate', match }
  const address = draft.address ?? (await reverseGeocode(lat, lng).catch(() => undefined))
  const restaurant = await createRestaurant({
    name: draft.name,
    lat,
    lng,
    address,
    mapsUrl: draft.mapsUrl,
    cuisine,
    osm,
  })
  return { status: 'created', restaurant }
}
```

- [ ] **Step 5: Keep the modal working on the new API (`src/features/capture/AddPlace.tsx`)**

Change the import to `import { capturePaste, commitCapture, draftFromCandidate, type CaptureResult, type CommitResult } from '../../capture/capture'`, drop the `updateRestaurant` import, and replace the `created`/`provisional` case in `handle` with:

```ts
      case 'preview':
        // Interim: saved at once, as before this change. The preview step arrives with the
        // reordered form.
        finish(await commitCapture(result.draft, cuisine.trim() || undefined))
        return
```

Add inside the component:

```ts
  function finish(result: CommitResult) {
    if (result.status === 'duplicate') setDuplicate(result.match)
    else onClose()
  }
```

and in `pick`, replace `await handle(await captureSearchPick(candidate))` with `finish(await commitCapture(draftFromCandidate(candidate), cuisine.trim() || undefined))`.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run src/capture src/features/capture && npm run type-check`
Expected: PASS — the existing `AddPlace.test.tsx` passes unchanged, since the modal still saves in one click.

- [ ] **Step 7: Commit**

```bash
git add src/capture/capture.ts src/capture/capture.test.ts src/capture/dedup.ts src/capture/dedup.test.ts src/features/capture/AddPlace.tsx
git commit -m "feat(capture): resolve a paste to a preview and save it on commit"
```

---

### Task 8: The add-place flow: search → select → category → add

**Files:**
- Create: `src/features/capture/useAddPlace.ts`
- Create: `src/features/capture/CandidateList.tsx`
- Create: `src/features/capture/DraftPreview.tsx`
- Modify: `src/features/capture/AddPlace.tsx` (becomes a view over `useAddPlace`)
- Modify: `src/i18n/locales/en/translation.json`, `src/i18n/locales/fr/translation.json` (`capture.*`)
- Test: `src/features/capture/AddPlace.test.tsx`

**Interfaces:**
- Consumes: `capturePaste`, `commitCapture`, `draftFromCandidate`, `withoutMatch`, `PlaceDraft`, `CommitResult` (Task 7); `searchPlaces`, `GeoCandidate` (Task 3); `isEatery` (Task 2); `suggestCategory` (Task 2); `shortZone`, `websiteLabel` (Task 5); `openStateOf` (Task 4); `OpenStateText`, `useNow` (Task 6); `cuisineAvatarBackground`, `cuisinePillTokens`, `emojiForCuisine` (`facets/cuisines.ts`); `cuisineLabel` (`facets/cuisineCatalog.ts`).
- Produces: `useAddPlace(onAdded: () => void)` returning `{ input, setInput, busy, error, refusal, duplicate, candidates, selected, draft, cuisine, setCuisine, suggested, select, rejectMatch, submit }`; `<CandidateList candidates selected onSelect />`; `<DraftPreview draft onReject />`.

- [ ] **Step 1: Add the i18n keys**

Add to `capture` in `en`:

```json
"search": "Search",
"suggestedByOsm": "Suggested by OpenStreetMap",
"otherResults_one": "{{count}} other result",
"otherResults_other": "{{count}} other results",
"noEateryMatches": "No restaurant, café or bar found under this name. Try adding the city, or paste the Google Maps link.",
"foundOnOsm": "Found on OpenStreetMap",
"notThisOne": "Not this one",
"noOsmData": "No OpenStreetMap data",
"osmUnavailable": "OpenStreetMap unavailable — complete it later from the place",
"resolvedLater": "Position resolved later"
```

and to `capture` in `fr`:

```json
"search": "Rechercher",
"suggestedByOsm": "Suggérée par OpenStreetMap",
"otherResults_one": "{{count}} autre résultat",
"otherResults_other": "{{count}} autres résultats",
"noEateryMatches": "Aucun restaurant, café ou bar trouvé sous ce nom. Ajoute la ville, ou colle le lien Google Maps.",
"foundOnOsm": "Trouvé sur OpenStreetMap",
"notThisOne": "Ce n’est pas lui",
"noOsmData": "Pas d’infos OpenStreetMap",
"osmUnavailable": "OpenStreetMap indisponible — à compléter plus tard depuis la fiche",
"resolvedLater": "Position résolue plus tard"
```

- [ ] **Step 2: Rewrite the modal's tests for the new order**

In `src/features/capture/AddPlace.test.tsx`:

1. Add fixtures and a provider helper after the constants:

```ts
const OSM = { type: 'node' as const, id: 1, checkedAt: '2026-09-26T10:00:00.000Z', city: 'Paris', postcode: '75004', street: '34 Rue des Rosiers' }

const FALAFEL: GeoCandidate = {
  name: 'L’As du Fallafel',
  lat: 48.857,
  lng: 2.359,
  osmClass: 'amenity=restaurant',
  cuisineTag: 'falafel;israeli',
  osm: OSM,
}

const LEATHER: GeoCandidate = {
  name: 'Chez Aline',
  lat: 48.86,
  lng: 2.38,
  osmClass: 'shop=leather',
  osm: { ...OSM, id: 2, postcode: '75011' },
}

function provide({ search = [], near = [] }: { search?: GeoCandidate[]; near?: GeoCandidate[] }) {
  setGeocodeProvider({
    search: async (_q, options) => (options?.near ? near : search),
    reverse: async () => '1 Rue de Rivoli, Paris',
    lookup: async () => null,
  })
}
```

with `import type { GeoCandidate } from '../../capture/geocode'`.

2. Change `pasteAndSubmit` to click `'Search'` and add:

```ts
async function pasteAndAdd(text: string): Promise<void> {
  await pasteAndSubmit(text)
  await userEvent.setup().click(await screen.findByRole('button', { name: 'Add' }))
}
```

3. In every existing test that typed `FULL_URL` then clicked `'Add'` once, click `'Search'` first and then `await screen.findByRole('button', { name: 'Add' })` before clicking it (or call `pasteAndAdd`). In the two "Other…" category tests, open the picker after the Search click (the picker only appears once a place is identified). In "submits on Enter", type `` `${FULL_URL}{Enter}` ``, wait for the "Add" button, then press `{Enter}` again. In "renders the submit button…", expect the button named `'Search'`. In the French refusal test, click `'Rechercher'`. "offers the existing place on a near-match duplicate" stays on `pasteAndSubmit`: the duplicate is reported at Search.

4. Add the new tests:

```ts
  describe('search, select, category, add', () => {
    it('shows no category picker before a place is identified', () => {
      render(<AddPlace onClose={vi.fn()} onOpenExisting={() => {}} />)
      expect(screen.queryByRole('button', { name: /^Category:/ })).toBeNull()
      expect(screen.getByRole('button', { name: 'Search' })).toBeDisabled()
    })

    it('selects a result, pre-fills its category, and adds it with its snapshot', async () => {
      provide({ search: [FALAFEL] })
      const onClose = vi.fn()
      render(<AddPlace onClose={onClose} onOpenExisting={() => {}} />)
      const user = userEvent.setup()

      await pasteAndSubmit('As du Fallafel')
      await user.click(await screen.findByRole('button', { name: /^L’As du Fallafel/ }))

      expect(screen.getByRole('button', { name: /^L’As du Fallafel/ })).toHaveAttribute('aria-pressed', 'true')
      expect(screen.getByRole('button', { name: 'Category: Lebanese' })).toBeInTheDocument()
      expect(screen.getByText('Suggested by OpenStreetMap')).toBeInTheDocument()
      expect(await allRestaurants()).toEqual([])

      await user.click(screen.getByRole('button', { name: 'Add' }))
      await waitFor(() => expect(onClose).toHaveBeenCalled())
      expect((await allRestaurants())[0]).toMatchObject({ cuisine: 'lebanese', osm: OSM })
    })

    it('keeps a category the user chose when another result is selected', async () => {
      provide({ search: [FALAFEL, { ...FALAFEL, name: 'Le Fallafel 17e', osm: { ...OSM, id: 3 }, cuisineTag: 'kebab' }] })
      render(<AddPlace onClose={vi.fn()} onOpenExisting={() => {}} />)
      const user = userEvent.setup()

      await pasteAndSubmit('Fallafel')
      await user.click(await screen.findByRole('button', { name: /^L’As du Fallafel/ }))
      await user.click(screen.getByRole('button', { name: 'Category: Lebanese' }))
      await user.click(screen.getByRole('button', { name: 'Other…' }))
      await user.type(screen.getByLabelText('Other category'), 'Ramen{Enter}')
      await user.click(screen.getByRole('button', { name: /^Le Fallafel 17e/ }))

      expect(screen.getByRole('button', { name: 'Category: Ramen' })).toBeInTheDocument()
      expect(screen.queryByText('Suggested by OpenStreetMap')).toBeNull()
    })

    it('goes back to Search when the text changes after a selection', async () => {
      provide({ search: [FALAFEL] })
      render(<AddPlace onClose={vi.fn()} onOpenExisting={() => {}} />)
      const user = userEvent.setup()

      await pasteAndSubmit('As du Fallafel')
      await user.click(await screen.findByRole('button', { name: /^L’As du Fallafel/ }))
      await user.type(screen.getByLabelText(/paste a google maps link/i), 'x')

      expect(screen.getByRole('button', { name: 'Search' })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Add' })).toBeNull()
      expect(screen.queryByRole('button', { name: /^L’As du Fallafel/ })).toBeNull()
    })

    it('folds results that are not eateries, and says when there is no eatery at all', async () => {
      provide({ search: [LEATHER] })
      render(<AddPlace onClose={vi.fn()} onOpenExisting={() => {}} />)
      const user = userEvent.setup()

      await pasteAndSubmit('Chez Aline')
      expect(await screen.findByText(/no restaurant, café or bar/i)).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /Chez Aline/ })).toBeNull()

      await user.click(screen.getByRole('button', { name: '1 other result' }))
      expect(screen.getByRole('button', { name: /Chez Aline/ })).toBeInTheDocument()
    })

    it('previews a pasted link with its OSM match, and drops it on "Not this one"', async () => {
      provide({ near: [{ ...FALAFEL, name: 'Chez Marcel', lat: 48.8566, lng: 2.3522 }] })
      render(<AddPlace onClose={vi.fn()} onOpenExisting={() => {}} />)
      const user = userEvent.setup()

      await pasteAndSubmit(FULL_URL)
      expect(await screen.findByText(/Found on OpenStreetMap/)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Category: Lebanese' })).toBeInTheDocument()

      await user.click(screen.getByRole('button', { name: 'Not this one' }))
      expect(screen.getByText('No OpenStreetMap data')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Category: Uncategorized' })).toBeInTheDocument()

      await user.click(screen.getByRole('button', { name: 'Add' }))
      await waitFor(async () => expect(await allRestaurants()).toHaveLength(1))
      expect((await allRestaurants())[0].osm).toBeUndefined()
    })

    it('reports a duplicate found at commit for a picked result', async () => {
      await createRestaurant({ name: 'Existing', lat: FALAFEL.lat, lng: FALAFEL.lng })
      provide({ search: [FALAFEL] })
      render(<AddPlace onClose={vi.fn()} onOpenExisting={() => {}} />)
      const user = userEvent.setup()

      await pasteAndSubmit('As du Fallafel')
      await user.click(await screen.findByRole('button', { name: /^L’As du Fallafel/ }))
      await user.click(screen.getByRole('button', { name: 'Add' }))

      expect(await screen.findByText(/already saved/i)).toBeInTheDocument()
      expect(await allRestaurants()).toHaveLength(1)
    })
  })
```

A result card's accessible name is its text run together ("L’As du FallafelLebanese · Paris 4th · 34 Rue des Rosiers" — jsdom applies no CSS, so `block` spans add no space), hence the anchored regexes.

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run src/features/capture/AddPlace.test.tsx`
Expected: FAIL (no "Search" button, no selection, no preview).

- [ ] **Step 4: Write `src/features/capture/useAddPlace.ts`**

```ts
import { useState } from 'react'
import {
  capturePaste,
  commitCapture,
  draftFromCandidate,
  withoutMatch,
  type CaptureResult,
  type CommitResult,
  type PlaceDraft,
} from '../../capture/capture'
import { searchPlaces, type GeoCandidate } from '../../capture/geocode'
import { suggestCategory } from '../facets/osmCategory'
import type { Restaurant } from '../../types/models'

/** Why a pasted short link was refused. Each reason gets its own lead sentence. */
export type ShortLinkRefusal = 'absent' | 'unavailable' | 'unresolvable'

/** Which failure the form reports. A code, not copy: the view translates it. */
export type AddPlaceError = 'noMatches' | 'searchFailed' | 'add'

/**
 * The add modal's state: input → results or a link preview → category → add. Nothing is saved
 * until "Add"; any edit to the input drops what was identified, so "Add" never saves a place for
 * text that no longer names it.
 */
export function useAddPlace(onAdded: () => void) {
  const [input, setInputValue] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<AddPlaceError | null>(null)
  // Held apart from `error` on purpose: it is guidance, not a fault to retry (R5).
  const [refusal, setRefusal] = useState<ShortLinkRefusal | null>(null)
  const [duplicate, setDuplicate] = useState<Restaurant | null>(null)
  const [candidates, setCandidates] = useState<GeoCandidate[] | null>(null)
  const [selected, setSelected] = useState<GeoCandidate | null>(null)
  const [draft, setDraft] = useState<PlaceDraft | null>(null)
  const [cuisine, setCuisineValue] = useState('')
  // Set once the user picks a category: from then on a suggestion never overwrites it.
  const [cuisineTouched, setCuisineTouched] = useState(false)

  function suggest(match: GeoCandidate | undefined) {
    if (!cuisineTouched) setCuisineValue(match ? (suggestCategory(match) ?? '') : '')
  }

  function setInput(value: string) {
    setInputValue(value)
    setCandidates(null)
    setSelected(null)
    setDraft(null)
    setDuplicate(null)
    setRefusal(null)
    setError(null)
  }

  function select(candidate: GeoCandidate) {
    setSelected(candidate)
    setDraft(draftFromCandidate(candidate))
    setDuplicate(null)
    suggest(candidate)
  }

  function rejectMatch() {
    if (!draft) return
    setDraft(withoutMatch(draft))
    suggest(undefined)
  }

  function setCuisine(value: string | undefined) {
    setCuisineTouched(true)
    setCuisineValue(value ?? '')
  }

  async function search(query: string) {
    try {
      const found = await searchPlaces(query)
      setCandidates(found)
      if (found.length === 0) setError('noMatches')
    } catch {
      setError('searchFailed')
    }
  }

  // Exhaustive over CaptureResult: the `never` assignment makes a future variant a type error.
  async function handle(result: CaptureResult) {
    switch (result.status) {
      case 'preview':
        setDraft(result.draft)
        suggest(result.draft.match)
        return
      case 'duplicate':
        setDuplicate(result.match)
        return
      case 'needs-search':
        await search(result.query)
        return
      case 'needs-backend':
        setRefusal(result.reason)
        return
      case 'link-unresolvable':
        setRefusal('unresolvable')
        return
      default: {
        const unhandled: never = result
        throw new Error(`Unhandled capture result: ${JSON.stringify(unhandled)}`)
      }
    }
  }

  function finish(result: CommitResult) {
    if (result.status === 'duplicate') setDuplicate(result.match)
    else onAdded()
  }

  async function submit() {
    if (busy || !input.trim()) return
    setBusy(true)
    setError(null)
    setDuplicate(null)
    setRefusal(null)
    try {
      if (draft) finish(await commitCapture(draft, cuisine.trim() || undefined))
      else await handle(await capturePaste(input))
    } catch {
      setError('add')
    } finally {
      setBusy(false)
    }
  }

  return {
    input,
    setInput,
    busy,
    error,
    refusal,
    duplicate,
    candidates,
    selected,
    draft,
    cuisine,
    setCuisine,
    /** The category shown came from OSM and the user has not changed it. */
    suggested: !cuisineTouched && cuisine !== '',
    select,
    rejectMatch,
    submit,
  }
}
```

- [ ] **Step 5: Write `src/features/capture/CandidateList.tsx`**

```tsx
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, ChevronDown, ChevronUp, MapPin } from 'lucide-react'
import { Button } from '../ui/Button'
import { cuisineAvatarBackground, cuisinePillTokens, emojiForCuisine } from '../facets/cuisines'
import { cuisineLabel } from '../facets/cuisineCatalog'
import { suggestCategory } from '../facets/osmCategory'
import { shortZone } from '../places/placeDisplay'
import { isEatery } from '../../capture/osmTags'
import { cn } from '../../lib/cn'
import type { GeoCandidate } from '../../capture/geocode'

function CandidateCard({
  candidate,
  selected,
  onSelect,
}: {
  candidate: GeoCandidate
  selected: boolean
  onSelect: () => void
}) {
  const { t, i18n } = useTranslation()
  const category = suggestCategory(candidate)
  const zone = candidate.osm && shortZone(candidate.osm, t, i18n.language)
  const details = candidate.osm ? [zone, candidate.osm.street].filter(Boolean) : [candidate.address]
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={cn(
        'flex w-full items-center gap-2.5 rounded-[14px] bg-white px-3 py-2.5 text-left shadow-card transition hover:bg-gray-50',
        selected && 'ring-2 ring-brand',
      )}
    >
      {category ? (
        <span
          aria-hidden="true"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] text-lg"
          style={{ background: cuisineAvatarBackground(category) }}
        >
          {emojiForCuisine(category)}
        </span>
      ) : (
        <span
          aria-hidden="true"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-brand-soft text-brand-strong"
        >
          <MapPin size={16} />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-bold text-gray-900">{candidate.name}</span>
        <span className="block truncate text-xs text-gray-600">
          {category && (
            <span className="font-semibold" style={{ color: cuisinePillTokens(category).color }}>
              {cuisineLabel(category, t)}
              {details.length > 0 && ' · '}
            </span>
          )}
          {details.join(' · ')}
        </span>
      </span>
      {selected ? (
        <span
          aria-hidden="true"
          className="grid h-5.5 w-5.5 shrink-0 place-items-center rounded-full bg-brand text-white"
        >
          <Check size={14} strokeWidth={2.6} />
        </span>
      ) : (
        <span aria-hidden="true" className="h-5 w-5 shrink-0 rounded-full ring-[1.5px] ring-gray-300 ring-inset" />
      )}
    </button>
  )
}

/**
 * Search results as selectable cards: eateries first, in OSM's order, then everything else under
 * a collapsed fold, so a restaurant OSM files as a shop can still be picked.
 */
export function CandidateList({
  candidates,
  selected,
  onSelect,
}: {
  candidates: GeoCandidate[]
  selected: GeoCandidate | null
  onSelect: (candidate: GeoCandidate) => void
}) {
  const { t } = useTranslation()
  const [showOthers, setShowOthers] = useState(false)
  const eateries = candidates.filter((c) => isEatery(c))
  const others = candidates.filter((c) => !isEatery(c))
  const card = (c: GeoCandidate, i: number) => (
    <li key={`${c.osm?.type ?? ''}${c.osm?.id ?? ''}:${c.lat},${c.lng},${i}`}>
      <CandidateCard candidate={c} selected={c === selected} onSelect={() => onSelect(c)} />
    </li>
  )
  return (
    <div className="mt-4">
      <p className="text-[13px] font-semibold text-gray-700">{t('capture.whichOne')}</p>
      {eateries.length === 0 && (
        <p className="mt-2 rounded-[14px] bg-brand-soft p-3 text-sm text-brand-strong">
          {t('capture.noEateryMatches')}
        </p>
      )}
      <ul className="mt-2 space-y-2">{eateries.map(card)}</ul>
      {others.length > 0 && (
        <>
          <Button
            variant="link"
            size="xs"
            className="mt-3 inline-flex items-center gap-1"
            aria-expanded={showOthers}
            onClick={() => setShowOthers((v) => !v)}
          >
            {showOthers ? <ChevronUp size={14} aria-hidden="true" /> : <ChevronDown size={14} aria-hidden="true" />}
            {t('capture.otherResults', { count: others.length })}
          </Button>
          {showOthers && <ul className="mt-2 space-y-2">{others.map(card)}</ul>}
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 6: Write `src/features/capture/DraftPreview.tsx`**

```tsx
import { useTranslation } from 'react-i18next'
import { Clock, Globe, Map as MapIcon, MapPin, Phone } from 'lucide-react'
import { Button } from '../ui/Button'
import { OpenStateText } from '../places/OpenStateText'
import { useNow } from '../places/useNow'
import { shortZone, websiteLabel } from '../places/placeDisplay'
import { openStateOf } from '../../lib/openingHours'
import type { PlaceDraft } from '../../capture/capture'

/** A pasted link, identified: what "Add" will save, with its OSM data and a way to refuse it. */
export function DraftPreview({ draft, onReject }: { draft: PlaceDraft; onReject: () => void }) {
  const { t, i18n } = useTranslation()
  const now = useNow()
  const osm = draft.match?.osm
  let subtitle: string
  if (draft.pending) subtitle = t('capture.resolvedLater')
  else if (osm) subtitle = [shortZone(osm, t, i18n.language), osm.street].filter(Boolean).join(' · ')
  else subtitle = draft.matchFailed ? t('capture.osmUnavailable') : t('capture.noOsmData')
  const state = osm && openStateOf(osm.openingHours, now)
  return (
    <div className="mt-4 rounded-card bg-gray-50 p-3">
      <div className="flex items-center gap-2.5">
        <span
          aria-hidden="true"
          className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand-strong"
        >
          <MapPin size={18} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-bold text-gray-900">{draft.name}</span>
          <span className="block text-xs text-gray-600">{subtitle}</span>
        </span>
      </div>
      {osm && (
        <>
          <ul className="mt-2.5 space-y-1.5 text-[13px] text-gray-700">
            {osm.openingHours && (
              <li className="flex items-center gap-2">
                <Clock size={15} aria-hidden="true" className="shrink-0 text-gray-500" />
                {state ? <OpenStateText state={state} /> : osm.openingHours}
              </li>
            )}
            {osm.phone && (
              <li className="flex items-center gap-2">
                <Phone size={15} aria-hidden="true" className="shrink-0 text-gray-500" />
                {osm.phone}
              </li>
            )}
            {osm.website && (
              <li className="flex items-center gap-2">
                <Globe size={15} aria-hidden="true" className="shrink-0 text-gray-500" />
                {websiteLabel(osm.website)}
              </li>
            )}
          </ul>
          <p className="mt-2.5 flex flex-wrap items-center gap-1 text-[11.5px] text-gray-600">
            <MapIcon size={13} aria-hidden="true" />
            {t('capture.foundOnOsm')} ·
            <Button variant="link" size="xs" onClick={onReject}>
              {t('capture.notThisOne')}
            </Button>
          </p>
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 7: Make `AddPlace.tsx` the view**

Replace the component (keep `REFUSAL_COPY` and its comment; move `ShortLinkRefusal` to `useAddPlace.ts` and import it as a type):

```tsx
import { useTranslation } from 'react-i18next'
import { Link2, Map as MapIcon } from 'lucide-react'
import { CandidateList } from './CandidateList'
import { DraftPreview } from './DraftPreview'
import { useAddPlace, type AddPlaceError, type ShortLinkRefusal } from './useAddPlace'
import { useRestaurants } from '../useRestaurants'
import { useRankedCuisines } from '../facets/useRankedCuisines'
import { CuisinePicker } from '../facets/CuisinePicker'
import { Modal } from '../ui/Modal'
import { ModalHeader } from '../ui/ModalHeader'
import { Button } from '../ui/Button'

// (REFUSAL_COPY unchanged)

const ERROR_COPY = {
  noMatches: 'capture.errorNoMatches',
  searchFailed: 'capture.errorSearchFailed',
  add: 'capture.errorAdd',
} as const satisfies Record<AddPlaceError, string>

export function AddPlace({
  onClose,
  onOpenExisting,
}: {
  onClose: () => void
  onOpenExisting: (id: string) => void
}) {
  const { t } = useTranslation()
  const form = useAddPlace(onClose)
  const restaurants = useRestaurants()
  const options = useRankedCuisines(restaurants, true)

  return (
    <Modal onClose={onClose} panelClassName="max-h-[90vh] overflow-y-auto">
      <ModalHeader title={t('capture.title')} onClose={onClose} />

      <label className="block text-[13px] font-semibold text-gray-700" htmlFor="add-input">
        {t('capture.pasteLabel')}
      </label>
      {/* One line, not a textarea: a link or a name is a single line, and Enter can then submit. */}
      <div className="mt-1.5 flex items-center gap-2.5 rounded-[14px] border-[1.5px] border-gray-300 bg-white px-3.5 py-3 text-gray-600 transition focus-within:border-brand focus-within:ring-3 focus-within:ring-brand/15">
        <Link2 size={17} aria-hidden="true" className="shrink-0" />
        <input
          id="add-input"
          value={form.input}
          onChange={(e) => form.setInput(e.target.value)}
          onKeyDown={(e) => {
            // Not while an input method is composing: that Enter confirms the characters.
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) void form.submit()
          }}
          className="min-w-0 flex-1 bg-transparent text-sm text-gray-900 outline-none placeholder:text-gray-500"
          placeholder={t('capture.pastePlaceholder')}
        />
      </div>

      {form.candidates && form.candidates.length > 0 && (
        <CandidateList candidates={form.candidates} selected={form.selected} onSelect={form.select} />
      )}
      {form.draft && !form.selected && <DraftPreview draft={form.draft} onReject={form.rejectMatch} />}

      {/* The category is asked once the place is known, pre-filled with what OSM says. */}
      {form.draft && (
        <div className="mt-4">
          <CuisinePicker value={form.cuisine} options={options} onChange={form.setCuisine} />
          {form.suggested && (
            <p className="mt-1.5 ml-1 flex items-center gap-1 text-xs text-gray-600">
              <MapIcon size={13} aria-hidden="true" />
              {t('capture.suggestedByOsm')}
            </p>
          )}
        </div>
      )}

      <Button
        variant="primary"
        className="mt-4 w-full"
        onClick={() => void form.submit()}
        disabled={form.busy || !form.input.trim()}
      >
        {form.busy ? t('capture.working') : form.draft ? t('capture.submit') : t('capture.search')}
      </Button>

      {form.error && <p className="mt-2 text-sm text-red-600">{t(ERROR_COPY[form.error])}</p>}

      {form.refusal && (
        <div
          role="note"
          className="mt-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"
        >
          {/* Three reasons, three sentences (see REFUSAL_COPY); the two alternatives below work in
              all three cases. */}
          <p>{t(REFUSAL_COPY[form.refusal])}</p>
          <ul className="mt-1 list-disc pl-5">
            <li>{t('capture.shortLinkTrySearch')}</li>
            <li>{t('capture.shortLinkTryFullUrl')}</li>
          </ul>
        </div>
      )}

      {form.duplicate && (
        <div className="mt-3 rounded-md bg-brand-soft p-3 text-sm">
          <p>
            <strong>{form.duplicate.name}</strong> {t('capture.alreadySaved')}
          </p>
          <Button variant="link" className="mt-1" onClick={() => onOpenExisting(form.duplicate!.id)}>
            {t('capture.openIt')}
          </Button>
        </div>
      )}
    </Modal>
  )
}
```

The old candidate `<ul>` is deleted (replaced by `CandidateList`). `submit` already ignores a call while busy, so the Enter handler no longer checks it. Instead of the non-null assertion on `form.duplicate`, bind it first if ESLint flags it: `const duplicate = form.duplicate` above the `return`.

- [ ] **Step 8: Run the tests to verify they pass**

Run: `npx vitest run src/features/capture src/i18n && npm run type-check && npx eslint src/features/capture`
Expected: PASS. Check `wc -l src/features/capture/*.tsx`: each component under 250 lines.

- [ ] **Step 9: Commit**

```bash
git add src/features/capture src/i18n/locales/en/translation.json src/i18n/locales/fr/translation.json
git commit -m "feat(capture): search, select, then categorize before adding a place"
```

---

### Task 9: A third line on list cards: zone and open state

**Files:**
- Modify: `src/features/RestaurantList.tsx`
- Test: `src/features/RestaurantList.test.tsx`

**Interfaces:**
- Consumes: `shortZone` (Task 5); `openStateOf` (Task 4); `OpenStateText`, `useNow` (Task 6); `Restaurant.osm` (Task 1).

- [ ] **Step 1: Write the failing tests**

Add to `src/features/RestaurantList.test.tsx` (import `afterEach, beforeEach` and `vi` from vitest):

```tsx
  describe('zone and open state', () => {
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['Date'] })
      vi.setSystemTime(new Date(2026, 8, 22, 18, 40)) // a Tuesday
    })
    afterEach(() => vi.useRealTimers())

    const osm = { type: 'node' as const, id: 1, checkedAt: '2026-09-19T10:00:00.000Z', city: 'Paris', postcode: '75011' }

    it('adds the short zone and the state for a matched place', () => {
      render(
        <RestaurantList
          items={[r({ id: 'a', name: 'Le Servan', osm: { ...osm, openingHours: 'Mo-Fr 19:30-22:30' } })]}
        />,
      )
      expect(screen.getByText('Paris 11th')).toBeInTheDocument()
      expect(screen.getByText('Opens at 19:30')).toBeInTheDocument()
    })

    it('shows the zone alone when the hours are unknown or unreadable', () => {
      render(<RestaurantList items={[r({ id: 'a', name: 'X', osm: { ...osm, openingHours: 'sunrise-sunset' } })]} />)
      expect(screen.getByText('Paris 11th')).toBeInTheDocument()
      expect(screen.queryByText(/open|closed/i)).toBeNull()
    })

    it('keeps a two-line card for a place without OSM data', () => {
      const { container } = render(<RestaurantList items={[r({ id: 'a', name: 'X' })]} />)
      expect(container.querySelector('[data-line="place"]')).toBeNull()
    })
  })
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/features/RestaurantList.test.tsx`
Expected: FAIL (no zone text).

- [ ] **Step 3: Render the line**

In `src/features/RestaurantList.tsx`, import `OpenStateText`, `useNow`, `shortZone` and `openStateOf`; change `const { t } = useTranslation()` to `const { t, i18n } = useTranslation()` and add `const now = useNow()` below it (before the early return, so the hook order is stable). Inside the `items.map`, compute:

```tsx
        const zone = r.osm && shortZone(r.osm, t, i18n.language)
        const openState = r.osm ? openStateOf(r.osm.openingHours, now) : null
```

and after the line-2 `<div className="mt-1.5 …">` add:

```tsx
                  {/* Where and when: only for a place matched to OSM, so an unmatched card keeps
                      its two lines rather than an empty third. */}
                  {(zone || openState) && (
                    <div
                      data-line="place"
                      className="mt-0.5 flex items-center gap-1.5 text-xs whitespace-nowrap text-gray-600"
                    >
                      {zone && <span className="min-w-0 truncate">{zone}</span>}
                      {zone && openState && (
                        <span aria-hidden="true" className="text-gray-400">
                          ·
                        </span>
                      )}
                      {openState && <OpenStateText state={openState} className="shrink-0" />}
                    </div>
                  )}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/features/RestaurantList.test.tsx && npm run type-check`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/RestaurantList.tsx src/features/RestaurantList.test.tsx
git commit -m "feat(list): show a matched place's zone and open state"
```

---

### Task 10: The detail shows zone, compact address, hours and actions

**Files:**
- Modify: `src/features/ui/ModalHeader.tsx` (optional `subtitle`)
- Create: `src/features/visits/PlaceInfo.tsx` (the info block, extracted from `RestaurantDetail.tsx`)
- Create: `src/features/places/OpeningHours.tsx`
- Create: `src/features/places/PlaceActions.tsx`
- Create: `src/features/places/OsmFooter.tsx`
- Create: `src/features/places/weekdayNames.ts`
- Modify: `src/features/visits/RestaurantDetail.tsx`
- Modify: `src/i18n/locales/en/translation.json`, `src/i18n/locales/fr/translation.json` (`place.*`)
- Test: `src/features/ui/ModalHeader.test.tsx`, `src/features/visits/RestaurantDetail.test.tsx`

**Interfaces:**
- Consumes: `detailZone`, `compactAddress`, `osmObjectUrl`, `websiteLabel` (Task 5); `parseOpeningHours`, `openStateAt`, `weekdayIndex`, `formatClock` (Task 4); `OpenStateText`, `useNow` (Task 6); `isHttpUrl`, `resolveDestination`, `googleMapsSearchUrl`, `googleMapsDirectionsUrl` (`src/lib/mapsLinks.ts`).
- Produces: `ModalHeader({ title, subtitle?, onClose, variant? })`; `<PlaceInfo restaurant distanceLabel options onCuisineChange />`; `<OsmFooter osm onRefresh? refreshing? />`; `weekdayNames(language: string): string[]` (Monday first).

- [ ] **Step 1: Add the i18n keys**

Add to `place` in `en`: `"call": "Call"`, `"website": "Website"`, `"showWeek": "Show the week’s hours"`, `"closedDay": "Closed"`, `"osmSource": "OpenStreetMap · {{date}}"`, `"refresh": "Refresh"`, `"correct": "Correct"`. In `fr`: `"call": "Appeler"`, `"website": "Site"`, `"showWeek": "Afficher les horaires de la semaine"`, `"closedDay": "Fermé"`, `"osmSource": "OpenStreetMap · {{date}}"`, `"refresh": "Actualiser"`, `"correct": "Corriger"`.

- [ ] **Step 2: Write the failing tests**

`src/features/ui/ModalHeader.test.tsx`, add:

```tsx
  it('renders an optional subtitle under the title', () => {
    render(<ModalHeader title="Le Servan" subtitle="Paris 11th · Quartier de la Roquette" onClose={() => {}} variant="detail" />)
    expect(screen.getByText('Paris 11th · Quartier de la Roquette')).toBeInTheDocument()
  })
```

`src/features/visits/RestaurantDetail.test.tsx`, add:

```tsx
  describe('with an OpenStreetMap snapshot', () => {
    const osm = {
      type: 'node' as const,
      id: 3602657896,
      checkedAt: '2026-09-19T10:00:00.000Z',
      street: '32 Rue Saint-Maur',
      city: 'Paris',
      postcode: '75011',
      quarter: 'Quartier de la Roquette',
      openingHours: 'Mo-Fr 19:30-22:30, Tu-Fr 12:00-14:00',
      phone: '+33 1 55 28 51 82',
      website: 'https://leservan.com/',
    }

    async function open() {
      const r = await createRestaurant({
        name: 'Le Servan',
        lat: 48.86,
        lng: 2.38,
        address: '32, Rue Saint-Maur, Quartier de la Roquette, Paris 11e Arrondissement, Paris, France',
        osm,
      })
      render(<RestaurantDetail restaurantId={r.id} onClose={vi.fn()} onDeleted={vi.fn()} />)
      await screen.findByText('Le Servan')
    }

    it('shows the zone under the name and the street instead of the full address', async () => {
      await open()
      expect(screen.getByText('Paris 11th · Quartier de la Roquette')).toBeInTheDocument()
      expect(screen.getByText('32 Rue Saint-Maur')).toBeInTheDocument()
      expect(screen.queryByText(/Arrondissement, Paris, France/)).toBeNull()
    })

    it('offers call and website actions', async () => {
      await open()
      expect(screen.getByRole('link', { name: /call/i })).toHaveAttribute('href', 'tel:+33155285182')
      expect(screen.getByRole('link', { name: /website/i })).toHaveAttribute('href', 'https://leservan.com/')
    })

    it('unfolds the week, and links the OSM object to correct it', async () => {
      await open()
      const user = userEvent.setup()
      await user.click(screen.getByRole('button', { name: /show the week/i }))
      expect(screen.getByText('Mon')).toBeInTheDocument()
      expect(screen.getAllByText('Closed').length).toBeGreaterThanOrEqual(2) // Sat, Sun
      expect(screen.getByRole('link', { name: 'Correct' })).toHaveAttribute(
        'href',
        'https://www.openstreetmap.org/node/3602657896',
      )
    })

    it('shows unreadable hours as written', async () => {
      const r = await createRestaurant({ name: 'X', lat: 1, lng: 1, osm: { ...osm, openingHours: 'Mo-Fr 08:00-sunset' } })
      render(<RestaurantDetail restaurantId={r.id} onClose={vi.fn()} onDeleted={vi.fn()} />)
      expect(await screen.findByText('Mo-Fr 08:00-sunset')).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /show the week/i })).toBeNull()
    })
  })
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run src/features/ui/ModalHeader.test.tsx src/features/visits/RestaurantDetail.test.tsx`
Expected: FAIL.

- [ ] **Step 4: Give `ModalHeader` a subtitle**

Add `subtitle?: string` to the props and render the heading as:

```tsx
      <div className="min-w-0">
        <h2 className={styles.title}>{title}</h2>
        {subtitle && <p className="mt-0.5 text-[13px] font-semibold text-gray-600">{subtitle}</p>}
      </div>
```

- [ ] **Step 5: Write the place components**

`src/features/places/weekdayNames.ts`:

```ts
/** Short weekday names in `language`, Monday first ("Mon"…, "lun."…). 2024-01-01 was a Monday. */
export function weekdayNames(language: string): string[] {
  const format = new Intl.DateTimeFormat(language, { weekday: 'short' })
  return Array.from({ length: 7 }, (_, i) => format.format(new Date(2024, 0, 1 + i)))
}
```

`src/features/places/OpeningHours.tsx`:

```tsx
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronDown, ChevronUp, Clock } from 'lucide-react'
import { OpenStateText } from './OpenStateText'
import { useNow } from './useNow'
import { weekdayNames } from './weekdayNames'
import { cn } from '../../lib/cn'
import { formatClock, openStateAt, parseOpeningHours, weekdayIndex } from '../../lib/openingHours'

/**
 * A place's hours folded to one line (the state now), unfolding to the week with today in bold.
 * A value the reader cannot parse is shown as OSM wrote it, with no state and nothing to unfold.
 */
export function OpeningHours({ raw }: { raw: string }) {
  const { t, i18n } = useTranslation()
  const now = useNow()
  const [open, setOpen] = useState(false)
  const week = parseOpeningHours(raw)

  if (!week) {
    return (
      <p className="mt-3 flex items-start gap-2 rounded-[14px] bg-white px-3 py-2.5 text-[13px] text-gray-700 shadow-chip">
        <Clock size={15} aria-hidden="true" className="mt-0.5 shrink-0 text-gray-500" />
        {raw}
      </p>
    )
  }

  const today = weekdayIndex(now)
  const names = weekdayNames(i18n.language)
  return (
    <div className="mt-3 rounded-[14px] bg-white px-3 py-2.5 shadow-chip">
      <button
        type="button"
        aria-expanded={open}
        aria-label={t('place.showWeek')}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 text-left text-[13px]"
      >
        <Clock size={15} aria-hidden="true" className="shrink-0 text-gray-500" />
        <OpenStateText state={openStateAt(week, now)} />
        {open ? (
          <ChevronUp size={16} aria-hidden="true" className="ml-auto text-gray-500" />
        ) : (
          <ChevronDown size={16} aria-hidden="true" className="ml-auto text-gray-500" />
        )}
      </button>
      {open && (
        <dl className="mt-2 grid grid-cols-[3rem_1fr] gap-x-2.5 gap-y-0.5 text-[12.5px] text-gray-700">
          {week.map((spans, day) => (
            <div key={names[day]} className={cn('contents', day === today && 'font-bold text-gray-900')}>
              <dt>{names[day]}</dt>
              <dd className={cn(spans.length === 0 && 'text-gray-500')}>
                {spans.length === 0
                  ? t('place.closedDay')
                  : spans.map((s) => `${formatClock(s.start)}–${formatClock(s.end)}`).join(', ')}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  )
}
```

The toggle's accessible name comes from `aria-label` ("Show the week’s hours"); the state text stays visible beside it. The day names use `Intl` for the app language: "Mon" in English, "lun." in French.

`src/features/places/PlaceActions.tsx`:

```tsx
import { useTranslation } from 'react-i18next'
import { Globe, MapPin, Navigation, Phone } from 'lucide-react'
import { cn } from '../../lib/cn'
import {
  googleMapsDirectionsUrl,
  googleMapsSearchUrl,
  isHttpUrl,
  resolveDestination,
} from '../../lib/mapsLinks'
import type { Restaurant } from '../../types/models'

const PILL = 'flex shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold transition'
const FILLED = cn(PILL, 'bg-brand text-white shadow-sm hover:bg-brand-strong')
const OUTLINED = cn(PILL, 'bg-white text-brand-strong ring-[1.5px] ring-brand/40 ring-inset hover:bg-brand-soft')

/**
 * What can be done from a place, each shown only when it has a value: the two "I'm going"
 * gestures filled (directions, call), the two "find out more" ones outlined (website, Maps).
 */
export function PlaceActions({ restaurant }: { restaurant: Restaurant }) {
  const { t } = useTranslation()
  const destination = resolveDestination(restaurant)
  const mapsHref = isHttpUrl(restaurant.mapsUrl)
    ? restaurant.mapsUrl
    : destination
      ? googleMapsSearchUrl(destination)
      : undefined
  const goToHref = destination ? googleMapsDirectionsUrl(destination) : undefined
  const phone = restaurant.osm?.phone
  // Only an http(s) website becomes a link, like `mapsUrl`: a tag is free text.
  const rawWebsite = restaurant.osm?.website
  const website = isHttpUrl(rawWebsite) ? rawWebsite : undefined
  if (!mapsHref && !goToHref && !phone && !website) return null
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      {goToHref && (
        <a href={goToHref} target="_blank" rel="noreferrer" className={FILLED}>
          <Navigation size={14} aria-hidden="true" />
          {t('visitDetail.goTo')}
        </a>
      )}
      {phone && (
        <a href={`tel:${phone.replace(/[^\d+]/g, '')}`} className={FILLED}>
          <Phone size={14} aria-hidden="true" />
          {t('place.call')}
        </a>
      )}
      {website && (
        <a href={website} target="_blank" rel="noreferrer" className={OUTLINED}>
          <Globe size={14} aria-hidden="true" />
          {t('place.website')}
        </a>
      )}
      {mapsHref && (
        <a href={mapsHref} target="_blank" rel="noreferrer" className={OUTLINED}>
          <MapPin size={14} aria-hidden="true" />
          {t('visitDetail.googleMaps')}
        </a>
      )}
    </div>
  )
}
```

`src/features/places/OsmFooter.tsx`:

```tsx
import { useTranslation } from 'react-i18next'
import { Map as MapIcon } from 'lucide-react'
import { Button } from '../ui/Button'
import { osmObjectUrl } from './placeDisplay'
import type { OsmSnapshot } from '../../types/models'

/** "OpenStreetMap · 19/09/2026 · Refresh · Correct": the source, its date, and the two ways to fix it. */
export function OsmFooter({
  osm,
  onRefresh,
  refreshing = false,
}: {
  osm: OsmSnapshot
  onRefresh?: () => void
  refreshing?: boolean
}) {
  const { t, i18n } = useTranslation()
  const date = new Intl.DateTimeFormat(i18n.language, { dateStyle: 'short' }).format(new Date(osm.checkedAt))
  return (
    <p className="mt-3 flex flex-wrap items-center gap-1.5 text-[11.5px] text-gray-600">
      <MapIcon size={13} aria-hidden="true" />
      {t('place.osmSource', { date })}
      {onRefresh && (
        <>
          <span aria-hidden="true">·</span>
          <Button variant="link" size="xs" onClick={onRefresh} disabled={refreshing}>
            {t('place.refresh')}
          </Button>
        </>
      )}
      <span aria-hidden="true">·</span>
      <a href={osmObjectUrl(osm)} target="_blank" rel="noreferrer" className="font-medium text-brand-strong underline">
        {t('place.correct')}
      </a>
    </p>
  )
}
```

- [ ] **Step 6: Extract `PlaceInfo` and use it in the detail**

`src/features/visits/PlaceInfo.tsx`:

```tsx
import { useTranslation } from 'react-i18next'
import { Calendar, MapPin, Navigation } from 'lucide-react'
import { StatusBadge } from '../StatusBadge'
import { CuisinePicker } from '../facets/CuisinePicker'
import { OpeningHours } from '../places/OpeningHours'
import { OsmFooter } from '../places/OsmFooter'
import { PlaceActions } from '../places/PlaceActions'
import { compactAddress } from '../places/placeDisplay'
import { instantToLocalDay } from '../../lib/dates'
import type { RankedCuisine } from '../facets/cuisineRanking'
import type { Restaurant } from '../../types/models'

/** The detail's info block (R4): standing, where, category, hours, actions and the OSM source. */
export function PlaceInfo({
  restaurant,
  distanceLabel,
  options,
  onCuisineChange,
}: {
  restaurant: Restaurant
  distanceLabel: string | null
  options: readonly RankedCuisine[]
  onCuisineChange: (cuisine: string | undefined) => void
}) {
  const { t } = useTranslation()
  const address = compactAddress(restaurant)
  return (
    <div className="rounded-card bg-gray-50 p-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-gray-600">
        <StatusBadge restaurant={restaurant} />
        {distanceLabel && (
          <span className="flex items-center gap-1">
            <Navigation size={14} aria-hidden="true" />
            {distanceLabel}
          </span>
        )}
        {restaurant.added && (
          <span className="flex items-center gap-1">
            <Calendar size={14} aria-hidden="true" />
            {t('visitDetail.addedOn', { date: instantToLocalDay(restaurant.added) })}
          </span>
        )}
      </div>

      {address && (
        <p className="mt-2 flex items-start gap-1.5 text-sm text-gray-700">
          <MapPin size={14} aria-hidden="true" className="mt-0.5 shrink-0 text-gray-500" />
          {address}
        </p>
      )}

      <div className="mt-3">
        <CuisinePicker
          value={restaurant.cuisine}
          options={options}
          onChange={(cuisine) => {
            if (cuisine === (restaurant.cuisine?.trim() || undefined)) return
            onCuisineChange(cuisine)
          }}
        />
      </div>

      {restaurant.osm?.openingHours && <OpeningHours raw={restaurant.osm.openingHours} />}
      <PlaceActions restaurant={restaurant} />
      {restaurant.osm && <OsmFooter osm={restaurant.osm} />}
    </div>
  )
}
```

In `RestaurantDetail.tsx`: remove the `Calendar, MapPin, Navigation` icons, `StatusBadge`, `CuisinePicker`, `instantToLocalDay` and `mapsLinks` imports and the `destination`/`googleMapsHref`/`goToHref` computation; import `PlaceInfo` and `detailZone`; change `const { t } = useTranslation()` to `const { t, i18n } = useTranslation()`; pass `subtitle={restaurant.osm && detailZone(restaurant.osm, t, i18n.language)}` to `ModalHeader`; and replace the whole info-block `<div className="rounded-card bg-gray-50 p-3">…</div>` with:

```tsx
      <PlaceInfo
        key={restaurant.id}
        restaurant={restaurant}
        distanceLabel={distanceLabel}
        options={options}
        onCuisineChange={(cuisine) => save({ cuisine })}
      />
```

The existing `RestaurantDetail.test.tsx` link tests (`Google Maps`, `Go to`) keep passing: the same hrefs, now in `PlaceActions`.

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npx vitest run src/features/ui src/features/visits src/features/places src/i18n && npm run type-check && npx eslint src/features`
Expected: PASS. Check `wc -l src/features/visits/RestaurantDetail.tsx src/features/visits/PlaceInfo.tsx`: both under 250.

- [ ] **Step 8: Commit**

```bash
git add src/features/ui/ModalHeader.tsx src/features/ui/ModalHeader.test.tsx src/features/visits src/features/places src/i18n/locales/en/translation.json src/i18n/locales/fr/translation.json
git commit -m "feat(visits): zone, compact address, hours and call/site on the detail"
```

---

### Task 11: Complete from OpenStreetMap, and refresh

**Files:**
- Create: `src/features/places/osmDismissals.ts`
- Create: `src/features/places/useOsmEnrichment.ts`
- Create: `src/features/places/OsmEnrich.tsx`
- Modify: `src/features/visits/PlaceInfo.tsx`
- Modify: `src/i18n/locales/en/translation.json`, `src/i18n/locales/fr/translation.json` (`place.*`)
- Test: `src/features/places/osmDismissals.test.ts`, `src/features/visits/RestaurantDetail.test.tsx`

**Interfaces:**
- Consumes: `matchNear`, `lookupOsm`, `setGeocodeProvider` (Task 3); `suggestCategory` (Task 2); `updateRestaurant`, `RestaurantPatch` (Task 1); `OsmFooter` (Task 10); `shortZone`, `formatDistance`/`haversineMeters` (`src/lib/geo.ts`); `cuisineLabel`.
- Produces: `isOsmDismissed(id: string): boolean`, `dismissOsm(id: string): void`; `type EnrichState`; `useOsmEnrichment(restaurant: Restaurant)` returning `{ state, canComplete, complete, confirm, reject, refresh }`; `<OsmEnrich restaurant enrichment />`.

- [ ] **Step 1: Add the i18n keys**

Add to `place` in `en`:

```json
"complete": "Complete from OpenStreetMap",
"completeHint": "hours, phone, website, area",
"confirmMatch": "Yes, complete",
"rejectMatch": "Not this one",
"matchDistance": "{{distance}} away",
"categoryKept": "Your category “{{category}}” is kept.",
"notFound": "Not found on OpenStreetMap",
"notFoundHint": "No place of this name within 75 m.",
"osmFailed": "OpenStreetMap is not answering, try again later.",
"osmGone": "This place is no longer on OpenStreetMap (maybe closed)."
```

and to `place` in `fr`:

```json
"complete": "Compléter depuis OpenStreetMap",
"completeHint": "horaires, téléphone, site, quartier",
"confirmMatch": "Oui, compléter",
"rejectMatch": "Ce n’est pas lui",
"matchDistance": "à {{distance}}",
"categoryKept": "Ta catégorie « {{category}} » est gardée.",
"notFound": "Pas trouvé sur OpenStreetMap",
"notFoundHint": "Aucun lieu de ce nom à moins de 75 m.",
"osmFailed": "OpenStreetMap ne répond pas, réessaie plus tard.",
"osmGone": "Ce lieu n’est plus sur OpenStreetMap (peut-être fermé)."
```

- [ ] **Step 2: Write the failing tests**

`src/features/places/osmDismissals.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import { dismissOsm, isOsmDismissed } from './osmDismissals'

afterEach(() => {
  vi.restoreAllMocks()
  localStorage.clear()
})

describe('osmDismissals', () => {
  it('remembers a refused match on this device', () => {
    expect(isOsmDismissed('a')).toBe(false)
    dismissOsm('a')
    dismissOsm('a')
    expect(isOsmDismissed('a')).toBe(true)
    expect(JSON.parse(localStorage.getItem('tablemarks:osmDismissed')!)).toEqual(['a'])
  })

  it('ignores a corrupt value', () => {
    localStorage.setItem('tablemarks:osmDismissed', '{not json')
    expect(isOsmDismissed('a')).toBe(false)
  })

  it('does not throw when storage is unavailable', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(() => dismissOsm('a')).not.toThrow()
    expect(isOsmDismissed('a')).toBe(false)
  })
})
```

Add to `src/features/visits/RestaurantDetail.test.tsx` (import `setGeocodeProvider, nominatim` from `'../../capture/geocode'`, `type GeoCandidate`, and add `afterEach(() => { setGeocodeProvider(nominatim); localStorage.clear() })`):

```tsx
  describe('completing from OpenStreetMap', () => {
    const MATCH: GeoCandidate = {
      name: 'Double Dragon',
      lat: 48.8634,
      lng: 2.3746,
      osmClass: 'amenity=restaurant',
      cuisineTag: 'chinese',
      osm: { type: 'node', id: 9, checkedAt: '2026-09-26T10:00:00.000Z', city: 'Paris', postcode: '75011', street: '52 Rue Saint-Maur', phone: '+33 1 71 32 41 95' },
    }

    function provide(near: GeoCandidate[] | Error, lookup: GeoCandidate | null | Error = null) {
      setGeocodeProvider({
        search: async () => {
          if (near instanceof Error) throw near
          return near
        },
        reverse: async () => undefined,
        lookup: async () => {
          if (lookup instanceof Error) throw lookup
          return lookup
        },
      })
    }

    async function openPlace(over: Partial<Parameters<typeof createRestaurant>[0]> = {}) {
      const r = await createRestaurant({ name: 'Double Dragon', lat: 48.8634, lng: 2.3746, ...over })
      render(<RestaurantDetail restaurantId={r.id} onClose={vi.fn()} onDeleted={vi.fn()} />)
      await screen.findByText('Double Dragon')
      return r
    }

    it('proposes the match and writes it, with its category, on confirm', async () => {
      provide([MATCH])
      const r = await openPlace()
      const user = userEvent.setup()
      await user.click(screen.getByRole('button', { name: /complete from openstreetmap/i }))
      expect(await screen.findByText('52 Rue Saint-Maur', { exact: false })).toBeInTheDocument()
      await user.click(screen.getByRole('button', { name: 'Yes, complete' }))
      await waitFor(async () => expect((await getRestaurant(r.id))?.osm?.id).toBe(9))
      expect((await getRestaurant(r.id))?.cuisine).toBe('chinese')
    })

    it('keeps a category already set', async () => {
      provide([MATCH])
      const r = await openPlace({ cuisine: 'thai' })
      const user = userEvent.setup()
      await user.click(screen.getByRole('button', { name: /complete from openstreetmap/i }))
      expect(await screen.findByText(/your category “Thai” is kept/i)).toBeInTheDocument()
      await user.click(screen.getByRole('button', { name: 'Yes, complete' }))
      await waitFor(async () => expect((await getRestaurant(r.id))?.osm).toBeDefined())
      expect((await getRestaurant(r.id))?.cuisine).toBe('thai')
    })

    it('hides the offer for good on "Not this one"', async () => {
      provide([MATCH])
      const r = await openPlace()
      const user = userEvent.setup()
      await user.click(screen.getByRole('button', { name: /complete from openstreetmap/i }))
      await user.click(await screen.findByRole('button', { name: 'Not this one' }))
      expect(screen.queryByRole('button', { name: /complete from openstreetmap/i })).toBeNull()
      expect(JSON.parse(localStorage.getItem('tablemarks:osmDismissed')!)).toEqual([r.id])
    })

    it('says when nothing is found, and when OSM does not answer', async () => {
      provide([])
      await openPlace()
      const user = userEvent.setup()
      await user.click(screen.getByRole('button', { name: /complete from openstreetmap/i }))
      expect(await screen.findByText('Not found on OpenStreetMap')).toBeInTheDocument()

      provide(new Error('down'))
      await user.click(screen.getByRole('button', { name: /complete from openstreetmap/i }))
      expect(await screen.findByText(/not answering/i)).toBeInTheDocument()
    })

    it('refreshes a matched place, and says when the object is gone', async () => {
      const fresh = { ...MATCH, osm: { ...MATCH.osm!, checkedAt: '2026-09-27T10:00:00.000Z' } }
      provide([], fresh)
      const r = await openPlace({ osm: MATCH.osm })
      const user = userEvent.setup()
      await user.click(screen.getByRole('button', { name: 'Refresh' }))
      await waitFor(async () =>
        expect((await getRestaurant(r.id))?.osm?.checkedAt).toBe('2026-09-27T10:00:00.000Z'),
      )

      provide([], null)
      await user.click(screen.getByRole('button', { name: 'Refresh' }))
      expect(await screen.findByText(/no longer on openstreetmap/i)).toBeInTheDocument()
      expect((await getRestaurant(r.id))?.osm?.checkedAt).toBe('2026-09-27T10:00:00.000Z')
    })

    it('offers nothing for a place without coordinates', async () => {
      provide([MATCH])
      await openPlace({ lat: null, lng: null })
      expect(screen.queryByRole('button', { name: /complete from openstreetmap/i })).toBeNull()
    })
  })
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run src/features/places/osmDismissals.test.ts src/features/visits/RestaurantDetail.test.tsx`
Expected: FAIL.

- [ ] **Step 4: Write `src/features/places/osmDismissals.ts`**

```ts
/** Device-local: places whose proposed OSM match the user refused. A preference, not data. */
const KEY = 'tablemarks:osmDismissed'

function read(): string[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]')
    return Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : []
  } catch {
    return []
  }
}

export function isOsmDismissed(id: string): boolean {
  return read().includes(id)
}

export function dismissOsm(id: string): void {
  const ids = read()
  if (ids.includes(id)) return
  try {
    localStorage.setItem(KEY, JSON.stringify([...ids, id]))
  } catch {
    // Storage blocked or full: the offer simply comes back next time the detail opens.
  }
}
```

- [ ] **Step 5: Write `src/features/places/useOsmEnrichment.ts`**

```ts
import { useState } from 'react'
import { isOsmDismissed, dismissOsm } from './osmDismissals'
import { suggestCategory } from '../facets/osmCategory'
import { lookupOsm, matchNear, type GeoCandidate } from '../../capture/geocode'
import { updateRestaurant, type RestaurantPatch } from '../../data/restaurants'
import type { Restaurant } from '../../types/models'

export type EnrichState =
  | { kind: 'idle' }
  | { kind: 'busy' }
  | { kind: 'proposal'; candidate: GeoCandidate }
  | { kind: 'not-found' }
  /** OSM could not be asked (network, Nominatim). */
  | { kind: 'failed' }
  /** Refresh found the object deleted from OSM; the old snapshot stays. */
  | { kind: 'gone' }
  /** The local write was rejected. */
  | { kind: 'save-failed' }

/** "Complete from OpenStreetMap" and "Refresh" for one place. Every outcome reaches the user. */
export function useOsmEnrichment(restaurant: Restaurant) {
  const [state, setState] = useState<EnrichState>({ kind: 'idle' })
  const [dismissed, setDismissed] = useState(() => isOsmDismissed(restaurant.id))
  const { lat, lng } = restaurant
  const canComplete = !restaurant.osm && lat !== null && lng !== null && !dismissed

  async function write(patch: RestaurantPatch) {
    try {
      await updateRestaurant(restaurant.id, patch)
      setState({ kind: 'idle' })
    } catch {
      setState({ kind: 'save-failed' })
    }
  }

  async function complete() {
    if (lat === null || lng === null) return
    setState({ kind: 'busy' })
    try {
      const candidate = await matchNear(restaurant.name, lat, lng)
      setState(candidate ? { kind: 'proposal', candidate } : { kind: 'not-found' })
    } catch {
      setState({ kind: 'failed' })
    }
  }

  async function confirm() {
    if (state.kind !== 'proposal' || !state.candidate.osm) return
    const patch: RestaurantPatch = { osm: state.candidate.osm }
    // Only an uncategorized place takes OSM's category: the category is the user's.
    const suggestion = suggestCategory(state.candidate)
    if (!restaurant.cuisine && suggestion) patch.cuisine = suggestion
    await write(patch)
  }

  function reject() {
    dismissOsm(restaurant.id)
    setDismissed(true)
    setState({ kind: 'idle' })
  }

  async function refresh() {
    const osm = restaurant.osm
    if (!osm) return
    setState({ kind: 'busy' })
    let fresh: GeoCandidate | null
    try {
      fresh = await lookupOsm(osm.type, osm.id)
    } catch {
      setState({ kind: 'failed' })
      return
    }
    if (!fresh?.osm) setState({ kind: 'gone' })
    else await write({ osm: fresh.osm })
  }

  return { state, canComplete, complete, confirm, reject, refresh }
}
```

- [ ] **Step 6: Write `src/features/places/OsmEnrich.tsx`**

```tsx
import { useTranslation } from 'react-i18next'
import { SearchX, Sparkles } from 'lucide-react'
import { Button } from '../ui/Button'
import { shortZone } from './placeDisplay'
import { cuisineLabel } from '../facets/cuisineCatalog'
import { formatDistance, haversineMeters } from '../../lib/geo'
import type { useOsmEnrichment } from './useOsmEnrichment'
import type { Restaurant } from '../../types/models'

const MESSAGE = {
  failed: 'place.osmFailed',
  gone: 'place.osmGone',
  'save-failed': 'visitDetail.errorSave',
} as const

/** The offer to complete a place from OSM, its confirmation, and every outcome's message. */
export function OsmEnrich({
  restaurant,
  enrichment,
}: {
  restaurant: Restaurant
  enrichment: ReturnType<typeof useOsmEnrichment>
}) {
  const { t, i18n } = useTranslation()
  const { state } = enrichment

  if (state.kind === 'proposal') {
    const { candidate } = state
    const osm = candidate.osm
    const distance =
      restaurant.lat !== null && restaurant.lng !== null
        ? formatDistance(haversineMeters(restaurant.lat, restaurant.lng, candidate.lat, candidate.lng))
        : null
    const where = osm ? [shortZone(osm, t, i18n.language), osm.street].filter(Boolean).join(' · ') : ''
    return (
      <div className="mt-3 rounded-[14px] bg-white p-3 shadow-card">
        <p className="text-sm">
          <strong>{candidate.name}</strong>
          {distance && <span className="text-gray-600"> · {t('place.matchDistance', { distance })}</span>}
        </p>
        {where && <p className="text-xs text-gray-600">{where}</p>}
        {osm?.openingHours && <p className="mt-1.5 text-xs text-gray-700">{osm.openingHours}</p>}
        {osm?.phone && <p className="text-xs text-gray-700">{osm.phone}</p>}
        {restaurant.cuisine && (
          <p className="mt-1.5 text-xs text-gray-600">
            {t('place.categoryKept', { category: cuisineLabel(restaurant.cuisine, t) })}
          </p>
        )}
        <div className="mt-2.5 flex gap-2">
          <Button variant="primary" className="flex-1" onClick={() => void enrichment.confirm()}>
            {t('place.confirmMatch')}
          </Button>
          <Button variant="secondary" className="flex-1" onClick={enrichment.reject}>
            {t('place.rejectMatch')}
          </Button>
        </div>
      </div>
    )
  }

  const message =
    state.kind === 'failed' || state.kind === 'gone' || state.kind === 'save-failed'
      ? MESSAGE[state.kind]
      : null

  // The outcome, then the offer again when it still applies: "not found" and "not answering" can
  // be retried; a refresh outcome shows alone, since a matched place has no offer.
  return (
    <>
      {message && (
        <p role="alert" className="mt-3 text-sm text-red-600">
          {t(message)}
        </p>
      )}
      {state.kind === 'not-found' && (
        <p className="mt-3 flex items-start gap-2 rounded-[14px] border-[1.5px] border-gray-300 p-3 text-[13px] text-gray-600">
          <SearchX size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
          <span>
            <span className="block font-semibold">{t('place.notFound')}</span>
            <span className="block text-xs">{t('place.notFoundHint')}</span>
          </span>
        </p>
      )}
      {enrichment.canComplete && (
        <button
          type="button"
          onClick={() => void enrichment.complete()}
          disabled={state.kind === 'busy'}
          className="mt-3 flex w-full items-center gap-2.5 rounded-[14px] border-[1.5px] border-dashed border-brand/40 bg-white px-3 py-2.5 text-left text-[13px] font-semibold text-brand-strong transition hover:bg-brand-soft disabled:opacity-50"
        >
          <Sparkles size={16} aria-hidden="true" />
          <span>
            <span className="block">{t('place.complete')}</span>
            <span className="block text-xs font-medium text-gray-600">{t('place.completeHint')}</span>
          </span>
        </button>
      )}
    </>
  )
}
```

- [ ] **Step 7: Wire it into `PlaceInfo`**

In `src/features/visits/PlaceInfo.tsx`, import `useOsmEnrichment` and `OsmEnrich`, add `const enrichment = useOsmEnrichment(restaurant)` at the top of the component, and:

```tsx
      {/* Not matched yet: the offer sits under the category, which it may fill. */}
      {!restaurant.osm && <OsmEnrich restaurant={restaurant} enrichment={enrichment} />}

      {restaurant.osm?.openingHours && <OpeningHours raw={restaurant.osm.openingHours} />}
      <PlaceActions restaurant={restaurant} />
      {restaurant.osm && (
        <>
          <OsmEnrich restaurant={restaurant} enrichment={enrichment} />
          <OsmFooter
            osm={restaurant.osm}
            onRefresh={() => void enrichment.refresh()}
            refreshing={enrichment.state.kind === 'busy'}
          />
        </>
      )}
```

`PlaceInfo` is keyed by the restaurant id in `RestaurantDetail` (Task 10), so the hook's state never leaks from one place to the next.

- [ ] **Step 8: Run the tests to verify they pass**

Run: `npx vitest run src/features/places src/features/visits src/i18n && npm run type-check && npx eslint src/features`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/features/places src/features/visits src/i18n/locales/en/translation.json src/i18n/locales/fr/translation.json
git commit -m "feat(visits): complete a place from OpenStreetMap, and refresh it"
```

---

### Task 12: Documentation

**Files:**
- Modify: `docs/explanation/architecture.md`
- Modify: `CONCEPTS.md`
- Modify: `README.md`

- [ ] **Step 1: Architecture**

In `docs/explanation/architecture.md`, add a section before `## Offline`:

```markdown
## OpenStreetMap snapshots

A place can carry a read-only snapshot of the OpenStreetMap object it is (`osm` on the record):
its identity, address parts, `opening_hours`, phone and website. OSM stays the source of truth
for those fields — the app never edits them; it writes a snapshot at capture or on "Complete",
replaces it whole on "Refresh", and sends "Correct" to openstreetmap.org. Only the category can
come from it, and only for a place that has none. Matching a point to OSM (a pasted link, an old
place) is a bounded Nominatim search: the nearest eatery within 75 m whose name matches, always
confirmed by the user. Everything shown from a snapshot — the short zone, the compact address,
the open state — is derived at render, and the hours are read by a small in-house parser
(`src/lib/openingHours.ts`) rather than the 118 KB `opening_hours` package; a value it cannot
read is shown as written.
```

and add "OpenStreetMap enrichment (search results, link preview, hours, zone)" to the `## Scope built so far` sentence.

- [ ] **Step 2: Concepts**

In `CONCEPTS.md`, under `## Records` after `### Provisional record`, add:

```markdown
### OSM snapshot

The read-only copy of the OpenStreetMap object a Restaurant was matched to — identity, address
parts, opening hours, phone, website — with the date it was fetched. Replaced whole on refresh,
never edited; OSM is where it is corrected.

### Eatery

An OpenStreetMap object of a kind this app saves: a restaurant, fast food, café, bar, pub, ice
cream, food court, bakery or pastry shop. Search results that are not eateries fold away.
```

Under `## Classification`, add:

```markdown
### Short zone

Where a place is, in the fewest words that tell two apart: "Paris 11e", "Lyon 1er", else the city.
Derived from the OSM snapshot, never stored.
```

- [ ] **Step 3: README**

In `README.md` `## Usage`, replace the "Add a place" line with:

```markdown
- **Add a place:** click _+ Add a place_, paste a Google Maps link or type a name, and press
  _Search_. Pick the right result (or check the link's preview), adjust the category OpenStreetMap
  suggests if needed, and press _Add_.
- **Place details:** a place matched to OpenStreetMap shows its area, whether it is open now, its
  weekly hours, and Call / Website buttons. _Complete from OpenStreetMap_ matches an older place;
  _Refresh_ and _Correct_ keep it current.
```

- [ ] **Step 4: Check and commit**

Run: `npm run check:docs && npx prettier --check docs CONCEPTS.md README.md`
Expected: `docs/ structure OK`, no formatting issue.

```bash
git add docs/explanation/architecture.md CONCEPTS.md README.md
git commit -m "docs: OpenStreetMap snapshots, eateries and short zones"
```

## Final verification

- [ ] Run: `npm test && npm run type-check && npx eslint . && npx prettier . --check && npm run check:docs`
- [ ] Run: `npx vite build --mode demo --base=/tablemarks/ && sh scripts/check-demo-target.sh dist`
- [ ] Run the app (`npm run dev`) and walk the mockups' flows against live Nominatim: search "L'As du Fallafel" (category pre-filled, zone "Paris 4e" in French), search "Chez Aline" (fold), paste a full Maps link for Le Servan (preview, "Ce n'est pas lui"), open an older place and "Compléter depuis OpenStreetMap", then "Actualiser".
