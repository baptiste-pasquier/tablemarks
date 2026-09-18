---
title: The PocketBase JS SDK replaces your abort signal unless requestKey is null
date: 2026-09-10
category: database-issues
module: src/sync
problem_type: bug
component: sync
severity: medium
related_components:
  - sync
  - auth
applies_when:
  - Passing `signal` to any `pb.*` call to bound how long it may hang
  - Reasoning about two overlapping requests to the same PocketBase endpoint
  - Reading a code review that suggests "just pass an AbortSignal"
tags:
  - pocketbase
  - js-sdk
  - abort-signal
  - timeouts
  - auto-cancellation
---

# The PocketBase JS SDK replaces your abort signal unless `requestKey` is null

`pb.health.check({ signal: AbortSignal.timeout(ms) })` does not time out. The SDK's
auto-cancellation, which is on by default, overwrites `signal` with its own controller's before
the request reaches `fetch`. Pass `requestKey: null` alongside it, or the bound is silently
discarded.

Verified against `pocketbase` JS SDK as vendored in this repo's lockfile, by test rather than by
reading: `src/sync/bootstrap.test.ts` fails with the signal alone and passes with both.

## Context

`bootstrap.ts` health-checks the backend after first paint to resolve reachability. `fetch` waits
forever by default, so a connection that is accepted and then never answered — a half-open socket,
a proxy holding the request — left the promise pending for the life of the tab. Reachability
stayed `unknown`, and `unknown` deliberately renders no indicator at all
([ADR-0002](../../decisions/0002-separate-backend-presence-from-reachability.md)), so the failure
was a silent hang rather than a visible error.

## What the SDK actually does

`initSendOptions`, from the bundled build:

```js
if (this.enableAutoCancellation && null !== t.requestKey) {
  const s = t.requestKey || (t.method || "GET") + e
  delete t.requestKey
  this.cancelRequest(s)
  const i = new AbortController()
  this.cancelControllers[s] = i
  t.signal = i.signal          // whatever the caller passed is gone
}
```

The assignment is unconditional inside that branch. `requestKey: null` is the documented way to
opt one request out of auto-cancellation, and it is also what keeps a caller-supplied `signal`.

## The rule

Bounding a `pb.*` call takes **both** options:

```ts
await pb.health.check({ requestKey: null, signal: AbortSignal.timeout(timeoutMs) })
```

And opting out has a consequence worth pairing with the fix. Auto-cancellation was serialising
overlapping calls: a second request cancelled the first. Without it, an online/offline flap can
leave two checks in flight, and a slow *earlier* one can resolve last and pin the store to an
out-of-date answer. `checkReachability` therefore carries a generation counter, incremented on
entry and compared before either write, so the newest check wins.

A `Promise.race` against a `setTimeout` is the alternative bound, and `runtimeConfig.ts` already
uses one — but as a belt on top of an abort that works, not as a substitute for one. A race alone
settles the promise while leaving the request open.

## What the review got right, and what it missed

Three reviewers found the missing bound independently, and an independent validator confirmed it.
The suggested fix was `pass AbortSignal.timeout(...)` — correct about the defect, wrong about the
mechanism. Applying it verbatim leaves the hang exactly as unbounded.

The test written for the finding is what caught this: a health route that resolves only when its
signal aborts. It fails on the no-signal version *and* on the signal-without-`requestKey` version.
A test asserting only that the option was passed would have gone green on a fix that does nothing.
