---
title: An old client's empty visit date survives last-write-wins and makes every export un-importable
date: 2026-10-21
category: database-issues
module: src/data + src/sync/portability
problem_type: data_issue
component: database
severity: high
related_components:
  - sync
  - portability
applies_when:
  - Changing how a synced field encodes "no value" between client versions
  - Relaxing a PocketBase field that older clients still read
  - Tightening an import validator for a value older clients may have stored locally
tags:
  - indexeddb
  - upgrade
  - last-write-wins
  - export
  - undated-visits
  - pwa-update-prompt
---

# An old client's empty visit date survives last-write-wins and makes every export un-importable

Undated visits made `Visit.date` nullable, and PocketBase stores the missing date as `''`. A client
still on the previous build reads that row with the previous `visitFromRemote`, which copies `''`
into IndexedDB. Once that device updates, nothing ever rewrites it, and the next backup it exports
is refused whole on import. The fix repairs the encoding once, locally, in the IndexedDB v3
upgrade, and teaches the v1 export reader the same mapping.

Found in the final review of the undated-visits branch, before merge; no user data was affected.

## How the `''` gets in, and why it stays

1. The PWA registers with `registerType: 'prompt'` (`vite.config.ts`), so a device keeps running
   and syncing the old build until its user accepts the update.
2. Another device records an undated visit. PocketBase stores `date: ''`.
3. The old build pulls it. Its `visitFromRemote` maps `date` verbatim, so IndexedDB now holds
   `date: ''`.
4. The device updates. The new mapper reads `''` as `null`, but `reconcile`
   (`src/sync/reconcile.ts`) treats equal `updated` as a no-op, and the remote row's `updated`
   is the one already stored. The local `''` is never replaced.

## What it breaks

- `compareVisitsMostRecentFirst` sorts `''` as a dated visit older than every real date but ahead
  of every `null`, so the rollup can carry `latestVisitDate: ''` and a verdict from the wrong
  visit.
- An export writes `date: ''` and `latestVisitDate: ''`. The v2 import validator accepts only a
  `YYYY-MM-DD` day or `null`, so `asVisit` / `asRestaurant` reject the record and the whole file
  is refused (`malformed_visit` / `malformed_restaurant`). The user finds out when restoring a
  backup.
- A v1 backup written by the old build after it pulled an undated visit has the same `''`.

## Fix

**IndexedDB v3** (`src/data/db.ts`, `repairEmptyVisitDates`). The upgrade from v1 or v2 walks
`visits` through the upgrade transaction, rewrites every `date: ''` as `null`, and recomputes the
rollup of each restaurant it touched with the pure `rollupOf` over that restaurant's visits (the
`by-restaurant` index). No `updated` bump and no store event: it is a repair of an encoding, not
a user edit, and the remote row's `''` already reads back as `null`. A fresh database skips it.

Two constraints shaped it:

- The repair must run inside `upgrade`. Calling `getDB()` or `recomputeRollup` there would wait on
  the open that is still in progress.
- `rollupOf` and `compareVisitsMostRecentFirst` moved to `src/data/visitOrder.ts`, a module with no
  IndexedDB import, because `db.ts` importing `rollup.ts` would close a cycle
  (`rollup.ts` → `db.ts`).

**Export v1 → v2** (`src/sync/portability/schema.ts`, `migrateToCurrent`). A v1 file's visit
`date: ''` and restaurant `latestVisitDate: ''` become `null`. A v2 file still refuses `''`: no
v2 writer produces it.

Tests: `src/data/db.test.ts` seeds a real v2 database holding `date: ''` and a stale rollup, opens
it through `getDB()`, and checks the repaired date, the untouched `updated`, the recomputed rollup,
and that an unaffected restaurant is left alone. `src/sync/portability/import.test.ts` imports a
v1 file with both `''` fields.

## Rule

When a client release changes how a synced field encodes "no value", assume older clients have
already written the old encoding into local stores, and that last-write-wins will never correct
it, because the record's `updated` did not change. Repair it with a local, version-gated
migration rather than by widening every reader, and give the import path the same mapping for
files those clients exported.
