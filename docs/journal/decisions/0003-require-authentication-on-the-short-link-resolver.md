---
status: "accepted"
date: 2026-09-09
decision-makers: [Baptiste Pasquier]
---

# Require authentication on the short-link resolver route

## Context and Problem Statement

`GET /api/tablemarks/resolve-short-link` was public by design: the browser cannot follow
Google's cross-origin redirect, and making the route callable without an account meant
short-link capture worked before signing in.

Two things changed that calculation at once.

The private deployment target puts PocketBase on the internet, so this route stops being a
localhost convenience and becomes the one endpoint a stranger can call with no credential.
And the route's fetch primitive changed: it now shells out to `curl` through `$os.cmd`
rather than calling `$http.send` in-process, because `$http.send` follows redirects and
exposes no final URL, which makes it unable to constrain where a redirect leads. Each call
therefore forks an operating-system process and negotiates a fresh TLS connection, where the
previous implementation reused Go's pooled client.

An unauthenticated `GET` that costs the caller a few bytes and the server a process is a
denial-of-service lever. Saturating the process table takes volume and nothing else — no
account, no token, no interesting payload.

Affected components: the resolver hook, the client's pending-record resolver, and the
operator's hardening checklist.

## Decision Drivers

* An internet-exposed instance must not answer an anonymous caller at the cost of a process.
* The redirect-reach constraint the resolver gained must not be given back to buy this.
* Hardening that can be versioned should be versioned, per KD5 and
  [ADR-0001](0001-read-the-backend-location-at-runtime.md)'s dividing line between topology
  and schema.
* A user who cannot resolve a link must not lose the paste.

## Considered Options

* **Require authentication on the route** — `$apis.requireAuth()`, as the sibling project's
  equivalent hook does.
* **Return to `$http.send`** — remove the process fork by going back to the in-process client.
* **Rate-limit in the hook** — a per-IP fixed-window counter in `$app.store()` keyed on
  `e.realIP()`.
* **Rely on the console rate limiter** — leave the route public and treat the limit as the
  operator step the deployment guide already lists.

## Decision Outcome

Chosen option: **require authentication on the route**, plus a shorter per-request bound on
the outbound fetch (`--connect-timeout 2`, `--max-time 4` instead of `--max-time 10`).

Returning to `$http.send` was rejected on two counts. It gives back the redirect-reach
constraint — the client follows up to ten redirects before returning and offers no way to
inspect or refuse the target, and its documented options are `url`, `method`, `body`,
`data`, `headers` and `timeout`, with no redirect control. And it does not even remove the
abuse lever: reading the final URL then requires downloading the destination page, so an
anonymous caller makes the server pull hundreds of kilobytes from Google per request. That
trades a process-exhaustion lever for a bandwidth-amplification one.

Rate-limiting in the hook was rejected as the *primary* control because a per-IP counter
needs `e.realIP()`, which is only meaningful once the trusted-proxy header is configured —
that is topology, and KD5 assigns topology to the operator. Authentication needs no such
setting. It also survives a `pb_data` restore, which every console setting does not.

Relying on the console limiter alone was rejected because nothing verifies it. It is a
checkbox in a manual sequence, it lives in the volume, and a restore from an earlier backup
silently removes it. It remains valuable as defence in depth; it is not the boundary.

The narrowing this accepts is exactly one case: a *configured* backend with a signed-out
user. With no backend configured the client refuses the paste before calling
(`src/capture/capture.ts`), so the public demo never reaches this route at all.

### Consequences

* Good, because the abuse lever closes in the repository rather than in a console, and it
  cannot be lost to a restore or a skipped checklist step.
* Good, because the redirect-reach constraint is kept.
* Good, because it composes with locking account creation: with both, the only surface a
  stranger can reach is the authentication endpoint itself.
* Bad, because a signed-out user of a configured instance no longer gets an immediate
  resolution — the paste saves as a provisional record instead.
* Bad, because the pending resolver gains a second trigger and a backoff exception, which is
  more lifecycle to reason about.

### Confirmation

The client already degrades correctly: a rejected resolve is caught and the paste saves as a
provisional record. Two behaviours were added to make the degradation recover promptly, both
covered by unit tests in `src/capture/resolvePending.test.ts`:

| Given | Then |
| --- | --- |
| a provisional record and a sign-in state change | the resolver retries immediately, without waiting for the next page load |
| a record whose earlier attempt earned a retry delay, and a sign-in state change | the delay is cleared before the retry |

The retry delay is cleared on a sign-in change and **not** on a reconnect. Reconnecting says
the network is back, which says nothing about a link that may simply be bad, so those
records keep waiting out their delay. A sign-in change removes the one failure cause the
resolver cannot retry its way out of.

The route's own behaviour has no automated coverage: it runs in PocketBase's goja VM, out of
reach of the Vitest suite.

## More Information

The two PocketBase-internals constraints this route is built around — handler scope
isolation, and `$http.send`'s redirect behaviour — are recorded with their evidence in
[`../solutions/database-issues/pocketbase-hook-handlers-cannot-see-file-level-scope.md`](../solutions/database-issues/pocketbase-hook-handlers-cannot-see-file-level-scope.md).

Raised by the code review of the two-target deployment change, where three reviewers found
the exposure independently.
