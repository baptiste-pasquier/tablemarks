---
title: Guard optional timestamp fields against PocketBase's field-retype data reset
date: 2026-08-30
category: database-issues
module: sync + data model
problem_type: database_issue
component: database
symptoms:
  - "PocketBase field-type migration (text -> date) silently resets every existing row's value for that field to an empty string, not just malformed rows"
  - "normalizeInstant('') throws RangeError: Invalid time value (from new Date('').toISOString())"
  - "Unconditional normalizeInstant(r.syncedAt)/normalizeInstant(v.syncedAt) in sync mappers would crash on the very first sync pull after the migration deploys, for every pre-existing row"
  - "No self-heal: attemptSync's backoff escalates the repeated crash into a permanent 'problem' sync status"
  - "A restaurant with added: '' (a valid, first-class \"no date\" state) could be exported but never re-imported after isOptionalTimestamp was tightened to reject anything but undefined or a valid ISO timestamp"
root_cause: missing_validation
resolution_type: code_fix
severity: critical
related_components:
  - sync-engine
  - database
tags: [pocketbase, migration, field-retype, normalize-instant, empty-string-guard, last-write-wins, date-fields, sync-mappers]
framework_version: pocketbase 0.39.3
---

# Guard optional timestamp fields against PocketBase's field-retype data reset

## Problem

Retyping `restaurants.added`, `restaurants.syncedAt`, and `visits.syncedAt` from PocketBase `text` to native `date` fields (`pocketbase/pb_migrations/1788048000_restaurant_visit_date_fields.js`) unavoidably resets every pre-existing row's value for those fields to empty, because PocketBase field ids are derived from `type+name` together and PocketBase rejects reusing an old field id under a new type. `src/sync/mappers.ts`'s `restaurantFromRemote`/`visitFromRemote` passed the resulting empty `syncedAt` string unconditionally into `normalizeInstant`, which throws on an empty string.

## Symptoms

- Once the migration deploys to a PocketBase instance holding pre-existing rows, every one of those rows' `added`/`syncedAt` values become `''`.
- The very next sync pull that ingests any such row throws `RangeError: Invalid time value` from inside `normalizeInstant` (`src/lib/dates.ts:35-37` — `return new Date(value).toISOString()`; confirmed directly: `new Date('').toISOString()` raises this `RangeError`).
- Because the sync engine's `attemptSync` retries with backoff and hits the identical throw on every retry, the failure does not self-heal: it escalates to a permanent `'problem'` sync status visible to the user.
- A deployment-verification reviewer confirmed against a copy of the real dev database that all 12 restaurants and all 12 visits currently have non-empty `syncedAt`, so this would have hit every single row on the first sync after deploy — a total, not partial, outage of sync.

The bug was caught in a multi-agent code review pass before merge (6 of 8 reviewer personas — correctness, testing, maintainability, data-migration, and adversarial reviewers — independently flagged it at P0/P1, confidence 100), so it never reached a deployed environment. It is documented here as the defect that was diagnosed and fixed on branch `refactor/date-time-uniformization`, PR #18, https://github.com/baptiste-pasquier/tablemarks/pull/18 — unmerged as of this writing.

## What Didn't Work

- An earlier draft of the migration plan assumed PocketBase derives a field's id from its name alone, and that a text→date retype would only blank out pre-existing values that were already malformed, leaving well-formed timestamps intact. This was not trusted on either side of a disagreement between two earlier reviewer drafts — instead it was verified empirically against a real local PocketBase 0.39.3 binary, run in disposable scratch directories (never the real dev DB). That test confirmed a field's id is `type+name` together (e.g. a `text` field named `syncedAt` gets an id like `text3418329323`; retyped to `date` it becomes `date3418329323`), and that PocketBase's collection-save validation explicitly rejects reusing the old id under the new type with `fields: (15: Field type cannot be changed..)`. `removeByName` followed by `add` under the new type is therefore the only available technique for a PocketBase field-type change, and it unconditionally resets every row's value for that field to empty — not just malformed ones.
- The initial implementation guarded `added` correctly from the start (`r.added ? normalizeInstant(r.added) : r.added` — because `added` was already known to sometimes be absent, for locally-created restaurants that had never synced), but the same guard was simply not applied to the sibling field `syncedAt`, under the assumption that once a row existed remotely its `syncedAt` would always be present. The migration's own documented reset behavior directly invalidated that assumption, but it was not cross-checked against `mappers.ts` until the dedicated code-review pass caught the mismatch.
- No test caught this before code review because every existing or newly-added test either passed `syncedAt: undefined` (which the ternary already handled correctly) or exercised `pickWinner` directly against a hand-built `SyncFields` object that bypassed `mappers.ts` entirely. The empty-string sub-case at the real mapper boundary — `restaurantFromRemote`/`visitFromRemote` receiving `syncedAt: ''` — had no coverage at all.
- **(session history)** A false assumption about PocketBase field/column behavior has bitten this project before in the same area: an earlier plan (the `added` field's own introduction, PR #17) justified a naming choice by claiming `created`/`updated` are PocketBase *reserved* system fields — doc review caught this as factually wrong (they're opt-in autodate fields PocketBase never auto-adds unless configured, and this project's own migration history never added them). The lesson repeats: don't assume PocketBase field/column semantics without checking this project's actual migrations or the running binary.

## Solution

Guard `syncedAt` the same way `added` was already guarded, in both mapper functions (`src/sync/mappers.ts`):

```ts
// BEFORE (the bug)
export function restaurantFromRemote(r: RemoteRestaurant): Restaurant {
  return {
    ...
    added: r.added ? normalizeInstant(r.added) : r.added,   // added was already guarded
    ...
    updated: normalizeInstant(r.syncedAt),                   // syncedAt was NOT guarded
    deleted: r.deleted,
  }
}
```

```ts
// AFTER (the fix) — src/sync/mappers.ts:75, 80, 105
export function restaurantFromRemote(r: RemoteRestaurant): Restaurant {
  return {
    ...
    added: r.added ? normalizeInstant(r.added) : r.added,
    ...
    updated: r.syncedAt ? normalizeInstant(r.syncedAt) : r.syncedAt,
    deleted: r.deleted,
  }
}

export function visitFromRemote(v: RemoteVisit): Visit {
  return {
    ...
    updated: v.syncedAt ? normalizeInstant(v.syncedAt) : v.syncedAt,
    deleted: v.deleted,
  }
}
```

An empty `updated` still compares correctly under the existing plain-string last-write-wins comparison in `pickWinner` (`src/sync/reconcile.ts:4-8`, `return remote.updated > local.updated ? remote : local`): an empty string sorts as "older than everything" in JS string comparison, which is the correct fallback semantics for a migration-reset row — it looks maximally stale and can never incorrectly win against a real local edit.

A second, smaller bug from the same overall change was fixed alongside it. `src/sync/portability/schema.ts`'s `isOptionalTimestamp` had been tightened to reject anything but `undefined` or a valid ISO timestamp:

```ts
// BEFORE
function isOptionalTimestamp(x: unknown): boolean {
  return x === undefined || isValidTimestamp(x)
}
```

But `mappers.ts`'s `restaurantFromRemote` deliberately passes `added: ''` through unchanged as a valid, first-class "no added date" state, and `RestaurantDetail.tsx` already treats `added === ''` as valid, tested behavior (rendering no "added on" line rather than crashing). A restaurant reaching that state via sync could be exported but could never be re-imported, since the tightened validator rejected `''`. Fixed at `src/sync/portability/schema.ts:71-79`:

```ts
// AFTER
/**
 * `added` is an ISO instant when present (imports may omit it), mirroring `updated`'s check.
 * `''` is also accepted as "absent" — `mappers.ts`'s sync-ingest path passes `added: ''` through
 * unchanged as a deliberate, first-class local state (see `RestaurantDetail.tsx`), so the
 * portability boundary must tolerate it too or round-tripping such a restaurant would fail.
 */
function isOptionalTimestamp(x: unknown): boolean {
  return x === undefined || x === '' || isValidTimestamp(x)
}
```

This also required correcting a pre-existing test in `src/sync/portability/import.test.ts` that had accidentally used `added: ''` as its "malformed/rejected" fixture (changed to `added: 'not-a-timestamp'`), plus a new companion test proving `added: ''` is now accepted and round-trips correctly.

## Why This Works

The root cause is a chain of three facts, each individually reasonable but never checked against each other until code review:

1. **PocketBase field internals**: a field's id is `type+name` together, not name alone (verified empirically: a `text` field becomes e.g. `text3418329323`, and retyping to `date` produces a different id, `date3418329323`). PocketBase's collection-save validation explicitly refuses to let a field keep its old id under a new type (`fields: (15: Field type cannot be changed..)`), so `removeByName` + `add` under the new type — as `pocketbase/pb_migrations/1788048000_restaurant_visit_date_fields.js:16-26` does for `restaurants.added`, `restaurants.syncedAt`, and `visits.syncedAt` — is the only available technique. That technique unconditionally resets every existing row's value for that field to empty: there is no in-place, data-preserving way to change a PocketBase field's type.
2. **The resulting empty string reaches an unguarded strict parser**: `normalizeInstant` (`src/lib/dates.ts:35-37`) does `new Date(value).toISOString()` with no validation, and in JavaScript `new Date('').toISOString()` throws `RangeError: Invalid time value`. `restaurantFromRemote`/`visitFromRemote`'s pre-fix code called `normalizeInstant(r.syncedAt)`/`normalizeInstant(v.syncedAt)` unconditionally, with no falsy guard, unlike the sibling `added` field which already had one.
3. **The gap between these two facts was invisible to the codebase's own logic and its tests**: `added`'s guard existed for an unrelated reason (local-only restaurants that had never synced), and no test exercised the real mapper boundary with an empty `syncedAt` — only `pickWinner` in isolation, downstream of the buggy code path.

Fixing the mapper guard closes the gap at the point where the migration's documented behavior (an empty string) meets the strict parser that can't tolerate it. The `isOptionalTimestamp` fix closes a related but separate gap: two independent boundaries for the same conceptual field (`added`) — sync-ingest in `mappers.ts` and import validation in `schema.ts` — had drifted out of agreement on what counts as a valid value for that field.

## Prevention

1. **When retyping a PocketBase field, assume full data loss for that field, not partial.** PocketBase field ids are `type+name`; there is no in-place, data-preserving way to change a field's type. Plan every downstream consumer of that field to tolerate an empty/absent value post-migration, and verify the claim empirically (in a disposable scratch PocketBase instance, never the real DB) rather than trusting assumptions about "only malformed values are lost."
2. **Any place a nullable/optional string field feeds a strict parser (`new Date(x).toISOString()`, `JSON.parse`, etc.), guard it explicitly for the empty-string case, not just `undefined`.** `''` is falsy but is a distinct, valid JS value that many "is this present" checks (`x ?? default`, `x !== undefined`) let through unguarded.
3. **When one field in a shape has an existing falsy-guard pattern (e.g. `added: r.added ? f(r.added) : r.added`) and a sibling field needs the same normalization, mirror the guard — don't assume the sibling's presence is guaranteed** just because it usually is in current data. A migration, a new data source, or a new client can silently invalidate that assumption.
4. **Test the real boundary function, not just the internal function it calls.** A regression test for this class of bug should call `restaurantFromRemote`/`visitFromRemote` directly with the exact malformed/edge-case input the real pipeline will produce (e.g. `{ ...restaurantToRemote(fixture, owner), syncedAt: '' }`), not a hand-built object further downstream that happens to skip the buggy code path:

   ```ts
   it('does not throw on a migration-reset empty restaurant syncedAt, passing it through unchanged', () => {
     const remote = { ...restaurantToRemote(restaurant, 'user1'), syncedAt: '' }
     expect(() => restaurantFromRemote(remote)).not.toThrow()
     expect(restaurantFromRemote(remote).updated).toBe('')
   })
   ```
5. **When two boundaries of the same field (sync-ingest and import/export) can each independently tighten or loosen validation, check they still agree on every accepted value** — a value one boundary produces and treats as valid must be accepted by every other boundary the same value can reach, or round-tripping breaks silently.
6. **(session history)** State the migration-before-client rollout order explicitly for every future PocketBase schema change: the migration must be applied and verified on the deployed remote instance *before* a client build starts relying on the new shape. A split rollout (old client + new schema, or new client + old schema) silently fails to persist or read the field correctly. This rule was already established for the `added` field's original introduction (PR #17) and applies just as much to a field-type retype.
7. **(session history)** Don't assume PocketBase field/column behavior — reserved names, autodate semantics, retype effects — without checking this project's actual migration history or the running binary. A false assumption in this same area (that `created`/`updated` are PocketBase-reserved) already shipped once and needed a review pass to catch.

## Related Issues

- [`docs/solutions/architecture-patterns/local-first-lww-sync-indexeddb-pocketbase.md`](../architecture-patterns/local-first-lww-sync-indexeddb-pocketbase.md) — documents the broader LWW sync pattern and the `updated`↔`syncedAt` field mapping this bug lives inside; its example code predates the `normalizeInstant()` guard added here and is now stale (flagged for a `ce-compound-refresh` pass).
- [`docs/solutions/architecture-patterns/import-as-reconcile-source-validate-then-commit.md`](../architecture-patterns/import-as-reconcile-source-validate-then-commit.md) — same category of validator-boundary-disagreement fix (`isOptionalTimestamp` widening) applied to the import/export path.
- PR #18, https://github.com/baptiste-pasquier/tablemarks/pull/18 — "Uniformize date/time handling: UTC instants vs. local calendar days" (unmerged as of this writing)
