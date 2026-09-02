---
title: Restart side-effecting controllers on startup — auth persistence is not runtime restoration
date: 2026-06-13
category: architecture-patterns
module: sync + auth (local-first)
problem_type: architecture_pattern
component: authentication
severity: high
related_components:
  - sync-engine
applies_when:
  - An auth SDK persists the session (token in localStorage / cookie) across reloads
  - A long-lived controller, listener, or background loop is started only as a side effect of the sign-in action
  - The app must keep doing background work (sync, polling, subscriptions) for an already-authenticated user
tags:
  - local-first
  - authentication
  - sync
  - app-bootstrap
  - lifecycle
  - pocketbase
---

# Restart side-effecting controllers on startup — auth persistence is not runtime restoration

## Context

In Tablemarks, signing in with Google starts a `SyncController` (push subscription, realtime subscribe, initial reconcile). PocketBase persists the auth token in `localStorage`, so after a page reload `pb.authStore.isValid` is true and the UI shows the user as signed in. But the controller is in-memory runtime state — a reload destroys it. Because it was started **only** inside `auth.signInWithGoogle()`, nothing restarted it on reload: the UI looked signed-in while sync was silently dead (no push, no pull) until the user signed out and back in. `auth.resume()` existed to restart it but had no call site.

## Guidance

Treat **persisted auth** and **live runtime state** as two separate things that must both be restored on startup. An SDK rehydrating a token tells you *who* the user is; it does not re-run any of the side effects your sign-in handler performed. For every controller, subscription, timer, or listener you start as a side effect of signing in, add an idempotent `resume()` and call it during app bootstrap:

```ts
// main.tsx (composition root) — restore runtime state for a persisted session
void auth.resume().catch((err) => console.error('[startup] sync resume failed', err))
```

```ts
// auth.ts — resume is the bootstrap-safe twin of sign-in; no-op when signed out
async resume(): Promise<void> {
  if (this.isSignedIn && this.user) {
    await this.controller.start(new PocketBaseRemote(this.user.id))
  }
}
```

Key properties:
- **Idempotent and safe when signed out** — bootstrap calls it unconditionally on every load, so it must no-op cleanly with no session.
- **Symmetric with sign-in** — the sign-in handler and `resume()` start the same controller the same way; they are two entry points to one start path, not duplicated logic.
- **Lives at the composition root** — wire it where the app boots (`main.tsx`), not inside a component that may mount/unmount.

## Why This Matters

The failure is silent. Nothing throws, the UI looks correct, and tests that exercise the sign-in *action* pass — the gap only appears across a reload, which unit tests in jsdom rarely simulate. For a local-first app the cost is data divergence: the user keeps editing, believes they are synced, and their devices quietly drift apart until the next manual sign-in. Any side-effecting subsystem started at sign-in (realtime subscriptions, polling, websockets, background queues) has the same trap.

## When to Apply

- Wiring any auth SDK that persists sessions (PocketBase, Firebase, Supabase, custom token-in-storage).
- Adding a new controller/subscription/loop that starts on sign-in — give it a `resume()` and call it at bootstrap in the same change.
- Reviewing a "works until I reload" bug in an authenticated background feature.

## Examples

Before — sync only ever started by the sign-in action:

```ts
// main.tsx
createRoot(root).render(<App />)   // signed-in session on reload → controller never started
```

After — bootstrap restores the runtime state a persisted session implies:

```ts
// main.tsx
void auth.resume().catch((err) => console.error('[startup] sync resume failed', err))
createRoot(root).render(<App />)
```

A regression guard worth adding even when the full resume path needs a live backend: assert `resume()` is a safe no-op when signed out (it now runs on every startup, signed-in or not).

## Related

- `src/auth/auth.ts` (`resume()`), `src/main.tsx` (bootstrap call), `src/sync/syncEngine.ts` (`SyncController`)
- A sibling concurrency lesson from the same subsystem: `SyncController.start()` must guard its async `subscribe().then(...)` against a `stop()` that already ran, or late-resolving subscriptions leak — the lifecycle of a side-effecting controller spans both bootstrap (this doc) and teardown.
