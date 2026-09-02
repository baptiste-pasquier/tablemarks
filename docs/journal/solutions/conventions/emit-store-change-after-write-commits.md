---
title: Emit local-first store change events only after the write commits
date: 2026-06-13
category: conventions
module: data store + events
problem_type: convention
component: database
severity: high
related_components:
  - frontend
  - sync-engine
applies_when:
  - Writing a mutation helper in a local-first IndexedDB store that notifies subscribers
  - A reactive UI hook re-fetches the store on every change event
  - An uncontrolled input's key or defaultValue is derived from store state
  - Firing a fire-and-forget store write from a blur or debounced handler
tags:
  - local-first
  - indexeddb
  - reactive-store
  - emit-after-commit
  - uncontrolled-input
  - react
---

# Emit local-first store change events only after the write commits

## Context

Tablemarks is local-first: mutations write to IndexedDB (via `idb`) and a tiny pub/sub in `src/data/events.ts` (`emitLocalChange` / `emitStoreChange` + `onStoreChange`) notifies subscribers. UI hooks like `useRestaurants` and `useRestaurantDetail` subscribe through `onStoreChange` and re-fetch on every change. So every mutation has two observable effects — the persisted write and the notification that triggers a reactive re-fetch — and **the order between them is load-bearing**.

The mutation helpers in `src/data/restaurants.ts` (`createRestaurant`, `updateRestaurant`, `removeRestaurant`) all order those two effects the same way:

```ts
await db.put('restaurants', next)   // 1. persist
emitLocalChange()                   // 2. THEN notify subscribers
return next
```

The risk this ordering protects against surfaces most sharply with uncontrolled inputs whose remount identity is derived from store state. `src/features/visits/RestaurantDetail.tsx` renders the cuisine field as an uncontrolled input keyed on store data:

```tsx
<input
  key={`${restaurant.id}:${restaurant.cuisine ?? ''}`}
  list={cuisineListId}
  defaultValue={restaurant.cuisine ?? ''}
  onBlur={(e) => saveCuisine(e.target.value)}
  aria-label="Cuisine"
/>
```

A code reviewer flagged this as a P1 race: blur calls `saveCuisine` → `updateRestaurant`; *if* the event fired before the IndexedDB write committed, the reactive re-fetch would read the **old** value, the `key` would stay stale, and React would remount the input to the stale `defaultValue` — silently discarding the edit. The finding was **false**, and *why* it was false is the lesson worth keeping.

## Guidance

**In a local-first store, emit change events only after the persistence write resolves.** Order every mutation as persist-then-notify:

```ts
// ✅ correct — subscribers always re-fetch post-commit state
await db.put('restaurants', next)
emitLocalChange()
return next
```

```ts
// ❌ wrong — subscribers re-fetch and may read the pre-write value
emitLocalChange()
await db.put('restaurants', next)
return next
```

With persist-then-notify, the reactive re-fetch reads the just-written value. For the cuisine input, the re-fetch returns `cuisine: 'French'`, the new key becomes `id:French`, and the input remounts to `French` — the value the user just typed. The remount is benign (it replaces the typed value with the identical persisted value), and focus is already gone because the trigger was a blur.

Two supporting conventions apply to the same fire-and-forget surface:

- **Guard fire-and-forget store writes** with `.catch(() => {})`. A row can be deleted or synced away between render and blur, so `updateRestaurant` (which throws when the id is missing) can reject; without a guard that becomes an unhandled rejection. `saveCuisine` does `void updateRestaurant(id, { cuisine: next }).catch(() => {})`. Keep best-effort *secondary* writes (e.g. AddPlace attaching a cuisine after the place is created) non-blocking too, so a failed secondary write never surfaces as "couldn't add the place."
- **Derive a remount `key` from store state only when the store emits after commit.** That ordering is what guarantees the re-fetched value matches what the key encodes. If you can't guarantee emit-after-commit, key on `id` alone and rely on the first-mount `defaultValue` — never key an uncontrolled input on a field whose freshness you can't prove.

## Why This Matters

The ordering is the single invariant that makes reactive uncontrolled inputs safe. Reverse it and you get a genuine lost-edit bug: the re-fetch reads stale data, the key reverts, and React throws away the user's input on remount — a silent data-loss failure that is hard to reproduce because it depends on microtask timing between the emit and the IndexedDB commit.

It also changes how you triage review findings. The reviewer's race was plausible on its face and only dissolves once you confirm the emit fires *after* `await db.put`. Encoding persist-then-notify as a stated convention lets future reviewers (and agents) reject the same false positive quickly, and lets them trust that any `key`/`defaultValue`-derived remount reflects committed state.

## When to Apply

- Writing or reviewing any mutation helper in a local-first store with a change-notification pub/sub (`src/data/restaurants.ts`, `src/data/visits.ts`, `src/data/events.ts`). Persist first, notify second.
- Reviewing uncontrolled inputs (`defaultValue` + `key`) whose `key` is derived from store data — confirm the store emits after commit, or key on `id` alone.
- Triaging a "reactive reload remounts to a stale value" race claim — check the emit/await ordering before treating it as real.
- Adding fire-and-forget store writes from event handlers (blur, debounced save) — guard with `.catch(() => {})` and keep secondary writes non-blocking.

## Examples

**Mutation helper — persist then notify (the core convention), as written in `src/data/restaurants.ts`:**

```ts
export async function updateRestaurant(id: string, patch: RestaurantPatch): Promise<Restaurant> {
  const db = await getDB()
  const existing = await db.get('restaurants', id)
  if (!existing) throw new Error(`Restaurant ${id} not found`)
  const next: Restaurant = { ...existing, ...patch, id, updated: now() }
  await db.put('restaurants', next)   // 1. commit
  emitLocalChange()                   // 2. then notify → reactive re-fetch reads `next`
  return next
}
```

**Reactive uncontrolled input — safe *because* of emit-after-commit:**

```tsx
// Keying on store state is safe ONLY because the store emits post-commit:
// the re-fetch returns the written cuisine, the key becomes `id:French`,
// and the remount value equals the value the user just typed.
<input
  key={`${restaurant.id}:${restaurant.cuisine ?? ''}`}
  defaultValue={restaurant.cuisine ?? ''}
  onBlur={(e) => saveCuisine(e.target.value)}
  aria-label="Cuisine"
/>
```

**Guarded fire-and-forget write from a blur handler:**

```ts
function saveCuisine(value: string) {
  const next = value.trim() || undefined
  if (next === (restaurant.cuisine || undefined)) return
  // The row may have been deleted/synced away between render and blur → may reject.
  void updateRestaurant(restaurantId, { cuisine: next }).catch(() => {})
}
```

## Related

- [`../architecture-patterns/local-first-lww-sync-indexeddb-pocketbase.md`](../architecture-patterns/local-first-lww-sync-indexeddb-pocketbase.md) — sibling in the same store subsystem; covers cross-device last-write-wins conflict resolution, whereas this doc covers single-client write→notify ordering for reactive reads. The event-bus emit-after-write ordering is the mechanism that makes those local writes observable to subscribers.
- [`../architecture-patterns/restart-controllers-on-startup.md`](../architecture-patterns/restart-controllers-on-startup.md) — same sync/local-first module, runtime-lifecycle concern.
- [`./react-leaflet-test-mock-stability.md`](./react-leaflet-test-mock-stability.md) — companion failure family: unstable/uncommitted values feeding React effect or `key` dependencies cause remount/loop bugs.
- Source: `src/data/restaurants.ts`, `src/data/events.ts`, `src/features/visits/RestaurantDetail.tsx`, `src/features/capture/AddPlace.tsx`.
