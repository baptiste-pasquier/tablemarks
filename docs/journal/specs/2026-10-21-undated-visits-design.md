---
title: Undated Visits - Design
type: design
date: 2026-10-21
topic: undated-visits
status: approved
---

# Undated Visits - Design

## Goal

Let the user record a visit to a place they have been to without remembering when, so the place
counts as _visited_ with a verdict, without inventing a date.

## Decisions

| Question | Answer |
|---|---|
| What can be entered when the date is forgotten? | **No date at all** — no approximate year or month |
| Where is it entered? | **In the place's detail only**, in "Add a past visit". The capture flow is unchanged (the detail already opens right after a place is added) |
| How does an undated visit order against dated ones? | **Older than every dated visit** |
| How is "unknown" represented? | **`Visit.date: string \| null`**, `null` meaning unknown |

Rejected representations: an empty-string sentinel keeps `date: string`, so the compiler flags
no consumer and `formatDisplayDate('')` renders `NaN/NaN/NaN`; a fake date plus a `dateUnknown`
flag stores a fabricated value.

Out of scope: editing the date of an existing visit (the app has no visit editing today — a visit
is deleted and re-created), approximate dates, and a "visited" shortcut in the capture flow.

## 1. Model and sync

**Type** (`src/types/models.ts`). `Visit.date` becomes `string | null`: a local day
(`YYYY-MM-DD`) or `null` for unknown. `VisitInput.date` in `src/data/visits.ts` keeps its
`today()` default when omitted (`undefined`); only an explicit `null` records an undated visit, so
"I went today" keeps dating itself. `VisitPatch` follows the type.

**IndexedDB.** No version bump: no index covers `date`, and every stored visit already has one.

**PocketBase.** A new timestamped migration in `pocketbase/pb_migrations/` sets `visits.date` to
`required: false`. The field stays `text` and is modified in place, not removed and re-added, so
existing rows keep their value (see the note in `1788048000_restaurant_visit_date_fields.js` on
why a remove/add is not data-preserving). The down migration restores `required: true`.

**Mappers** (`src/sync/mappers.ts`). PocketBase stores an empty text, not `null`:
`visitToRemote` sends `null` as `''`; `visitFromRemote` reads `''` or an absent value as `null`.

**Export and import** (`src/sync/portability/schema.ts`). `EXPORT_SCHEMA_VERSION` goes to **2**.
`asVisit` accepts `date` as a local day or `null`; any other value (`''`, `'2023'`, an instant)
is still `malformed_visit`. A v1 file is valid v2 as is (every v1 visit is dated), so
`migrateToCurrent` stays the identity. An app still on v1 refuses a v2 file whole with
`schema_too_new` rather than `malformed_visit`.

**Devices not yet updated** receive `date: ''` from PocketBase and render an invalid date until
the PWA updates on next load. Accepted, not handled: single-user app, transient.

## 2. Rollup, order and sort

**One shared comparator**, `compareVisitsMostRecentFirst` in `src/data/rollup.ts`: dated visits
first, newest date first; then undated visits, most recently recorded first (by `updated`). Both
the rollup and the history order use it, so the badge and the timeline never disagree.

**`rollupOf`** takes the first live visit under that comparator:

- `latestVerdict` is the latest dated visit's verdict, or, with no dated visit, the most recently
  recorded undated one's;
- `latestVisitDate` is that visit's date, or `null` when it has none;
- `visitCount` counts every live visit, dated or not, so `statusOf` returns _visited_.

**`visitsForRestaurant`** sorts with the same comparator: undated visits sit at the bottom of the
timeline.

**Date sort** (`src/features/facets/sort.ts`): no code change. `dateKey` already returns
`-Infinity` for a visited place with no `latestVisitDate`, which puts an undated-only place last
under newest-first and first under oldest-first — "older than everything". A test pins it.

**Map** (`src/features/map/markers.ts`): no change. Overlap ranking already falls back to `added`
when `latestVisitDate` is absent.

## 3. Interface (`src/features/visits/VisitHistory.tsx`)

**Entry.** In "Add a past visit", a `ToggleChip` (`pill`) labelled "I don't remember when" sits
under the date input.

- On, the date input is cleared and disabled. Off, it behaves as today.
- The verdict buttons are enabled when a date is picked **or** the chip is on.
- A verdict calls `createVisit({ restaurantId, date: dateUnknown ? null : pastDate, verdict })`.
- On success the form resets (date empty, chip off). On failure the entry is kept and the
  existing inline `errorSave` alert shows.

**Display.** An undated visit's row shows "Date unknown" where the date goes; its ✕ button takes
the dedicated accessible label `deleteUndatedVisitAria` instead of interpolating a date.

**i18n.** Three new `visitDetail` keys, in `en` and `fr`:

| Key | en | fr |
|---|---|---|
| `dateUnknownToggle` | I don't remember when | Je ne sais plus quand |
| `dateUnknown` | Date unknown | Date inconnue |
| `deleteUndatedVisitAria` | Delete undated visit | Supprimer la visite sans date |

## 4. Testing

Unit and component tests, written first:

- `src/data/rollup.test.ts`: a dated and an undated visit → the dated verdict wins; undated only →
  the most recently recorded verdict, `latestVisitDate: null`, the full count; the comparator
  puts undated last.
- `src/data/visits.test.ts`: `createVisit({ date: null })` stores `null`; an omitted date still
  defaults to today; `visitsForRestaurant` lists undated visits last.
- `src/sync/mappers.test.ts`: `null` ↔ `''` both ways; an absent remote `date` reads as `null`.
- `src/sync/portability/import.test.ts`: a v2 file with `date: null` is accepted; a v1 file still
  is; `''` and `'2023'` are still refused; export → import round-trips `null`.
- `src/features/facets/sort.test.ts`: an undated-only visited place sorts last under newest-first
  and first under oldest-first.
- `src/features/visits/RestaurantDetail.test.tsx`: turning the chip on enables the verdicts and
  records an undated visit; its row reads "Date unknown"; the place shows as visited.

No new Playwright journey: the component test covers the flow end to end in the DOM.

## 5. Documentation

| File | Change |
|---|---|
| `docs/reference/data-model.md` | `date` is `YYYY-MM-DD` or `null`; the ordering rule; the `''` ↔ `null` mapping |
| `docs/explanation/architecture.md` | The rollup rule, if it states one |
| `pocketbase/README.md` | `visits.date` is optional |
| `CONCEPTS.md` | "Undated visit" |
| `README.md` | One line on the feature |
