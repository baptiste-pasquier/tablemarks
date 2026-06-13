---
title: One IndexedDB transaction for a local write batch — but never span a network await
date: 2026-06-13
category: conventions
module: data store / sync
problem_type: convention
component: database
severity: medium
related_components:
  - sync-engine
  - portability
applies_when:
  - A store operation performs several IndexedDB writes that should commit all-or-nothing (import, restore, bulk apply)
  - Deciding whether a sync/merge routine can be wrapped in a single transaction
  - Per-write data-layer helpers each open their own transaction and emit a change event
tags:
  - indexeddb
  - idb
  - transactions
  - atomicity
  - local-first
  - import
  - sync
---

# One IndexedDB transaction for a local write batch — but never span a network await

## Context

`applyImport` merges an imported backup into the store by writing many records (winning restaurants and visits). The first cut looped the per-record data-layer helpers (`putRestaurantRaw` / `putVisitRaw`), each of which opens **its own** IndexedDB transaction and fires a store-change event. Two problems followed: a failure partway through (quota, disk) left the store **partially merged** with no rollback, and an N-record import fired N change events, each re-reading the whole store. Review flagged the atomicity gap as high priority.

The obvious fix — "wrap it all in one transaction" — has a sharp constraint that decides *which* operations can actually do it.

## Guidance

**Wrap a batch of local writes that must be consistent in a single `readwrite` transaction.** Open one transaction over every store the batch touches, write all records through its object stores, and `await tx.done`. A mid-batch failure aborts the whole transaction — the store rolls back instead of half-merging. Writing through the transaction's object stores also bypasses the per-write helpers' change events, so you emit **one** change after commit instead of N.

**But an IndexedDB transaction cannot span an `await` on a non-IDB promise.** A transaction auto-commits (closes) the moment it goes *idle* — i.e. the microtask queue drains with no pending IDB request. Awaiting another IDB request inside the transaction keeps it alive; awaiting a `fetch`, a timer, or any non-IDB promise lets it close, and the next `objectStore` call throws `TransactionInactiveError`. So:

- **Purely-local batch (import, restore, local merge):** can and should be one transaction — every step is an IDB request.
- **Network-interleaved routine (sync push/pull):** cannot be a single transaction — it `await`s remote calls between writes, which would close the transaction. Keep its writes in separate transactions; rely on idempotent re-run (last-write-wins reconcile) for consistency instead of atomicity.

This is exactly why `applyImport` is atomic but `fullSync` is not — same store, same writes, different I/O shape.

## Why This Matters

The transaction-idle rule is a silent footgun: span a network call and the transaction is already gone by the time you write again, so the "atomic" wrapper either throws or, worse, commits a partial set. Knowing the rule up front turns "should this be one transaction?" into a one-question decision — *does it await anything that isn't an IDB request?* — rather than a debugging session. And recognizing that the network-interleaved path **can't** be atomic is what justifies leaning on idempotent reconcile there instead of chasing an impossible transaction.

## When to Apply

- Any multi-write local store operation where a partial result would be wrong (import, restore, batch edit). Make it one transaction.
- Before reaching for a transaction around a sync/merge routine: if it `await`s the network between writes, don't — it will auto-commit mid-flight. Make those writes idempotent instead.
- When batching, write through the transaction's object stores directly and emit a single change event after `tx.done`, rather than looping per-write helpers that each open a transaction and emit.

## Examples

**Atomic local batch (`applyImport`):**

```ts
const db = await getDB()
const tx = db.transaction(['restaurants', 'visits'], 'readwrite')
for (const rec of restaurantsToWrite) await tx.objectStore('restaurants').put(rec) // awaiting IDB requests keeps tx alive
for (const rec of visitsToWrite) await tx.objectStore('visits').put(rec)
await tx.done                 // all-or-nothing commit
// recompute derived state + emit ONE change after commit
emitStoreChange()
```

**Why sync can't do the same** — it interleaves a network `await`, which closes the transaction:

```ts
// ❌ would auto-commit at the first `await remote.push(...)` (non-IDB promise) → TransactionInactiveError
for (const rec of toWriteLocal) await tx.objectStore('restaurants').put(rec)
for (const rec of toPush)       await remote.pushRestaurant(rec) // network — tx is already gone
// fullSync therefore uses per-record writes + idempotent last-write-wins reconcile, not one transaction.
```

## Related

- [`../architecture-patterns/import-as-reconcile-source-validate-then-commit.md`](../architecture-patterns/import-as-reconcile-source-validate-then-commit.md) — the import path this atomicity applies to.
- [`../architecture-patterns/local-first-lww-sync-indexeddb-pocketbase.md`](../architecture-patterns/local-first-lww-sync-indexeddb-pocketbase.md) — why the network-interleaved sync path relies on idempotent reconcile instead of atomicity.
- [`./emit-store-change-after-write-commits.md`](./emit-store-change-after-write-commits.md) — emitting one store-change after the batch commits.
- Source: `src/sync/portability/import.ts`, `src/sync/syncEngine.ts`.
