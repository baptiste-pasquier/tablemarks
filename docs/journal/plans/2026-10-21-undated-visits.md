---
title: Undated Visits - Plan
type: feat
date: 2026-10-21
topic: undated-visits
status: ready
---

# Undated Visits Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Record a visit without a date, so a place the user went to "some time" counts as
_visited_ with a verdict, without a fabricated date.

**Architecture:** `Visit.date` becomes `string | null`. One comparator in `src/data/rollup.ts`
(dated newest-first, then undated) drives both the rollup and the history order. The sync boundary
maps `null` ↔ `''` for PocketBase and accepts `null` in a v2 export file. `VisitHistory` gains a
"I don't remember when" `ToggleChip`.

**Tech Stack:** React 19, TypeScript, IndexedDB (`idb`), PocketBase JS migrations, i18next,
Vitest + Testing Library.

**Spec:** `docs/journal/specs/2026-10-21-undated-visits-design.md`

## Global Constraints

- Run every `npm`/`npx` command with Node 24: prefix with `PATH=/opt/homebrew/opt/node@24/bin:$PATH`
  (Node 26 breaks the jsdom tests).
- `null` is the only representation of an unknown date locally, in export files and in the type;
  `''` exists only in a PocketBase row.
- An omitted `VisitInput.date` still defaults to `today()`; only an explicit `null` is undated.
- Undated visits order after every dated visit. Within a group, and between two visits on the same
  day, the larger `updated` comes first.
- `EXPORT_SCHEMA_VERSION = 2`; v1 files import unchanged.
- No user-facing string literal in a component; `en` and `fr` get the same keys. Copy, verbatim:
  `dateUnknownToggle` "I don't remember when" / "Je ne sais plus quand"; `dateUnknown` "Date
  unknown" / "Date inconnue"; `deleteUndatedVisitAria` "Delete undated visit" / "Supprimer la
  visite sans date".
- `npm run type-check` is expected to fail in `src/sync/mappers.ts` and
  `src/features/visits/VisitHistory.tsx` after Task 1, and must be clean from Task 3 on.

## Review Focus

- **An undated visit and a dated one on the same place**: the header badge must show the dated
  verdict even when the undated visit was recorded later (Task 1, pinned in `rollup.test.ts`).
- **Deleting the only dated visit**: the place falls back to the undated visit's verdict and stays
  _visited_ (Task 1, `recomputeRollup` test).
- **Toggling the chip off after typing a date**: the date input is empty again and the verdicts
  are disabled until a date is picked — no silent undated save (Task 3).
- **A PocketBase row with an empty `date`**: reads back as `null`, never `''`, so the display
  never formats an empty string (Task 2, mappers test).
- **An import file carrying `date: ''`**: refused as `malformed_visit`; `''` is a remote-only
  encoding, not a valid file value (Task 2).

---

### Task 1: Model, comparator and rollup

**Files:**

- Modify: `src/types/models.ts` (`Visit.date`)
- Modify: `src/data/rollup.ts`
- Modify: `src/data/visits.ts` (`VisitInput.date`, `visitsForRestaurant`)
- Test: `src/data/rollup.test.ts`, `src/data/visits.test.ts`

**Interfaces:**

- Produces: `Visit.date: string | null`; `VisitInput.date?: string | null`;
  `export function compareVisitsMostRecentFirst(a: Visit, b: Visit): number` in
  `src/data/rollup.ts` (negative when `a` is more recent).

- [ ] **Step 1: Write the failing tests**

In `rollup.test.ts`, widen the helper to `visit(date: string | null, verdict, deleted = false, updated = date ?? '2026-01-01T00:00:00.000Z')` and add, under `rollupOf (pure)`:

```ts
it('lets a dated visit win over an undated one recorded later', () => {
  const r = rollupOf([
    visit('2024-03-01', 'go_back', false, '2024-03-01T00:00:00.000Z'),
    visit(null, 'never_again', false, '2026-10-01T00:00:00.000Z'),
  ])
  expect(r).toEqual({ latestVerdict: 'go_back', latestVisitDate: '2024-03-01', visitCount: 2 })
})

it('takes the most recently recorded undated visit when none is dated', () => {
  const r = rollupOf([
    visit(null, 'go_back', false, '2026-01-01T00:00:00.000Z'),
    visit(null, 'worth_a_detour', false, '2026-02-01T00:00:00.000Z'),
  ])
  expect(r).toEqual({ latestVerdict: 'worth_a_detour', latestVisitDate: null, visitCount: 2 })
})
```

Ids must stay unique: give the helper an `id` of `` `${date}-${updated}` ``.

Under `recomputeRollup (persisted)`:
`it('falls back to the undated verdict once the only dated visit is deleted')` — create a
restaurant, `createVisit({ date: null, verdict: 'once_was_enough' })`, a dated `go_back` visit,
`removeVisit` the dated one; expect the restaurant's `latestVerdict` `'once_was_enough'`,
`latestVisitDate` `null`, `visitCount` `1`.

In `visits.test.ts`:

- `it('stores an explicit null date as an undated visit')` — `createVisit({ restaurantId, date: null, verdict: 'go_back' })` returns `date: null`, and `getRestaurant` shows `visitCount: 1`, `latestVisitDate: null`.
- `it('lists undated visits after every dated one')` — create undated, then `2025-01-01`, then
  `2026-01-01`; `visitsForRestaurant` dates equal `['2026-01-01', '2025-01-01', null]`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/data/rollup.test.ts src/data/visits.test.ts`
Expected: the new tests FAIL (rollup picks the undated visit or compares `null`; date comes back
as today's day).

- [ ] **Step 3: Implement**

- `models.ts`: `date: string | null`, doc comment "Local day (YYYY-MM-DD), or null when the
  user does not remember it."
- `rollup.ts`: add `compareVisitsMostRecentFirst` — dated before undated; two dated by `date`
  descending; any remaining tie by `updated` descending. `rollupOf` takes the first live visit of
  `[...live].sort(compareVisitsMostRecentFirst)`. Update its doc comment.
- `visits.ts`: `VisitInput.date?: string | null` (comment: "omitted defaults to today; null is
  an undated visit"); `createVisit` uses `input.date === undefined ? today() : input.date`;
  `visitsForRestaurant` sorts with `compareVisitsMostRecentFirst`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/data/`
Expected: PASS, including the existing rollup and visit tests.

- [ ] **Step 5: Commit**

```bash
git add src/types/models.ts src/data/rollup.ts src/data/visits.ts src/data/rollup.test.ts src/data/visits.test.ts
git commit -m "feat(visits): allow a visit without a date, ordered after dated ones"
```

### Task 2: Sync boundary — PocketBase, mappers, export v2

**Files:**

- Create: `pocketbase/pb_migrations/1792540800_visit_date_optional.js`
- Modify: `src/sync/mappers.ts` (`visitToRemote`, `visitFromRemote`, `RemoteVisit.date`)
- Modify: `src/sync/portability/schema.ts` (`EXPORT_SCHEMA_VERSION`, `asVisit`,
  `migrateToCurrent` doc)
- Test: `src/sync/mappers.test.ts`, `src/sync/portability/import.test.ts`,
  `src/sync/portability/export.test.ts`

**Interfaces:**

- Consumes: `Visit.date: string | null` (Task 1).
- Produces: `RemoteVisit.date?: string` (PocketBase sends `''` for an empty text field);
  `EXPORT_SCHEMA_VERSION = 2`.

- [ ] **Step 1: Write the failing tests**

`mappers.test.ts`:

- `it('sends an undated visit as an empty date')` — `visitToRemote({ ...visit, date: null }, 'user1').date` is `''`.
- `it('reads an empty or absent remote date as null')` — `visitFromRemote` of
  `{ ...visitToRemote(visit, 'u'), date: '' }` and of the same object with `date` deleted both
  give `date: null`; a `'2026-02-01'` round-trips unchanged.

`import.test.ts`:

- `it('accepts an undated visit')` — `envelope()` with the visit's `date: null` → `ok: true`,
  `records.visits[0].date` is `null`.
- `it('still imports a v1 file')` — `envelope({ schemaVersion: 1 })` → `ok: true`.
- `it('rejects an empty or partial visit date')` — `date: ''` and `date: '2023'` each give
  `{ ok: false, error: { code: 'malformed_visit' } }`.

`export.test.ts`: `it('round-trips an undated visit through export and import')` — create a
restaurant and `createVisit({ date: null, ... })`, export, `parseImport` the JSON; the visit's
`date` is `null`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/sync/mappers.test.ts src/sync/portability/`
Expected: the new tests FAIL (`null` sent as-is, `''` read as `''`, `null` refused on import).

- [ ] **Step 3: Implement**

- Migration, up: `const visits = app.findCollectionByNameOrId('visits')`,
  `visits.fields.getByName('date').required = false`, `app.save(visits)`; down sets it back to
  `true`. Head comment: why it is changed in place (a remove/add resets every row — see
  `1788048000_restaurant_visit_date_fields.js`) and that `''` is the stored form of "unknown".
- `mappers.ts`: `date: v.date ?? ''` on push; `date: v.date ? v.date : null` on pull.
- `schema.ts`: `EXPORT_SCHEMA_VERSION = 2` with a comment "v2: a visit's `date` may be `null`";
  `asVisit` accepts `v.date === null || isLocalDayString(v.date)`; `migrateToCurrent`'s doc says v1
  is valid v2 as is. Update the `isLocalDayString` call-site comment.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/sync/`
Expected: PASS, including `PortabilityPanel`'s v1 fixture via `npx vitest run src/features/portability/`.

- [ ] **Step 5: Commit**

```bash
git add pocketbase/pb_migrations/1792540800_visit_date_optional.js src/sync/
git commit -m "feat(sync): carry undated visits through PocketBase and export v2"
```

### Task 3: "I don't remember when" in the visit history

**Files:**

- Modify: `src/features/visits/VisitHistory.tsx`
- Modify: `src/i18n/locales/en/translation.json`, `src/i18n/locales/fr/translation.json`
  (`visitDetail`)
- Test: `src/features/visits/RestaurantDetail.test.tsx`, `src/features/facets/sort.test.ts`

**Interfaces:**

- Consumes: `createVisit({ restaurantId, date: string | null, verdict })` (Task 1); `ToggleChip`
  from `src/features/ui/ToggleChip.tsx` (`shape="pill"`, `active`, `onClick`).

- [ ] **Step 1: Write the failing tests**

`RestaurantDetail.test.tsx`, beside the past-visit tests:

- `it('adds an undated past visit and marks the place visited')` — open "Add a past visit",
  click the button named "I don't remember when", expect it `aria-pressed="true"` and the
  "Visit date" input disabled, click the enabled "Go back"; then `findByText('Date unknown')`,
  `getByText('(1)')`, and the delete button named "Delete undated visit" exists.
- `it('requires a date again once "I don\'t remember when" is turned off')` — type
  `2026-01-15`, press the chip on then off; the "Visit date" input is enabled and empty and every
  "Go back" button in the past-visit section is disabled.
- `it('keeps "I don\'t remember when" on when the undated visit could not be saved')` —
  `vi.mocked(createVisit).mockRejectedValueOnce(...)`, chip on, pick a verdict; the alert reads
  "Could not save this change." and the chip is still `aria-pressed="true"`.

`sort.test.ts`: `it('puts a visited place with no visit date last newest-first, first oldest-first')` — `r({ id: 'undated', visitCount: 1, latestVerdict: 'go_back' })` beside
`r({ id: 'dated', visitCount: 1, latestVisitDate: '2025-01-01' })` and a to-try
`r({ id: 'new', added: '2026-01-01T00:00:00.000Z' })`;
`sortRestaurants(items, 'date', 'newest', undefined)` gives `['new', 'dated', 'undated']`, and
`'oldest'` gives `['undated', 'dated', 'new']`. The existing "no usable date" test covers a
never-visited place without `added`; this one covers a _visited_ place without a visit date.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/features/visits/RestaurantDetail.test.tsx src/features/facets/sort.test.ts`
Expected: the three component tests FAIL (no "I don't remember when" button); the sort test
PASSES already — it pins existing behaviour, as the spec says.

- [ ] **Step 3: Implement**

- i18n: the three keys from Global Constraints under `visitDetail`, both locales.
- `VisitHistory.tsx`: a `dateUnknown` boolean state. The `ToggleChip` sits under the date input;
  toggling it clears `pastDate`. The date input is `disabled={dateUnknown}`. `VerdictButtons` is
  disabled when `!pastDate && !dateUnknown`. `logPast` returns early on the same condition, calls
  `createVisit({ restaurantId, date: dateUnknown ? null : pastDate, verdict })`, and on success
  resets both states. A row shows `v.date ? formatDisplayDate(v.date) : t('visitDetail.dateUnknown')`;
  its ✕ label is `deleteVisitAria` with the formatted date, or `deleteUndatedVisitAria` when
  `v.date` is `null`. Update the component's doc comment.

- [ ] **Step 4: Run the tests and the type check**

Run: `npx vitest run src/features/ && npm run type-check`
Expected: PASS, and `tsc` reports no error.

- [ ] **Step 5: Commit**

```bash
git add src/features/visits/VisitHistory.tsx src/features/visits/RestaurantDetail.test.tsx src/features/facets/sort.test.ts src/i18n/locales/
git commit -m "feat(visits): log a past visit without remembering its date"
```

### Task 4: Documentation and full verification

**Files:**

- Modify: `docs/reference/data-model.md` (Visit `date`; the ordering rule; the `''` ↔ `null`
  mapping row)
- Modify: `docs/explanation/architecture.md:87` (the rollup bullet: latest = latest dated, else
  most recently recorded undated)
- Modify: `pocketbase/README.md:48` (`date` optional, `''` when unknown)
- Modify: `CONCEPTS.md` (the Visit entry: its date may be unknown; add an "Undated visit" entry)
- Modify: `README.md` (one line in the feature list)

- [ ] **Step 1: Update the five files**

Keep each edit to the sentences the change makes false, plus the new facts; say in the commit body
what was removed, or that nothing needed removing (docs convention).

- [ ] **Step 2: Run the full gate**

Run: `npm test && npx eslint . && npx prettier . --check && npm run type-check && npm run check:docs`
Expected: all pass; `check:docs` may keep its existing `deployment.md` size warning.

- [ ] **Step 3: Commit**

```bash
git add docs/ pocketbase/README.md CONCEPTS.md README.md
git commit -m "docs: describe undated visits"
```
