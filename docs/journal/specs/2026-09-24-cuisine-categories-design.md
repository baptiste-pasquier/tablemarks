---
title: Cuisine Categories - Design
type: design
date: 2026-09-24
topic: cuisine-categories
status: approved
---

# Cuisine Categories - Design

## Goal

Turn the cuisine facet into a translated, usage-ordered category list:

- grow the curated set from 12 to 22 entries, including places that are not cuisines
  (bakery, bar, ice cream);
- show every curated entry in the reader's language (French and English), whatever
  language it was picked in;
- order entries by how often the user actually uses them, the same way in the filter bar,
  the detail modal's picker and the add form's picker.

Success: a French reader with mostly bakeries sees "Boulangerie 🥐" first in both the filter
and the picker; an English reader on the same data sees "Bakery".

## Decisions taken with the requester

| Question                   | Answer                                                                    |
| -------------------------- | ------------------------------------------------------------------------- |
| Curated additions          | Boulangerie, Pâtisserie, Bar, Glacier, Crêperie, Brunch, Libanais, Grec, Espagnol, Végétarien |
| Stored value               | Normalized to a stable key; a breaking change, no backward compatibility owed |
| Colors for 22 entries      | Hue families: color signals a family, the emoji tells members apart       |
| "Cuisine" wording          | UI label becomes "Catégorie" / "Category"; the `cuisine` field and code names stay |
| Picker length              | Top 8 by rank, then a "Show all (N)" toggle                              |
| Filter tie-break           | Translated label, alphabetical in the display language                   |

## Non-goals

- Customizing the emoji or color of a free-typed category.
- Renaming the `cuisine` field in IndexedDB, PocketBase or the code.
- A data migration: resolution on read (below) already folds legacy values in.

## Model

### The catalog

One array in `src/features/facets/cuisines.ts` (or a sibling `cuisineCatalog.ts` if the
module passes 300 lines) declares every curated entry, in family order:

```ts
{ key: 'bakery', emoji: '🥐', family: 'sweet' }
```

`CuisineKey` is the union of the `key` literals. Labels are **not** in the catalog: each key
has an i18n entry `categories.<key>` in `en` and `fr`, so a missing translation is a compile
error through `src/types/i18next.d.ts`.

| Family         | Base hue | Members, in order                                        |
| -------------- | -------- | -------------------------------------------------------- |
| `americas`     | 25       | burger 🍔, mexican 🌮                                     |
| `sweet`        | 70       | bakery 🥐, pastry 🍰, ice_cream 🍦, cafe ☕️, brunch 🍳    |
| `vegetarian`   | 135      | vegetarian 🥦                                             |
| `mediterranean`| 175      | italian 🍝, pizza 🍕, greek 🥙, lebanese 🧆, spanish 🥘   |
| `france`       | 245      | french 🥖, creperie 🥞                                    |
| `asia`         | 290      | japanese 🍣, chinese 🥡, korean 🍲, thai 🍜, vietnamese 🥢, indian 🍛 |
| `bar`          | 335      | bar 🍹                                                    |

Keys are lowercase ASCII `snake_case`; they are the stored value and never change once shipped.

### Stored value

- A curated pick stores its key: `cuisine: "bakery"`.
- A free-typed name is stored as typed (trimmed): `cuisine: "Tex-Mex"`.
- The picker's "Other…" field resolves before it stores: typing "Boulangerie" or "bakery"
  stores `bakery`.

### Resolution

`resolveCuisine(value)` is the one reader of a stored cuisine:

```ts
type ResolvedCuisine =
  | { kind: 'curated'; key: CuisineKey }
  | { kind: 'custom'; label: string; key: string }
  | null // uncategorized
```

It matches the trimmed value, case- and accent-insensitively (NFD, strip combining marks,
lowercase), against an alias index built once from every curated key plus its label in every
language of `src/i18n/resources.ts`. "French", "français", "CREPERIE" and "crêperie" all
resolve to a curated key. Anything else is custom, and its `key` is the same normalized form,
so "Tex-Mex" and "tex-mex" are one category.

Every consumer goes through it: tone, emoji, label, filter key and ranking. That is what
makes legacy values ("French", written before this change) behave exactly like new ones
without a migration.

## Colors

Each family owns a base hue. Member `i` of a family (0-based, catalog order) gets:

- hue `base + [0, -12, +12][i % 3]`;
- chroma multiplier `1` for `i < 3`, `0.5` otherwise.

So a family spans at most `base ± 12`, and its fourth to sixth members are the muted twins of
the first three. Family bands: [13, 37], [58, 82], [135], [163, 187], [233, 257],
[278, 302], [335].

Free-typed categories hash into `CUSTOM_TONES`: the gap midpoints between bands,
`[47, 108, 149, 210, 267, 318, 354]`, each at chroma `1` and `0.5`, 14 tones. None falls
inside a family band. The four recipes (pill background, pill text, solid, avatar) and their
contrast floors do not change.

Every curated color changes. Nothing stores a color, so the change is only visual.

## Ranking

A new module `src/features/facets/cuisineRanking.ts` owns ordering for all three surfaces.
The ranking helpers now in `FilterBar.tsx` move there.

- `rankCuisines(restaurants, language, { includeUnused })` counts places per resolved key,
  sorts by count descending then by display label with `localeCompare(language)`, and, when
  `includeUnused` is set, appends curated keys with no place, alphabetically by display label.
- `splitRows(ranked, pinnedKeys, size)` is today's `splitCuisineRows` made generic over the
  row size: it keeps rank order and pins every selected key into the visible row, bumping the
  lowest-ranked unpinned entry, or growing the row when more are pinned than fit.

`cuisineOptions` is removed.

## Surfaces

**Filter bar.** Used categories only, 6 visible, "+N more" as today. Chips show the
translated label. `filter.ts`'s `cuisineKey` goes through `resolveCuisine`, so "French" and
`french` are one chip and one filter key. The group label reads "Catégorie" / "Category".

**Picker** (detail modal and add form). Ranked with `includeUnused`, 8 visible with the
current value pinned, then a "Show all (N)" toggle that reveals the rest. "Other…" stays last
and always visible. Closing the picker collapses the list again. A pick emits the key; a
free-typed name emits the resolved key or the typed text.

**Display.** `cuisineLabel(value, t)` replaces `cuisineDisplayName`: the translated label for
a curated key, the typed text for a custom one, `common.uncategorized` for none. The list tile,
the map tooltip and the picker trigger use it.

**i18n.** New `categories.*` keys (22 entries), `filters.cuisineGroup` becomes
"Catégorie" / "Category", and `cuisinePicker` gains a show-all and a collapse label.

## Testing

Tests first, co-located:

- `cuisines.test.ts`: resolution by key, English label and French label, regardless of case
  and accents; custom fallthrough and normalized custom key; every catalog key has an emoji
  and a label in `en` and `fr`; contrast floors hold for all 22 curated tones and all 14
  custom tones; no custom hue falls inside a family band.
- `cuisineRanking.test.ts`: count order; tie-break flips between `fr` and `en`; legacy
  "French" folds into `french`; unused curated entries trail when included and are absent
  otherwise; pinning and row size.
- `CuisinePicker.test.tsx`: 8 chips then "Show all"; the current value stays visible;
  "Other…" with "boulangerie" emits `bakery`; the list collapses on close.
- `FilterBar.test.tsx`, `filter.test.ts`: translated chip labels; folded filter keys.

## Documentation to update

- `docs/reference/design-tokens.md`: the family table and the new color rules replace the
  32-degree wheel.
- `docs/reference/data-model.md`: `cuisine` holds a curated key or free text.
- `CONCEPTS.md`: Cuisine is a curated key or free text, labelled "Category" in the UI.
