---
title: Account Store Isolation - Design
type: design
date: 2026-10-11
topic: account-store-isolation
status: approved
---

# Account Store Isolation - Design

## Goal

Make one browser profile safe for one account **and** for several people taking turns, without
giving up local-first.

Today there is one IndexedDB store with no notion of owner, and every sign-in runs the union
reconcile against it, for any account. Measured on PocketBase 0.39.3
(`docs/journal/solutions/database-issues/account-switch-wedges-sync-on-shared-local-store.md`):

- the account's places stay visible after signing out;
- a second account signing in on the same device gets its sync wedged on a `400` forever, after
  a random subset of the previous account's unsynced places has leaked into it;
- both accounts' places end up mixed in the local view.

## Decisions taken in brainstorming

| Question | Decision |
|---|---|
| Who uses one browser? | Single-account devices and shared devices, equally |
| What does signing out do with local data? | **Always erase it** |
| Signing out with unsent changes | Try to send them first; if that fails, warn "N changes will be lost" with **Cancel** (default) or **Sign out anyway** |
| Signing in with places added without an account | **Ask**: add them to the account, erase them, or cancel. No question when the store is empty |
| How the store remembers its account | A marker in IndexedDB (approach A), not localStorage, not per-record owners |

Derived and agreed:

- The store still needs an owner marker: no code refreshes the PocketBase token, so a session
  can expire without any sign-out, and stores installed before this change hold account data
  with no owner.
- Only a **user-initiated** sign-out erases. An expired session and the automatic sign-out in
  `src/App.tsx` (backend absent) keep the data and its owner, because nobody is there to confirm
  a loss.
- A store owned by account A cannot be merged into account B: B can only erase it or cancel.
- While A's session is expired, A's places stay visible. No lock screen.
- A pre-existing store with no owner is bound silently to the account of a still-valid session
  at startup; otherwise it is treated as "places added without an account".

## 1. Data layer (`src/data/`)

**Schema.** `tablemarks` goes to **v2** and gains a `meta` object store with out-of-line keys.
Its one entry is `owner`: an account id, or absent. The v1→v2 upgrade only creates the store;
an existing database opens with no owner. The upgrade branches on `oldVersion` as `db.ts`
already does.

**New module `src/data/storeOwner.ts`** — the only reader and writer of `meta`.

| Function | Purpose |
|---|---|
| `getStoreOwner(): Promise<string \| null>` | Which account the store belongs to |
| `bindStoreOwner(owner: string): Promise<void>` | Bind the store to an account, before its first sync |
| `wipeLocalStore(): Promise<void>` | Clear `restaurants`, `visits` and `meta` in **one transaction**, then `emitStoreChange()` after it commits. Never `emitLocalChange()`, so an erase never triggers a push |
| `countLiveRestaurants(): Promise<number>` | The "N places" of the sign-in question (non-deleted restaurants) |

The unsent-change count is `pendingCount` from `src/sync/syncStatus.ts`; it is not recomputed in
the data layer.

Not erased: the localStorage preferences (`tablemarks:sortPreference`, `tablemarks:osmDismissed`
— device preferences, the latter only random ids) and the service worker's tile cache.

## 2. Orchestration (`src/auth/`)

`fullSync` and `reconcile` do not change. Every decision is taken in `AuthService`, **before** the
`SyncController` starts.

**Pure decision function** — `src/auth/signInDecision.ts`:

| Store owner | Live places | Decision |
|---|---|---|
| this account | any | `resume` — sync |
| none | 0 | `bind` — bind, then sync |
| none | ≥ 1 | `ask-adopt(N)` — *add* (bind, sync: the union reconcile pushes them) / *erase* (wipe, bind, sync) / *cancel* |
| another account | any | `ask-replace(pendingCount)` — *erase and continue* (wipe, bind, sync) / *cancel* |

*Cancel* clears the session (`pb.authStore.clear()`) and leaves the store untouched.

**Asking the UI.** `signInWithGoogle(ask)` takes `ask(question) => Promise<answer>` from the UI,
so `auth` never imports React and tests pass a fake.

**`AuthService` takes a remote factory** (default `(owner) => new PocketBaseRemote(owner)`), so
tests drive it with a `FakeRemote`.

**Startup — `resume()`**, valid session. No UI is mounted yet, so it asks nothing:

| Store owner | Action |
|---|---|
| this account | start sync |
| none | bind silently, start sync (pre-existing store) |
| another account | `endSession()` without erasing; the user goes through sign-in, which asks `replace` |

**Expired session.** Nothing special: `resume()` does not start, the store stays bound to A, and
A signing in again hits `resume`.

**User sign-out — `signOut(confirmLoss)`:**

1. If the backend address is known and the device is online: `SyncController.flush()`, one
   immediate sync attempt bounded at **10 s** (the SDK sets no timeout of its own; see
   `docs/journal/solutions/database-issues/pocketbase-sdk-discards-your-abort-signal.md`).
2. If `pendingCount > 0` afterwards: `confirmLoss(N)`. *Cancel* changes nothing and the session
   stays open.
3. Stop the controller, `pb.authStore.clear()`, then `wipeLocalStore()`. If the wipe fails, the
   error reaches the user; the store stays bound to A, the same state as an expired session, so
   nothing can leak into another account.

**`eraseLocalData()`** — retries `wipeLocalStore()` after a failed sign-out wipe.

**Automatic sign-out — `endSession()`.** Stop the controller and clear the session, **no wipe**.
`src/App.tsx`'s backend-absent effect calls this instead of `signOut()`.

**`SyncController.flush(): Promise<boolean>`** — runs one sync now through the existing
serialized `syncNow`, resolves `true` when nothing is pending afterwards, `false` on failure or
timeout. It never schedules a backoff of its own beyond what `attemptSync` already does.

## 3. UI (`src/features/account/`)

**One component, `AccountPromptDialog`**, on `Modal` + `ModalHeader` + `Button`. Copy and actions
come from a `Record` map keyed by question, the `Modal.tsx` pattern. Escape and a backdrop click
always mean *Cancel*.

| Question | Message | Actions (initial focus in **bold**) |
|---|---|---|
| `adopt` | "N places were added on this device without an account." | **Add to my account** · Erase them (danger) · Cancel |
| `replace` | "This device holds another account's places (including N changes never backed up). They can't be added to yours." | **Cancel** · Erase and continue (danger) |
| `loss` | "N changes could not be sent and will be lost." | **Cancel** · Sign out anyway (danger) |

The parenthesis in `replace` shows only when N > 0. Plurals go through i18next; keys live under
`account.prompt.*` in both `en` and `fr`.

**State hook `useAccountActions()`**, beside the component — `AGENTS.md` forbids new UI state in
`App.tsx`. It wraps `useAuth`'s `signIn`/`signOut`, supplies the `ask` that opens the dialog and
resolves on click, and returns `{ signIn, signOut, dialog }`. `App.tsx` renders `dialog` and wires
the two handlers in place of today's; the post-sign-out focus move to `shell-signin-button`
moves into the hook.

**Intermediate states and errors:**

- During the sign-out flush (up to 10 s) the dialog shows "Sending your changes…" with no
  action, then closes on success or turns into `loss`.
- A failed wipe after sign-out shows a `role="alert"` message, "Signed out, but this device's
  data could not be erased", with **Try again** calling `auth.eraseLocalData()`.
- A cancelled sign-in shows nothing more: the header is back to signed out.

## 4. Testing

Test-first for every unit below.

| File | Covers |
|---|---|
| `src/auth/signInDecision.test.ts` | Every row of the decision table |
| `src/data/storeOwner.test.ts` | A v1 store with records keeps them on opening as v2, with no owner; bind/get; wipe clears all three stores, emits `storeChange` after commit and never `localChange` |
| `src/sync/syncEngine.test.ts` | `flush()` resolves `true` when everything pushed, `false` on failure and on the 10 s bound |
| `src/auth/auth.test.ts` | Every path of sign-in, `resume`, `signOut`, `endSession`, `eraseLocalData`, with a fake `ask` and a `FakeRemote` |
| U23 regression, in `src/auth/auth.test.ts` | A `FakeRemote` that **refuses another account's id like PocketBase does** (the measured `400`). A syncs; the session expires without a wipe; B signs in. Expected: `replace` is asked, no A record is pushed to B, and after *erase and continue* B's sync succeeds |
| `AccountPromptDialog.test.tsx`, `useAccountActions.test.ts` | Copy, initial focus, Escape = cancel, the sending state, the alert and its retry |

No e2e: the demo build has no backend, so no sign-in. Before the PR, the measurement's scenario
is replayed against a throwaway PocketBase and the result goes into the PR description.

## 5. Documentation

| File | Change |
|---|---|
| `docs/journal/decisions/0008-bind-the-local-store-to-one-account.md` | New ADR (MADR): the store belongs to one account, user sign-out erases it, a sign-in that finds data asks |
| `docs/explanation/architecture.md` | Rewrite "Local-first and accounts": the union reconcile runs only for a store with no owner, sign-out erases; link the ADR and the measurement |
| `docs/reference/data-model.md` | The `meta` store, v2 |
| `CONCEPTS.md` | New term **Store Owner**; the LWW entry's "signing in merges" sentence narrowed to a store with no owner |
| `AGENTS.md` | "IndexedDB `tablemarks` v1" → v2; no line added |
| `README.md` | If it describes signing out, one sentence: signing out erases this device's data |

## Out of scope

- Refreshing the PocketBase token so sessions stop expiring.
- Erasing the service worker's tile cache on sign-out.
- A lock screen for an expired session.
- Making `fullSync` itself survive a record owned by another account; the decision table keeps
  such a store from reaching it, except a pre-existing ownerless store adopted by the wrong
  account, which wedges once, as today.
