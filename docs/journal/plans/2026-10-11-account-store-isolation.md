---
title: Account Store Isolation - Plan
type: fix
date: 2026-10-11
topic: account-store-isolation
status: ready
---

# Account Store Isolation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bind the local IndexedDB store to one account, erase it on user sign-out, and ask the user when a sign-in finds data, so a second account on the same device can neither wedge its sync nor receive another account's places.

**Architecture:** A `meta` store (DB v2) records the store's owner. A pure `decideSignIn` function maps (owner, user, counts) to a decision; `AuthService` runs it after OAuth and before starting `SyncController`, asking the UI through an injected `ask` function. A single `AccountPromptDialog`, fed by a `useAccountActions` state hook, renders the questions. `fullSync` and `reconcile` do not change.

**Tech Stack:** React 19, TypeScript, `idb`, `fake-indexeddb`, PocketBase JS SDK, i18next, Vitest + Testing Library.

**Spec:** `docs/journal/specs/2026-10-11-account-store-isolation-design.md`

## Global Constraints

- Layer direction: features → `src/data/` → `src/sync/`. Features may import `src/auth/` (as `App.tsx` already does), never `src/sync/`.
- Only `src/data/` touches IndexedDB; only `src/sync/` talks to PocketBase (`src/auth/auth.ts` already goes through `pb` from `src/sync/pocketbase.ts`).
- Emit a store change only after the transaction commits (`docs/journal/solutions/conventions/emit-store-change-after-write-commits.md`).
- `wipeLocalStore()` never calls `emitLocalChange()`.
- Sign-out flush bound: **10 000 ms**.
- Only a user-initiated `signOut` erases; `endSession` and `resume` never erase.
- No user-facing string literal in a component; every key exists in both `src/i18n/locales/en/translation.json` and `src/i18n/locales/fr/translation.json`. French copy uses **vous**, as the rest of the file does.
- Size limits: 300 lines per module, 250 per component, 60 per function. `App.tsx` must not grow.
- `function` declarations for named module functions; `import type` for type-only imports; no `any`; `cn()` for class composition.
- Every user-triggered failure reaches the user; `console.error` alone is not handling.
- Commit messages: Conventional Commits, no AI attribution footer.

## Review Focus

1. **Sign-out while a sync is already running** — the user expects the flush to wait for it rather than return "nothing pending" early. Pinned by `flush waits for an in-flight sync` (Task 3).
2. **The OAuth popup is closed or fails** — the user expects to stay signed out with the store untouched and no dialog. Pinned by `signInWithGoogle leaves the store alone when OAuth rejects` (Task 5).
3. **The store holds only tombstones (all places deleted while signed out)** — the user expects no "0 places" question. Pinned by the `liveCount: 0` row in Task 2 and `countLiveRestaurants ignores tombstones` (Task 1).
4. **Escape or backdrop on a destructive question** — the user expects nothing to be erased. Pinned by `Escape answers cancel` (Task 4).
5. **An IndexedDB write fails mid-wipe** — the user expects nothing half-erased and an error they can see. Pinned by `wipeLocalStore is all-or-nothing` (Task 1) and `signOut reports a failed wipe and keeps the owner` (Task 5).

---

### Task 1: The `meta` store and `storeOwner` module

**Files:**
- Modify: `src/data/db.ts` (version 2, `meta` store)
- Create: `src/data/storeOwner.ts`
- Test: `src/data/storeOwner.test.ts`
- Modify: `docs/reference/data-model.md` (the `meta` store, v2), `AGENTS.md` ("IndexedDB `tablemarks` v1" → "v2", no line added)

**Interfaces:**
- Produces:
  - `getStoreOwner(): Promise<string | null>`
  - `bindStoreOwner(owner: string): Promise<void>`
  - `wipeLocalStore(): Promise<void>`
  - `countLiveRestaurants(): Promise<number>`
  - `DB.version === 2`; `TablemarksDB['meta']` is `{ key: string; value: string }`

- [ ] **Step 1: Write the failing tests** in `src/data/storeOwner.test.ts` (use `freshDB` from `src/test/idb.ts`):
  - `upgrades a v1 store to v2 keeping its records, with no owner`: open `tablemarks` at version 1 with raw `idb` `openDB` creating `restaurants` (keyPath `id`) and `visits` (keyPath `id`, index `by-restaurant` on `restaurantId`), put one restaurant `{ id: 'r1', … }`, close it; then `expect(await getStoreOwner()).toBeNull()` and `expect((await getRestaurant('r1'))?.id).toBe('r1')`.
  - `binds and reads the owner`: `await bindStoreOwner('userA')` → `getStoreOwner()` resolves `'userA'`.
  - `wipeLocalStore clears places, visits and the owner`: create a restaurant and a visit, bind `'userA'`, wipe → `allRestaurantsForSync()` and `allVisitsForSync()` are `[]`, owner `null`.
  - `wipeLocalStore emits a store change after commit and never a local change`: subscribe both channels; inside the `onStoreChange` listener, assert `allRestaurantsForSync()` is already `[]`; assert the local listener was not called.
  - `wipeLocalStore is all-or-nothing`: spy so the `meta` store's `clear` rejects (e.g. `vi.spyOn(IDBObjectStore.prototype, 'clear')` rejecting on the third call); expect `wipeLocalStore()` to reject, and the restaurant and owner to be still present.
  - `countLiveRestaurants ignores tombstones`: two restaurants, `removeRestaurant` one → `1`.

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/data/storeOwner.test.ts`
Expected: FAIL — `Cannot find module './storeOwner'`.

- [ ] **Step 3: Implement.** In `db.ts`: `DB_VERSION = 2`, add `meta: { key: string; value: string }` to the schema, and `if (oldVersion < 2) db.createObjectStore('meta')` (out-of-line keys). In `storeOwner.ts`: the owner lives under key `'owner'`; `wipeLocalStore` opens one `readwrite` transaction over `['restaurants', 'visits', 'meta']`, clears all three, awaits `tx.done`, then `emitStoreChange()`.

- [ ] **Step 4: Run the data tests**

Run: `npx vitest run src/data`
Expected: PASS, including the existing `restaurants.test.ts` and `visits.test.ts`.

- [ ] **Step 5: Update `docs/reference/data-model.md` and `AGENTS.md`**, then run `npm run check:docs` — expected `docs/ structure OK`.

- [ ] **Step 6: Commit**

```bash
git add src/data/db.ts src/data/storeOwner.ts src/data/storeOwner.test.ts docs/reference/data-model.md AGENTS.md
git commit -m "feat(data): record the store's owner in a v2 meta store, wipe it atomically"
```

---

### Task 2: The sign-in decision and the shared question types

**Files:**
- Create: `src/auth/signInDecision.ts`
- Test: `src/auth/signInDecision.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type SignInDecision =
    | { kind: 'resume' }
    | { kind: 'bind' }
    | { kind: 'ask-adopt'; count: number }
    | { kind: 'ask-replace'; pendingCount: number }
  export interface SignInFacts { storeOwner: string | null; userId: string; liveCount: number; pendingCount: number }
  export function decideSignIn(facts: SignInFacts): SignInDecision

  export type AccountQuestion =
    | { kind: 'adopt'; count: number }
    | { kind: 'replace'; pendingCount: number }
    | { kind: 'loss'; pendingCount: number }
  export type AccountAnswer = 'add' | 'erase' | 'sign-out' | 'cancel'
  export type AskAccountQuestion = (question: AccountQuestion) => Promise<AccountAnswer>
  ```

- [ ] **Step 1: Write the failing test** — one `it.each` over the spec's table:

| `storeOwner` | `userId` | `liveCount` | `pendingCount` | expected |
|---|---|---|---|---|
| `'u1'` | `'u1'` | `5` | `2` | `{ kind: 'resume' }` |
| `null` | `'u1'` | `0` | `3` | `{ kind: 'bind' }` |
| `null` | `'u1'` | `4` | `0` | `{ kind: 'ask-adopt', count: 4 }` |
| `'u2'` | `'u1'` | `0` | `0` | `{ kind: 'ask-replace', pendingCount: 0 }` |
| `'u2'` | `'u1'` | `3` | `2` | `{ kind: 'ask-replace', pendingCount: 2 }` |

- [ ] **Step 2: Run it** — `npx vitest run src/auth/signInDecision.test.ts` — expected FAIL, module not found.
- [ ] **Step 3: Implement `decideSignIn`** in `src/auth/signInDecision.ts`, with the types above.
- [ ] **Step 4: Run it** — expected PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(auth): decide what a sign-in does from the store's owner"`

---

### Task 3: `SyncController.flush()`

**Files:**
- Modify: `src/sync/syncEngine.ts` (`SyncController`)
- Test: `src/sync/syncEngine.test.ts` (new `describe('SyncController.flush')`, reusing `FakeRemote`, `FailingRemote`, `DelayedRemote` and the realtime stub at line ~311)

**Interfaces:**
- Produces: `SyncController.flush(timeoutMs = 10_000): Promise<boolean>` — `true` iff `recomputePending()` is `0` after one sync attempt.

- [ ] **Step 1: Write the failing tests:**
  - `flush resolves true once local changes are pushed`: start with `FakeRemote`, create a restaurant, `expect(await controller.flush()).toBe(true)` and the remote holds it.
  - `flush resolves false when the push fails`: start with `FailingRemote`, create a restaurant → `false`.
  - `flush resolves false when the bound elapses`: `DelayedRemote` with `delayMs = 50`, `flush(10)` → `false`.
  - `flush waits for an in-flight sync`: `DelayedRemote` with `delayMs = 30`; call `controller.syncNow()` without awaiting, create a restaurant, then `await controller.flush()` → `true` and the remote holds the new restaurant.
  - `flush resolves false when the controller is not started` with a pending record.

- [ ] **Step 2: Run them** — `npx vitest run src/sync/syncEngine.test.ts -t flush` — expected FAIL, `flush is not a function`.
- [ ] **Step 3: Implement.** Keep the in-flight run in a new `private inFlight: Promise<SyncOutcome | undefined> | null` set by `syncNow`; `flush` awaits `inFlight` if any, then `syncNow()`, then `recomputePending() === 0`, all raced against a `setTimeout(timeoutMs)` that resolves `false` (clear the timer either way). No new backoff scheduling.
- [ ] **Step 4: Run the sync tests** — `npx vitest run src/sync` — expected PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(sync): flush pending changes on demand with a time bound"`

---

### Task 4: `AccountPromptDialog` and its copy

**Files:**
- Create: `src/features/account/AccountPromptDialog.tsx`
- Test: `src/features/account/AccountPromptDialog.test.tsx`
- Modify: both `translation.json` files (new top-level `account.prompt` block)

**Interfaces:**
- Consumes: `AccountQuestion`, `AccountAnswer` (Task 2).
- Produces:
  ```ts
  export type AccountPromptState =
    | { kind: 'question'; question: AccountQuestion }
    | { kind: 'sending' }
    | { kind: 'wipe-failed' }
  export interface AccountPromptProps {
    state: AccountPromptState
    onAnswer: (answer: AccountAnswer) => void
    onRetryWipe: () => void
    onDismiss: () => void
  }
  export function AccountPromptDialog(props: AccountPromptProps)
  ```

**Copy** (keys under `account.prompt`; plurals with `_one` / `_other`; `‹count›` is i18next's interpolation of `count`, written with double braces in the JSON):

| Key | en | fr |
|---|---|---|
| `adopt.title` | Places on this device | Des lieux sur cet appareil |
| `adopt.body_one` / `_other` | ‹count› place was added on this device without an account. / ‹count› places were added on this device without an account. | ‹count› lieu a été ajouté sur cet appareil sans compte. / ‹count› lieux ont été ajoutés sur cet appareil sans compte. |
| `adopt.add` | Add to my account | Ajouter à mon compte |
| `adopt.erase` | Erase them | Les effacer |
| `replace.title` | Another account's places | Les lieux d'un autre compte |
| `replace.body` | This device holds another account's places. They can't be added to yours. | Cet appareil contient les lieux d'un autre compte. Ils ne peuvent pas être ajoutés au vôtre. |
| `replace.bodyPending_one` / `_other` | This device holds another account's places, including ‹count› change never backed up. They can't be added to yours. / …including ‹count› changes never backed up… | Cet appareil contient les lieux d'un autre compte, dont ‹count› modification jamais sauvegardée. Ils ne peuvent pas être ajoutés au vôtre. / …dont ‹count› modifications jamais sauvegardées… |
| `replace.erase` | Erase and continue | Effacer et continuer |
| `loss.title` | Changes not backed up | Modifications non sauvegardées |
| `loss.body_one` / `_other` | ‹count› change could not be sent and will be lost. / ‹count› changes could not be sent and will be lost. | ‹count› modification n'a pas pu être envoyée et sera perdue. / ‹count› modifications n'ont pas pu être envoyées et seront perdues. |
| `loss.signOut` | Sign out anyway | Se déconnecter quand même |
| `cancel` | Cancel | Annuler |
| `sending` | Sending your changes… | Envoi de vos modifications… |
| `wipeFailed` | Signed out, but this device's data could not be erased. | Déconnecté, mais les données de cet appareil n'ont pas pu être effacées. |
| `retry` | Try again | Réessayer |

- [ ] **Step 1: Write the failing tests:**
  - `adopt shows the count and focuses "Add to my account"`: `count: 3` → text `3 places were added on this device without an account.`; `document.activeElement` is the `Add to my account` button; clicking `Erase them` calls `onAnswer('erase')`.
  - `replace focuses Cancel and mentions pending changes only when there are some`: `pendingCount: 0` → `replace.body` text; `pendingCount: 2` → contains `including 2 changes never backed up`; initial focus on `Cancel`; `Erase and continue` → `onAnswer('erase')`.
  - `loss focuses Cancel`: `Sign out anyway` → `onAnswer('sign-out')`.
  - `Escape answers cancel` for each of the three questions → `onAnswer('cancel')`.
  - `sending shows progress and no action`: text `Sending your changes…`; no answer button is rendered; the header close button and Escape never call `onAnswer` or `onDismiss`.
  - `wipe-failed shows an alert with a retry`: `getByRole('alert')` has the `wipeFailed` text; `Try again` → `onRetryWipe`; close → `onDismiss`.
- [ ] **Step 2: Run them** — `npx vitest run src/features/account/AccountPromptDialog.test.tsx` — expected FAIL, module not found.
- [ ] **Step 3: Implement** on `Modal` + `ModalHeader` + `Button` (`primary`, `danger`, `secondary`). Per-question title, body and actions come from one `Record<AccountQuestion['kind'], …>` map. `Modal`'s `onClose` maps to `onAnswer('cancel')` for a question, to a no-op while `sending`, and to `onDismiss` for `wipe-failed`. Initial focus via `autoFocus` on the bolded action of the spec's table.
- [ ] **Step 4: Run** the dialog tests and `npx vitest run src/i18n` (resource parity) — expected PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(account): one dialog for the sign-in and sign-out questions"`

---

### Task 5: `AuthService` — sign-in, resume, sign-out, end session, erase

**Files:**
- Modify: `src/auth/auth.ts`, `src/auth/useAuth.ts`
- Create: `src/test/session.ts` (test helper)
- Test: `src/auth/auth.test.ts` (replace `retains local data and clears auth on sign-out`, which asserts the old behaviour)

**Interfaces:**
- Consumes: Task 1's four functions, `decideSignIn` and the question types (Task 2), `SyncController.flush` (Task 3), `recomputePending` (`src/sync/syncStatus.ts`).
- Produces:
  ```ts
  export class AuthService {
    constructor(remoteFor?: (owner: string) => RemoteStore) // default: owner => new PocketBaseRemote(owner)
    resume(): Promise<void>
    signInWithGoogle(ask: AskAccountQuestion): Promise<void>
    signOut(ask: AskAccountQuestion): Promise<'signed-out' | 'cancelled'> // rejects if the wipe fails
    endSession(): void
    eraseLocalData(): Promise<void>
  }
  // useAuth(): { signedIn, email, avatarUrl, signIn(ask), signOut(ask), endSession(), eraseLocalData() }
  ```
- `src/test/session.ts`: `fakeSession(userId: string): void` — saves to `pb.authStore` a token whose payload has `exp` one hour ahead (unsigned `header.payload.sig`, base64url) and a record `{ id: userId, email: `${userId}@test.local` }`.

- [ ] **Step 1: Write the failing tests.** Stub `pb.collection` as `syncEngine.test.ts` does (`subscribe` resolves a no-op; `authWithOAuth2` calls `fakeSession(<id>)`). Use `new AuthService(owner => remote)` with a `FakeRemote`.
  - Sign-in, one test per decision: owner = user → no `ask`, remote synced; no owner and empty store → no `ask`, owner bound; no owner with 2 places → `ask({ kind: 'adopt', count: 2 })`, then for `'add'` the remote receives both and the owner is bound, for `'erase'` the store is empty and owner bound, for `'cancel'` `pb.authStore.isValid` is `false`, places kept, owner `null`; other owner → `ask({ kind: 'replace', pendingCount })`, `'erase'` wipes then binds, `'cancel'` clears the session and keeps the owner.
  - `signInWithGoogle leaves the store alone when OAuth rejects`: `authWithOAuth2` rejects → the promise rejects, no `ask`, store and owner unchanged.
  - Resume: same owner → syncs; no owner → binds silently and syncs, no prompt; other owner → session cleared, store and owner unchanged.
  - Sign-out: flush succeeds → no `ask`, session cleared, store empty, owner `null`, returns `'signed-out'`; flush fails with 2 pending → `ask({ kind: 'loss', pendingCount: 2 })`, `'cancel'` → returns `'cancelled'`, session and data intact, `'sign-out'` → wiped.
  - `signOut reports a failed wipe and keeps the owner`: make `wipeLocalStore` reject → `signOut` rejects, session cleared, owner still set; `eraseLocalData()` then succeeds and empties the store.
  - `endSession clears the session and keeps everything`.
  - **U23 regression**: an `OwnerScopedRemote extends FakeRemote` that records each id's owner and, on `pushRestaurant`/`pushVisit` of an id owned by someone else, throws `Object.assign(new Error('Failed to create record.'), { status: 400 })`. A signs in and syncs two places; `endSession()` (expiry); B signs in → `ask` receives `{ kind: 'replace', … }`; answering `'erase'` leaves no A-owned id in B's pushes and B's next `flush()` resolves `true`.
- [ ] **Step 2: Run them** — `npx vitest run src/auth` — expected FAIL (signature and behaviour).
- [ ] **Step 3: Implement** in `auth.ts`. Facts for `decideSignIn`: `getStoreOwner()`, `countLiveRestaurants()`, `recomputePending()`. `signOut` order: `flush()` → maybe `ask` loss → `controller.stop()` → `pb.authStore.clear()` → `wipeLocalStore()`. Keep each method under 60 lines; extract a private `applyDecision` if `signInWithGoogle` grows past it. Update the class doc comment: sign-out erases. `useAuth.ts` passes the new signatures through.
- [ ] **Step 4: Run** `npx vitest run src/auth src/sync src/data` — expected PASS. `npm run type-check` fails only in `src/App.tsx` (call sites fixed in Task 6).
- [ ] **Step 5: Commit** — `git commit -m "fix(auth): bind sign-in to the store's owner and erase on sign-out"`

---

### Task 6: `useAccountActions` and the `App.tsx` wiring

**Files:**
- Create: `src/features/account/useAccountActions.ts`
- Test: `src/features/account/useAccountActions.test.tsx`
- Modify: `src/App.tsx` (lines ~74–101 and the `ShellAccount` props at ~302–309)

**Interfaces:**
- Consumes: `useAuth` (Task 5), `AccountPromptProps` + `AccountPromptState` (Task 4).
- Produces: `useAccountActions(): { signIn: () => void; signOut: () => void; prompt: AccountPromptProps | null }` — a `.ts` hook returning props, not JSX, so the file stays camelCase.

- [ ] **Step 1: Write the failing tests** (mock `../../auth/useAuth`; a small harness component calls the hook and renders `AccountPromptDialog` from `prompt`):
  - `signIn opens the question auth asks and resolves it with the click`: the mocked `signIn(ask)` calls `ask({ kind: 'adopt', count: 1 })`; the dialog shows; clicking `Add to my account` resolves that promise with `'add'` and closes the dialog.
  - `signOut shows the sending state until auth asks or finishes`: the mocked `signOut` is pending → `Sending your changes…` is visible; it resolves `'signed-out'` → the dialog closes and focus moves to `#shell-signin-button`.
  - `a failed wipe shows the alert and Try again calls eraseLocalData`: mocked `signOut` rejects → `role="alert"`; `Try again` calls `eraseLocalData`; on success the dialog closes.
  - `a rejected sign-in shows no dialog`.
- [ ] **Step 2: Run them** — expected FAIL, module not found.
- [ ] **Step 3: Implement** the hook: one `AccountPromptState | null` state plus a ref holding the pending answer's `resolve`. In `App.tsx`: take `signIn`, `signOut`, `prompt` from `useAccountActions()`, render `{prompt && <AccountPromptDialog {...prompt} />}` once, pass the handlers to `ShellAccount`, delete `handleSignOut`, and make the backend-absent effect call `endSession()` from `useAuth`; update its comment (the session is dropped, the store is kept and stays bound). `App.tsx` must end shorter than it started.
- [ ] **Step 4: Run the full gate**

Run: `npm run type-check && npm test && npx eslint . && npx prettier . --check`
Expected: all pass. `App.test.tsx` included.

- [ ] **Step 5: Commit** — `git commit -m "feat(account): ask before merging or erasing on sign-in and sign-out"`

---

### Task 7: Decision record and maintained docs

**Files:**
- Create: `docs/journal/decisions/0008-bind-the-local-store-to-one-account.md` (MADR template from `docs/journal/decisions/README.md`, `status: accepted`)
- Modify: `docs/explanation/architecture.md` ("Local-first and accounts", and the "Sign-in is a union" bullet), `CONCEPTS.md`, `README.md` line 49

- [ ] **Step 1: Write the ADR.** Context: the measurement entry. Options: IndexedDB `meta` marker (chosen), localStorage key, per-record owner partition. Decision and consequences as in the spec, including the out-of-scope pre-existing-store case.
- [ ] **Step 2: Rewrite "Local-first and accounts"**: the union reconcile runs for a store with no owner and only after the user agrees; a user sign-out erases the store after trying to send pending changes; an expired session keeps it. One rule each, linking the ADR and the measurement — no narration (the gate warns on it).
- [ ] **Step 3: `CONCEPTS.md`**: add **Store Owner** (the account the on-device store belongs to; set at the first sync, cleared by a user sign-out); in the LWW entry, "signing in merges rather than duplicates" applies to a store with no owner.
- [ ] **Step 4: `README.md` line 49**: "signing out erases this device's data, after sending what is pending".
- [ ] **Step 5: Run** `npm run check:docs && npx prettier . --check` — expected pass (the existing `deployment.md` warning only).
- [ ] **Step 6: Commit** — `git commit -m "docs: record the decision to bind the local store to one account"`

---

### Task 8: Live verification against PocketBase (no commit)

- [ ] **Step 1:** Start a throwaway PocketBase 0.39.3 from `pocketbase/pocketbase` with a scratch `--dir`, the repo's migrations plus a test-only migration seeding two password users (as in the measurement entry).
- [ ] **Step 2:** Run a temporary Vitest file (outside the committed tree) that drives the real `AuthService` with `PocketBaseRemote`: A signs in and syncs; `endSession()`; B signs in answering `'erase'` → B's account holds none of A's ids and B's `flush()` resolves `true`; A signs in again on a second fresh store → A's places are all there.
- [ ] **Step 3:** Delete the temporary file, stop the server, and put the observed results in the PR description.
