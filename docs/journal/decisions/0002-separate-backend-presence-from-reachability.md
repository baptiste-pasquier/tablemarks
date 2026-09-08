---
status: "accepted"
date: 2026-09-08
decision-makers: [Baptiste Pasquier]
---

# Hold backend presence and backend reachability as two independent signals

## Context and Problem Statement

"Is a backend configured at all?" and "is that backend answering right now?" are different
questions, and the two-target deployment makes both live at once. The public demo has no
backend by design; a private instance that is merely down still has one. Collapsing them
into a single boolean makes an outage indistinguishable from the demo, so a user whose
server is down would see the app quietly present itself as a local-only build.

The signals also resolve at different times. Presence comes from a local file fetched at
startup (see [ADR-0001](0001-read-the-backend-location-at-runtime.md)) and settles
immediately. Reachability comes from a health check against a remote host and settles later,
if at all.

Affected components: application bootstrap, the header's Sign in control, the sync status
surface, and the two long-lived controllers whose start becomes conditional on presence.

## Decision Drivers

* A configured-but-down instance must never render as a deliberately backend-free build.
* The demo must never render a control that cannot work.
* The private instance must not pay a startup delay for the common case.
* Cross-cutting reactive state should follow the shape the repository already uses.

## Considered Options

* **Two independent fields, resolved in order** — presence first from the local file,
  reachability later from a health check.
* **Optimistic render** — show the Sign in control immediately, remove it once presence
  resolves to absent.
* **Block on a health check** — hold the shell until the backend answers, then render with
  one settled answer.

## Decision Outcome

Chosen option: **two independent fields, resolved in order**, held as separate fields in a
module-singleton store and read through `useSyncExternalStore`. Presence settles from the
local file and gates what renders; reachability arrives afterwards, and no reachability
indicator renders while it is still unknown.

The optimistic render was rejected because the demo would flash a dead Sign in control on
every load — a control that is guaranteed never to work, shown to every visitor of the
target that has the most visitors. Blocking on the health check was rejected because it
charges every private-instance startup a network round trip to protect against the rarer
case.

Resolution has **three** outcomes, not two: configured, absent, and unavailable — the
configuration file itself could not be read. Unavailable maps to *configured but
unreachable*, never to *absent*. Mapping it to absent would mean an installed app launched
with no network hides sign-in, skips the controllers, and never recovers for the life of
that tab. Unavailable stays distinguishable from a known-address-unreachable state as well:
with no address the Sign in control has no target, so it renders disabled rather than active.

The store follows the repository's existing pattern — a listener set, a current value, and
`emit`/`get`/`subscribe` — as in `src/sync/syncStatus.ts` with its
`src/sync/useSyncStatus.ts` hook. There is no React context anywhere in `src/`, and this
decision does not introduce one.

### Consequences

* Good, because an outage and the demo are visibly different states, and the demo shows no
  control that cannot work.
* Good, because a no-network launch of a configured deployment degrades to "backend
  unreachable" and recovers when the network returns, instead of latching into local-only.
* Bad, because two fields mean more states to reason about at every consumer, including the
  "reachability not yet known" state that must render nothing rather than render a guess.
* Bad, because the health check is an additional request on every startup of a configured
  deployment.

### Confirmation

Three acceptance tests in the Vitest suite, one per outcome:

| Given | Then |
| --- | --- |
| `config.json` carries an empty backend URL | no Sign in control, Settings still reachable, zero `fetch` and `EventSource` calls |
| `config.json` carries a URL, the instance does not answer | Sign in control present, status reports the backend unreachable, the app does not present itself as local-only |
| an installed app launched with no network | reports the backend unreachable, does not present itself as local-only |

The store's own unit tests cover the three-outcome resolution directly, including that an
unreadable configuration file resolves to configured-but-unreachable rather than absent.

## More Information

Companion record: [ADR-0001](0001-read-the-backend-location-at-runtime.md), which covers
where the backend URL comes from. Implementation plan:
[`../plans/2026-09-08-0030-feat-two-target-deployment-plan.md`](../plans/2026-09-08-0030-feat-two-target-deployment-plan.md).

Controllers are started at startup rather than as a side effect of signing in — that
constraint is why presence must settle before the bootstrap decides whether to start them:
[`../solutions/architecture-patterns/restart-controllers-on-startup.md`](../solutions/architecture-patterns/restart-controllers-on-startup.md).
