---
title: Local-first last-write-wins sync between IndexedDB and PocketBase
date: 2026-06-13
last_updated: 2026-06-13
category: architecture-patterns
module: sync + data model
problem_type: architecture_pattern
component: database
severity: high
related_components:
  - sync-engine
  - authentication
applies_when:
  - IndexedDB (or any local store) is the canonical write store and a remote is a secondary mirror
  - Syncing with a backend that reserves its own timestamp fields (PocketBase, Supabase, Firebase, Django auto_now)
  - Offline writes must survive with no network and reconcile on reconnect without duplicates
  - Sign-in must merge pre-existing anonymous local data into an account without creating duplicates
  - Deletes must propagate across devices without resurrecting on the next sync
tags:
  - local-first
  - indexeddb
  - pocketbase
  - last-write-wins
  - soft-delete
  - client-generated-id
  - offline-first
---

# Local-first last-write-wins sync between IndexedDB and PocketBase

## Context

Tablemarks keeps IndexedDB as the canonical store and treats PocketBase as an optional cloud mirror: the app works fully offline and with no account, and sync is opportunistic. Conflicts resolve by last-write-wins (LWW) on a client-controlled timestamp — newer wins, ties keep local. The reconciliation core (`src/sync/reconcile.ts`) is pure and side-effect-free, so the risky logic is unit-testable without any I/O. These rules interlock; each was a deliberate decision, and getting one wrong breaks the sync invariant in a way that usually fails *silently*.

## Guidance

Load-bearing rules:

1. **A stable client-generated id is the union key.** `newId()` (`src/data/ids.ts`) makes a 15-char `[a-z0-9]` id — PocketBase-compatible — written to IndexedDB at creation and reused *as* the PocketBase record id on push. Because both sides share the id, reconcile zips local and remote into one `Map<id, {local, remote}>` and sign-in becomes a union merge, not a batch-create. This is what prevents duplicates when an anonymous user signs in.

2. **Never use the backend's own `updated` field as your LWW key.** PocketBase reserves `updated` as a system autodate column it overwrites on every save — a client value pushed there is discarded. The schema stores the client timestamp in a *custom* field `syncedAt`; `src/sync/mappers.ts` maps local `updated` ↔ remote `syncedAt` in both directions, and LWW always compares the local `updated`.

3. **Tombstones are first-class records.** Deletes set `deleted: true` with a fresh `updated`; they participate in LWW like any record, so a delete wins by recency and is not resurrected by a stale peer. Hard-deleting remote records would destroy the tombstone and make the deletion invisible to other devices.

4. **`reconcile()` returns sets, it doesn't mutate.** It returns `{ merged, toWriteLocal, toPush }` keyed by id; the caller in `syncEngine.ts` does the writes. This keeps the conflict logic pure and testable.

5. **The local store is the durable outbox.** `fullSync` pulls → reconciles → writes remote winners locally → pushes local winners. Local writes happen before the push, so a crash mid-sync leaves local ahead of remote (the safe state) and the next sync re-pushes. No separate queue is needed.

6. **Upsert falls through to create only on 404.** `PocketBaseRemote.upsert` updates first; only a genuine not-found (404) becomes a create. Any other error propagates instead of being masked as a create.

7. **Rollup fields are local-derived and must not bump `updated`.** Denormalized aggregates (`latestVerdict`, `visitCount`) are recomputed per device from its own children (`src/data/rollup.ts`) and written without touching `updated`. If recompute bumped `updated`, a derived change would wrongly win LWW against a peer's genuine user edit.

   **Recompute scope = every row written from an external source, not only rows whose children changed.** A parent row can win LWW carrying the *sender's* serialized rollup while its children are unchanged on this device. A derived value arriving from outside is never trusted — discard it and recompute from local children on write. Gate the recompute on "rows I wrote" (union of written parents and the parents of written children), not on "children I wrote": keying it on child-writes alone leaves a winning parent row with a stale foreign rollup, surfacing wrong counts in the UI (the bug fixed in `applyImport`, `src/sync/portability/import.ts`). The same too-narrow shape is latent in `fullSync` (`src/sync/syncEngine.ts`), which still seeds its recompute set only from written visits.

## Why This Matters

The `updated` → `syncedAt` mapping is the counterintuitive part and it fails *silently*. Push records into PocketBase's `updated` and every sync still "succeeds" with no error — but LWW then compares server-processing timestamps instead of client-edit timestamps. The only symptom is occasional "my edit got overwritten" after editing on two devices close in time: a notoriously hard bug to reproduce. The general lesson — preserve client semantics in a field the backend doesn't own — applies to any BaaS that auto-manages system fields (Supabase `updated_at`, Firebase server timestamps, Django `auto_now`).

## When to Apply

Apply when the app must work fully offline with sync as a background concern, conflicts are rare (single-user or loosely collaborative), and record-level LWW is acceptable. **Do not** apply when concurrent multi-user edits to the same record are common (use CRDTs/OT), when you need field-level merging, or when an audit history of every version is required (LWW discards the loser permanently).

## Examples

The core gotcha — map the client timestamp to a field the backend doesn't own (`src/sync/mappers.ts`):

```typescript
// local -> remote (push): the client's `updated` rides in `syncedAt`, never PB's `updated`
function restaurantToRemote(r: Restaurant, owner: string): RemoteRestaurant {
  return { id: r.id, owner, name: r.name, /* … */ syncedAt: r.updated, deleted: r.deleted }
}
// remote -> local (pull): restore it
function restaurantFromRemote(r: RemoteRestaurant): Restaurant {
  return { id: r.id, name: r.name, /* … */ updated: r.syncedAt, deleted: r.deleted }
}
```

Pure LWW winner — newer `updated` wins, tie keeps local (`src/sync/reconcile.ts`):

```typescript
export function pickWinner<T extends SyncFields>(local: T | undefined, remote: T | undefined) {
  if (!local) return remote
  if (!remote) return local
  return remote.updated > local.updated ? remote : local
}
```

Union reconcile by id — no I/O, tombstones included:

```typescript
for (const { local: l, remote: rem } of pairs.values()) {
  const winner = pickWinner(l, rem)!
  merged.push(winner)
  if (l?.updated === rem?.updated) continue       // equal -> no-op (idempotent re-sync)
  if (winner === rem) toWriteLocal.push(winner)   // remote won -> write locally
  else toPush.push(winner)                        // local won -> push
}
```

Upsert — create only on a real 404 (`src/sync/syncEngine.ts`):

```typescript
try {
  await pb.collection(collection).update(id, body)
} catch (err) {
  if ((err as { status?: number })?.status === 404) await pb.collection(collection).create({ id, ...body })
  else throw err  // auth / 5xx / network must surface, not become a spurious create
}
```

## Related

- Source: `src/sync/reconcile.ts` (LWW union), `src/sync/mappers.ts` (the `updated`↔`syncedAt` and relation mapping), `src/sync/syncEngine.ts` (fullSync + upsert), `src/data/ids.ts`, `src/data/rollup.ts`, `pocketbase/pb_migrations/1718200000_init_collections.js`.
- Project docs: `docs/architecture.md` (system narrative), `docs/data-model.md` (the field-mapping table), `docs/brainstorms/2026-06-12-local-first-architecture-requirements.md` (the requirements this implements).
- Sibling learning in the same subsystem, different concern: `docs/solutions/architecture-patterns/restart-controllers-on-startup.md` — the controller *lifecycle* (resume on bootstrap) vs. this doc's *data model*.
