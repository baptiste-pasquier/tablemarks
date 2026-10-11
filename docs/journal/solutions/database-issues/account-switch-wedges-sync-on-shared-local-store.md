---
title: Signing in as a second account on the same device wedges its sync and leaks local records
date: 2026-10-11
category: database-issues
module: src/sync / src/auth
problem_type: bug
component: sync
severity: high
related_components:
  - sync
  - auth
  - pocketbase
applies_when:
  - Changing what sign-in, sign-out or the first `fullSync` does with the local store
  - Reasoning about two accounts used on one browser profile
  - Reviewing whether the local store needs to know which account it last synced with
tags:
  - pocketbase
  - sync
  - accounts
  - ownership
  - local-first
---

# Signing in as a second account on the same device wedges its sync and leaks local records

Measured against PocketBase **0.39.3**, the version `docker/Dockerfile.pocketbase` pins, on a
throwaway instance migrated from `pocketbase/pb_migrations/` plus a test-only seed of two
password users. The real `fullSync` and `PocketBaseRemote` ran against it under Vitest with
`fake-indexeddb`.

## Context

There is one IndexedDB store, `tablemarks`, and no record of which account it was last synced
with. `owner` is only stamped at push time (`restaurantToRemote`, `src/sync/mappers.ts`).
`AuthService.signOut` stops the controller and keeps local data; the next sign-in, for any
account, runs `fullSync` over the whole store.

## What was measured

Scenario: user A signs in, adds two places and a visit, syncs, signs out. Someone adds one
place while signed out. User B signs in on the same device.

| Observation | Result |
|---|---|
| Places visible while signed out | A's two places |
| `update` of an A-owned id, authenticated as B | `404` (rule failure, see [the owner-rule entry](pocketbase-update-rules-do-not-see-the-request-body.md)) |
| The fallback `create` with the same id | `400 {"id":{"code":"validation_not_unique"}}` |
| B's `fullSync` | throws that `400` |
| Every retry of B's `fullSync` | throws the same `400` |
| A's account afterwards | unchanged |
| B's account afterwards | only the local-only places whose id sorts **before** the first A-owned id |
| Visits pushed for B | none — the restaurant phase throws first |

The partial leak follows from two facts: `allRestaurantsForSync` returns records in primary-key
order, and `newId()` is random. `fullSync` pushes `toPush` in that order and stops at the first
failure, so which local-only places reach B's account is a function of their random ids. A
place created with id `00…` was pushed into B's account before the abort; one with `zz…` was not.

Not measured, read from the code: `fullSync` writes remote winners locally (`src/sync/syncEngine.ts`,
the `toWriteLocal` loop) before it pushes, so B's own places are pulled into the shared store
before the failure, and the local view shows A's and B's places together.

The `400` is a server answer, so `classifyFailure` does not treat it as offline: the controller
backs off and retries forever, and after `ESCALATION_THRESHOLD` failures the status reads
`problem`. Nothing B writes on that device reaches the account again.

A second scenario — A deletes a place while signed out, then signs back in as A — pushes the
tombstone to A's account. That is the durable-outbox behaviour working as designed; it is only
harmful when the person editing signed out is not the account owner.

## Why it matters

The architecture describes the sign-in merge as a **one-time** union reconcile
(`docs/explanation/architecture.md`, "Local-first and accounts"). The code runs it on every
sign-in, for any account. The difference is invisible with one account per device and breaks
both accounts' expectations with two.

## The rule

**A record already synced to one account can never be pushed to another under the same id.**
The owner-pinning update rule answers `404` and the id is taken, so the `create` fallback
answers `400`. Any sign-in path that runs the union reconcile over a store holding another
account's synced records wedges; telling the two cases apart needs the store to know which
account it last synced with, which it does not today.
