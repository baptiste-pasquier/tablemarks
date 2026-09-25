---
title: OpenStreetMap Enrichment - Design
type: design
date: 2026-09-25
topic: osm-enrichment
status: approved
---

# OpenStreetMap Enrichment - Design

## Goal

Use the OpenStreetMap data Nominatim already returns to make a place easier to add and more
useful once saved:

- **Add a place:** results show the category OSM knows and a short "city · zone", non-eatery
  results fold away, and the picked place pre-fills the category.
- **Collect:** keep the OSM identity (`type` + `id`) and a snapshot of the address parts, opening
  hours, phone and website, so the place can be refreshed later.
- **List cards:** a third line with the short zone and the open/closed state right now.
- **Detail modal:** the zone under the name, a compact address, opening hours, call/site actions,
  and a way to complete or refresh a place from OSM.

Mockups (not tracked, `.mockups/` is git-ignored): `21-osm-ajout.html` (section 0 is the retained
order), `22-osm-liste.html` (variant B), `23-osm-fiche.html` (variant A).

## Decisions taken while brainstorming

| Question                    | Decision                                                                                                                                             |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Which places get OSM data   | All: a name-search pick, a pasted Maps link (matched), and any saved place through "Complete from OpenStreetMap" on its detail. Always confirmed.     |
| Editable?                   | No. OSM fields are read-only; "Refresh" replaces them, "Correct" opens the OSM object. The category stays the one user-owned field.                  |
| Add-place order             | Input → results (or link preview) → category → Add. Picking a result selects it; it no longer creates the place.                                     |
| Non-eatery results          | Eateries first, the rest under a collapsed "N other results" fold — never dropped, so a mis-tagged restaurant stays reachable.                       |
| Opening-hours parser        | In-house, not the `opening_hours` package (118 KB gzipped, LGPL-3.0). A simple grammar already reads 91 % of the 4,877 Paris values; the rest shows raw. |
| Storage                     | One optional `osm` object on `Restaurant`, one PocketBase `json` field. No derived value stored.                                                    |
| Matching a point to OSM     | Nominatim only: bounded search around the point. No Overpass.                                                                                        |
| Export schema version       | Stays 1: the field is optional and additive.                                                                                                         |

## Data model

```ts
export type OsmType = 'node' | 'way' | 'relation'

/** A read-only snapshot of one OpenStreetMap object, replaced whole on refresh. */
export interface OsmSnapshot {
  type: OsmType
  id: number
  /** ISO instant the snapshot was fetched. */
  checkedAt: string
  /** `house_number` + `road`, as one string ("32 Rue Saint-Maur"). */
  street?: string
  postcode?: string
  /** `city` ?? `town` ?? `village` ?? `municipality`. */
  city?: string
  suburb?: string
  /** `city_block` ?? `quarter` ?? `neighbourhood` — detail modal only. */
  quarter?: string
  /** Raw `opening_hours` tag. */
  openingHours?: string
  /** `phone` ?? `contact:phone`. */
  phone?: string
  /** `website` ?? `contact:website`. */
  website?: string
}

interface Restaurant {
  // …existing fields unchanged, `address` included (Maps links still read it)…
  osm?: OsmSnapshot
}
```

- **Derived at render, never stored:** the short zone, the compact address, the open state, the
  week table. This follows the "do not store a derived value" invariant.
- **PocketBase:** one migration adds `osm` as a `json` field to `restaurants`. The mapper passes
  it through both ways. The existing owner-scoped rules cover it; nothing changes there.
- **Older clients:** a push is `update(id, body)` (`src/sync/syncEngine.ts`), which only touches
  fields in the body. A client that predates `osm` never sends it, so it never erases it.
- **Import/export:** `asRestaurant` accepts `osm` when absent, else validates its shape (type in
  the three values, finite integer id, valid `checkedAt`, every other key an optional string) and
  rejects the file as `malformed_restaurant` otherwise, like any other field. `EXPORT_SCHEMA_VERSION`
  stays 1. An OSM id is not a relation id in the sense of the export rule — it names an external
  public object, not a record of ours — so exporting it is allowed.
- **Device-local:** `localStorage['tablemarks:osmDismissed']` holds the ids of places whose
  proposed match was refused, so the "Complete" button hides for them on this device.

## Units

| Unit                                     | Responsibility                                                                                                   |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `src/capture/geocode.ts` (extended)      | Nominatim client. `search` returns enriched candidates; new `matchNear(name, lat, lng)` and `lookup(type, id)`. |
| `src/capture/osmTags.ts` (new)           | Pure: Nominatim row → `OsmSnapshot`; tags → catalog `CuisineKey`; tags → `isEatery`.                             |
| `src/lib/openingHours.ts` (new)          | Pure: parse a raw value; `stateAt(parsed, date)`; `weekTable(parsed)`. Unparseable → `null`.                    |
| `src/features/places/placeDisplay.ts` (new) | Pure: `shortZone(osm)`, `detailZone(osm)`, `compactAddress(restaurant)`.                                      |
| `src/features/places/` components (new)  | `OpeningHours` (folded line + week), `PlaceActions` (directions, call, site, Maps), `OsmFooter`, `OsmEnrich`.    |
| `src/features/capture/useAddPlace.ts` (new) | State machine of the add modal, so `AddPlace.tsx` stays a view under 250 lines.                              |
| `src/lib/useNow.ts` (new)                | One minute-ticking `Date` for the list and the detail.                                                          |
| `src/capture/capture.ts` (changed)       | Resolve then commit: `capturePaste` returns a preview; `commitCapture` writes.                                   |

### Nominatim requests

All requests add `format=jsonv2&extratags=1&addressdetails=1&accept-language=<i18n language>`,
keep the 10 s timeout, and are triggered only by a user gesture (the policy's ~1 req/s holds).

- **Search:** `/search?q=…&limit=10`.
- **Match near a point:** `/search?q=<name>&viewbox=<±0.0015° box>&bounded=1&limit=10`, then keep
  the nearest row that is an eatery, lies within 75 m, and whose name contains the query or is
  contained by it once both go through `normalizeCuisineText` (same accent/case folding as
  categories) — so "Mokonuts" meets OSM's "Mokonuts Cafe and Bakery". No row → no match. Checked
  live on four Paris places from a point offset by ~30 m: each came back as the single result.
- **Lookup:** `/lookup?osm_ids=<N|W|R><id>`. An empty array means the object is gone from OSM.

### Tag mapping (`osmTags.ts`)

- **Eatery:** `amenity` ∈ {restaurant, fast_food, cafe, bar, pub, ice_cream, food_court} or
  `shop` ∈ {bakery, pastry}. Nominatim's own `category`/`type` fields carry this.
- **Category**, first hit wins:
  1. the first `;`-separated `cuisine` value, lowercased and trimmed, that is a catalog key;
  2. an alias: `sushi`, `ramen`, `noodle` → `japanese`; `italian_pizza` → `pizza`; `pasta` →
     `italian`; `falafel` → `lebanese`; `tea` → `coffee_shop`;
  3. the place type: `amenity=cafe` → `coffee_shop`; `amenity=bar|pub` → `bar`;
     `amenity=ice_cream` → `ice_cream`; `shop=bakery` → `bakery`; `shop=pastry` → `pastry`.
  Vague values (`regional`, `international`, `asian`, `african`, `fine_dining`, `brasserie`) are
  skipped, not matched. A value the catalog does not know yields no suggestion — OSM never creates
  a custom category.

### Opening hours (`openingHours.ts`)

- **Grammar:** rules separated by `;` (and by `,` when the next token starts a weekday selector);
  a rule is `[weekdays] (times | off | closed)` or `24/7`. Weekdays are `Mo`…`Su` singles, ranges
  (wrapping: `Su-Th`), and comma lists; `PH` is accepted in a selector and ignored. Times are
  `HH:MM-HH:MM` lists; an end at or before the start, or past `24:00`, runs into the next day. A
  later rule overrides an earlier one for the days it names (OSM semantics). A rule without
  weekdays applies to every day.
- **Anything else** (`week`, months, dates, `sunrise`, comments, `||` fallbacks) makes the whole
  value unparseable: `parse` returns `null` and the UI shows the raw text without a state.
- **State at an instant:** `open` (with the closing time), `opens-soon` (opens within 2 h, with the
  time), `closed-today` (no more opening today), `closed` (opens later today beyond 2 h, with the
  time). Computed in the device's time zone — the place's own zone is not in OSM's reply, and the
  user almost always browses places in their own zone.

### Zone and address (`placeDisplay.ts`)

- **Short zone (card, results):** Paris, Lyon or Marseille with a postcode `75xxx` / `69xxx` /
  `13xxx` whose last two digits are 01–20 → "Paris 11e", "Lyon 1er", "Marseille 7e" (ordinal
  through i18n: "1er"/"11e" in French, "1st"/"11th" in English). Otherwise `city`.
- **Detail zone (modal subtitle):** short zone, then ` · ` and `quarter` (for an arrondissement)
  or `suburb` (otherwise), when present and different from the city.
- **Compact address:** `osm.street` when present; else the current `address`. A place without
  `osm` shows exactly what it shows today.

## Flows

### Add a place

The retained order (`21-osm-ajout.html`, section 0):

1. **Input.** The primary button reads "Search". The category picker is not shown yet.
2. **Name typed → results.** Eateries first, as selectable cards: category avatar and label,
   short zone, compact street. Non-eateries fold under "N other results (shop, address)",
   collapsed. No eatery at all shows the existing "no matches" hint above the fold. Clicking a
   card selects it (orange ring, check); the button becomes "Add".
3. **Link pasted → preview.** `capturePaste` resolves the link (locally or through the server for
   a short link), checks for a duplicate, then calls `matchNear`. It returns
   `{ status: 'preview', place, osm?, suggestion? }`. The preview shows the name, zone, street,
   state, phone, site and "Found on OpenStreetMap · Not this one". "Not this one" drops `osm` and
   keeps the link's name and position. With no match, the preview reads "No OpenStreetMap data".
4. **Category.** The picker appears under the selection, pre-filled with the suggestion and a
   "Suggested by OpenStreetMap" hint. A manual change removes the hint and sticks: selecting
   another result no longer overwrites it.
5. **Add.** `commitCapture(place, cuisine)` creates the restaurant with `osm` when kept, and the
   address from `reverseGeocode` only when there is no `osm`.

Editing the input clears the selection and the preview and returns to step 1. A duplicate is
reported at step 2/3, before anything is written; it now also matches on the same `osm.type` +
`osm.id`. A short link that cannot be resolved while the server is down keeps today's
provisional path, through a minimal preview ("position resolved later") and the category step.
The pending resolver does **not** match against OSM when it later resolves the position: that
would be a silent match, which was rejected. The user completes it from the detail.

### Detail modal

- **Enriched** (`23-osm-fiche.html`, variant A): zone under the name; status, distance and added
  date on one line; compact street; category picker; opening hours folded to one line (state and
  next time) that unfolds to the week with today in bold; actions — Directions and Call filled,
  Site and Google Maps outlined, each shown only when it has a value; footer
  "OpenStreetMap · 19/09/2026 · Refresh · Correct" ("Correct" opens
  `https://www.openstreetmap.org/<type>/<id>`).
- **Not enriched, with coordinates, not dismissed:** "Complete from OpenStreetMap" under the
  category. It runs `matchNear`; a match shows as a confirm card ("Yes, complete" / "Not this
  one"), with "Your category is kept" when one is set. Confirming writes `osm`, and the category
  only when the place has none. "Not this one" records the dismissal. No match shows "Not found on
  OpenStreetMap".
- **Refresh:** `lookup`, then replace `osm` whole with a new `checkedAt`.

### List card

Line 2 is unchanged (category, visits, distance). Line 3 appears only for a place with `osm`: the
short zone, then the state when the hours parse — "● Open until 23:00" (green), "● Opens at
19:30" (orange, opens-soon), "● Closed today" (gray); "Closed · opens at 19:30" beyond two hours.
A place without `osm` keeps its two-line card. `useNow` ticks once a minute for the whole list.

## Errors

Every failure of a user-triggered action reaches the user.

| Case                                          | Behaviour                                                                                              |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Search fails (network, Nominatim)             | Existing "search failed" message.                                                                      |
| Link pasted, match request fails              | Preview reads "OpenStreetMap unavailable — complete it later from the place". Add stays possible.      |
| Complete or Refresh fails                     | Inline message in the block, "OpenStreetMap is not answering, try again later". Data unchanged.        |
| Refresh finds the object gone                 | Inline "This place is no longer on OpenStreetMap (maybe closed)". The old snapshot is kept.            |
| Write of `osm` rejected                       | Existing detail save error (`visitDetail.errorSave`).                                                  |
| Unparseable hours                             | Raw text, no state. Not an error.                                                                      |

## Testing

- `openingHours.test.ts`: table-driven over real Paris values from this session (wrapping ranges,
  past-midnight, overrides, `off`, `PH`, `24/7`, unparseable), and every state at chosen instants.
- `osmTags.test.ts`: the snapshot mapping (both `phone`/`contact:phone` spellings, city fallbacks),
  the category order, the vague-value skip, the eatery test.
- `placeDisplay.test.ts`: the zone rules in both languages, the compact-address fallback.
- `geocode.test.ts`: request URLs and parsing for search, matchNear (distance, name, eatery
  filters) and lookup (gone object), against a mocked `fetch`.
- `capture.test.ts`: preview instead of create, duplicate by OSM id, the provisional path, and
  `commitCapture` writing `osm` or the reverse-geocoded address.
- `schema.test.ts` / import tests: round-trip with `osm`; a malformed `osm` rejected.
- `mappers.test.ts`: `osm` passes through both ways.
- Components: `AddPlace` (Search → select → category → Add, manual category sticks, input edit
  resets, fold), `RestaurantDetail` (enriched, complete/confirm/dismiss, refresh errors), and
  `RestaurantList` (line 3 present/absent, state label with a fixed `now`).

## Documentation to update

- `docs/reference/data-model.md`: the `osm` field and its mapping, plus the migration.
- `docs/explanation/architecture.md`: OSM as a read-only external source for a snapshot.
- `CONCEPTS.md`: "OSM snapshot", "eatery", "short zone".
- `README.md`: the new add flow and what the detail shows.

## Out of scope

- A filter or sort by city/zone.
- Tags beyond the ones listed (diet, outdoor seating, wheelchair) — all under 40 % coverage.
- Background or bulk enrichment of existing places; Overpass; Google Places.
- Editing OSM values in the app.
