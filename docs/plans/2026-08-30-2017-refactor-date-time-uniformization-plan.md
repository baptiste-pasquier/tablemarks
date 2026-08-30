---
title: Date/Time Uniformization - Plan
type: refactor
date: 2026-08-30
topic: date-time-uniformization
artifact_contract: ce-unified-plan/v1
artifact_readiness: requirements-only
product_contract_source: ce-brainstorm
execution: code
---

# Date/Time Uniformization - Plan

## Goal Capsule

- **Objective:** Every date/time value in the app is either a real UTC instant or a local calendar day, never ambiguously both, and comparing or displaying one against the other always goes through a documented, correct conversion — so a bug like KTD2's naive `T23:59:59.999Z` suffix (and its display-side twin) can't recur.
- **Means:** A shared client-side date utility module for instant ↔ local-day conversions and comparisons, plus a breaking PocketBase schema migration that types genuine instant fields (`added`, `syncedAt`) as PocketBase's native `date` field and keeps genuine local-calendar-day fields (`visit.date`, `latestVisitDate`) as plain `text` (`YYYY-MM-DD`).
- **Product authority:** This Product Contract is authoritative for the resulting date/time conventions and PocketBase schema shape. No open product blocker remains.
- **Execution profile:** Standard software refactor/infrastructure work, `execution: code`.
- **Open blockers:** None.

---

## Product Contract

### Summary

Establish one documented convention distinguishing real UTC instants from local-calendar-day values, backed by a shared date utility module and a breaking PocketBase schema migration that gives instant fields their own native type while calendar-day fields stay plain text. This replaces every naive mix of the two — including the reviewer-flagged map-centering comparison bug and a matching display bug — scoped to these foundations only; the in-flight `feat/map-load-centering` branch adopts the new comparison rule separately, later.

### Problem Frame

A PR review on the unmerged `feat/map-load-centering` branch (commit `f94a933`) flagged that its planned `pickMostRecentRestaurantCenter` comparison key treats `Restaurant.latestVisitDate` (a local-calendar-day string) as `<date>T23:59:59.999Z` before comparing it lexicographically against `Restaurant.added` (a real UTC instant). That's wrong for anyone west of UTC: a real UTC instant late in the evening can misjudge which candidate is actually more recent in the user's own local day.

The root cause isn't local to that one comparison. Nothing in the codebase names which date-ish fields are true instants and which are bare local calendar days, so each call site invents its own conversion. `RestaurantDetail.tsx` has the same class of bug on the display side: it shows a restaurant's `added` date by slicing the raw ISO instant string to its first 10 characters, which is the instant's *UTC* calendar day, not the viewer's local one. Underneath, every date-ish PocketBase column (`added`, `syncedAt` on both collections, `date`, `latestVisitDate`) is typed as plain `text`, so the schema itself carries no signal for which kind of value a field holds.

### Key Decisions

- **Two field natures, not one.** Real instants (`added`, `syncedAt`) and real local-calendar-days (`visit.date`, `latestVisitDate`) stay distinct kinds of value, rather than converting everything — including visit dates — into timestamps. (session-settled: user-directed — chosen over making every date a timestamp with an invented time-of-day: visits keep a date-only input, so a stored value would need a fabricated time with no product meaning.) Governs R1, R2, R4.
- **PocketBase reset, not a data migration.** The schema migration recreates the `restaurants`/`visits` collections rather than transforming existing rows in place. (session-settled: user-directed — chosen over writing a data-migration script: the local PocketBase instance holds only the developer's own personal dev data.) Governs R5.
- **Scoped to foundations; `feat/map-load-centering` adopts separately.** This plan builds the shared utility and the schema migration only; it does not touch `pickMostRecentRestaurantCenter` or anything else on that branch. (session-settled: user-directed — chosen over fixing that branch's comparison as part of this work: keeps this plan self-contained and lets the map branch pick up the new utility whenever it next merges.) Governs Scope Boundaries.
- **The display bug rides along.** `RestaurantDetail.tsx`'s UTC-slice-for-display bug shares the same root cause — an instant read as if it were already a local calendar day — and is fixed here rather than deferred as a separate ticket. Governs R3.
- **Portability validation gets tightened too.** `src/sync/portability/schema.ts` currently accepts any string for `date`/`latestVisitDate` and any parseable string for `added`/`syncedAt`/`updated`; validation is tightened to match the new conventions as part of this work. Governs R6.

### Requirements

**Shared date conventions**
- R1. A single shared client-side module provides the conversion/comparison primitives the app uses at any local-day ↔ instant boundary: the current local calendar day, the current UTC instant, a local calendar day's correct UTC instant range in the device's current timezone, and an instant's correct local calendar day for display.
- R2. Every existing call site that reads, formats, or compares a date/instant value by conflating the two — the UTC-slice display in `RestaurantDetail.tsx`, and any other site the implementation turns up — is rewritten to use R1's module instead of a hand-rolled conversion.

**Display correctness**
- R3. A restaurant's "added on" date, wherever shown to the user, reflects the viewer's local calendar day for that instant, not the instant's UTC calendar day.

**Comparison correctness**
- R4. Nothing in the app compares a local-calendar-day value against an instant value by assuming a fixed UTC end-of-day suffix; any such comparison first resolves the local day to its correct instant range in the device's current timezone, per R1.

**PocketBase schema**
- R5. The PocketBase schema for `restaurants.added`, `restaurants.syncedAt`, and `visits.syncedAt` uses PocketBase's native `date` field type; `visits.date` and `restaurants.latestVisitDate` stay `text` in the `YYYY-MM-DD` shape. The migration recreates the affected collections rather than transforming existing rows; the local PocketBase instance's current data is not preserved.
- R6. `src/sync/portability/schema.ts`'s import/export validation checks that `added`/`syncedAt`/`updated` values are real ISO instants and that `date`/`latestVisitDate` values match the `YYYY-MM-DD` shape, instead of accepting any parseable-or-plain string.

The schema change in R5:

| Field | Collection | Current type | New type |
|---|---|---|---|
| `added` | restaurants | `text` | `date` |
| `syncedAt` | restaurants | `text` | `date` |
| `syncedAt` | visits | `text` | `date` |
| `date` | visits | `text` | `text` (unchanged) |
| `latestVisitDate` | restaurants | `text` | `text` (unchanged) |

### Acceptance Examples

- AE1. **Covers R3.** Given a restaurant added at `2026-08-30T23:30:00Z` and a viewer in UTC-5 (local calendar day still 2026-08-30 at that instant), when the "added on" date renders, then it shows 2026-08-30, not 2026-08-31.
- AE2. **Covers R4.** Given restaurant X with `latestVisitDate` "2026-08-30" and restaurant Y with `added` "2026-08-30T23:00:00Z", when a device in UTC-5 ranks recency, then X (whose local day 2026-08-30 extends to `2026-08-31T05:00:00Z` in UTC) outranks Y — the opposite of what the naive UTC end-of-day suffix would produce.
- AE3. **Covers R5.** Given the PocketBase migration runs, when the `restaurants`/`visits` collections are inspected afterward, then `added` and `syncedAt` are `date`-typed fields, `date` and `latestVisitDate` remain `text`, and no pre-migration records remain.
- AE4. **Covers R6.** Given an exported JSON record with `date: "not-a-date"`, when import validation runs, then the record is rejected instead of silently accepted.

### Scope Boundaries

- Fixing `feat/map-load-centering`'s `pickMostRecentRestaurantCenter` to use the new comparison primitive — deferred to that branch, whenever it next merges.
- Adding time-of-day capture to visit logging — visits keep a date-only input; this plan only fixes how existing date-only and instant values are represented and compared.
- Migrating or preserving the local PocketBase instance's existing data — the reset in R5 discards it.

### Dependencies / Assumptions

- Because IndexedDB is the canonical local store and PocketBase is a sync mirror (`docs/solutions/architecture-patterns/local-first-lww-sync-indexeddb-pocketbase.md`), resetting the PocketBase collections doesn't touch any device's local data; the next sync re-pushes every local record as a fresh create against the recreated collections, via the existing upsert-falls-through-to-create-on-404 behavior.
- Field *names* (`added`, `syncedAt`, `date`, `latestVisitDate`) are unchanged; only the PocketBase field *type* changes for the three instant fields in R5.
- Existing tests asserting exact string shapes for these fields (`src/data/restaurants.test.ts`, `src/features/visits/RestaurantDetail.test.tsx`, `src/sync/portability/export.test.ts`) will need updates to match; not enumerated individually since they follow mechanically from R1-R6.

### Outstanding Questions

- **Deferred to Planning:** whether PocketBase's `date` field type accepts client-supplied values the same way the current `text` field does — needed to confirm `syncedAt` keeps working as a client-controlled LWW timestamp (per the existing constraint in `docs/solutions/architecture-patterns/local-first-lww-sync-indexeddb-pocketbase.md`) once it moves off `text`. Unverified against this repo; confirm against the PocketBase 0.39 JS migration API before implementing R5.

### Sources / Research

- `src/data/visits.ts:18-25` — `today()`: local calendar day, explicitly not the UTC slice of `now()`.
- `src/data/ids.ts:15-17` — `now()`: `new Date().toISOString()`, a real UTC instant.
- `src/types/models.ts:38-51,63-82` — `SyncFields.updated`, `Restaurant.added`, `Restaurant.latestVisitDate`, `Visit.date`.
- `src/data/rollup.ts:11-23` — `latestVisitDate` comparison is safe today (both sides `YYYY-MM-DD`); the bug is specifically the added-vs-visited comparison, not this one.
- `src/features/visits/RestaurantDetail.tsx:153` — the display-side UTC-slice bug: `restaurant.added.slice(0, 10)`.
- `src/sync/portability/schema.ts:60-63,86-88,115-116` — `isValidTimestamp`, and the un-shape-checked `date`/`latestVisitDate` validation.
- `pocketbase/pb_migrations/1718200000_init_collections.js` and `pocketbase/pb_migrations/1735689600_add_restaurant_added_field.js` — every date-ish PocketBase field currently typed `text`.
- `docs/solutions/architecture-patterns/local-first-lww-sync-indexeddb-pocketbase.md` — why `syncedAt` is a custom field distinct from PocketBase's reserved `updated` autodate column; the constraint the Outstanding Question above needs to reconfirm once `syncedAt`'s type changes.
- `docs/plans/2026-08-30-1932-feat-map-load-centering-plan.md` (KTD2, branch `feat/map-load-centering`, commit `f94a933`) — the review comment that triggered this plan.
- PocketBase binary in this repo: `pocketbase/pocketbase --version` → `0.39.3`.
