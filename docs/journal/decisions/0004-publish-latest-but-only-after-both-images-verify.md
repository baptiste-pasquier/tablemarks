---
status: "accepted"
date: 2026-09-18
decision-makers: [Baptiste Pasquier]
---

# Publish a moving `latest` tag, written only after both images verify

## Context and Problem Statement

The private stack runs two images that must never advance independently: `tablemarks-app` and
`tablemarks-pocketbase`. A new app against an old PocketBase is a bug nobody can reproduce.

The two-target deployment work closed that hazard by publishing **only** the commit SHA and making
`TABLEMARKS_IMAGE_TAG` mandatory, so an unset tag stopped the deploy rather than resurrecting
whatever a moving tag pointed at (recorded as KTD7 in
[the two-target deployment plan](../plans/2026-09-08-0030-feat-two-target-deployment-plan.md)).

That shifted the cost onto every upgrade. The operator has to read a 40-character SHA out of a run
summary and paste it correctly, twice, before anything can be pulled — and an existing Docker stack
that addresses these images as `latest` cannot use them at all. A deployment step that is tedious
enough gets skipped or automated badly, which is its own reliability problem.

The question is whether a moving tag can exist without reopening the split-rollout hazard.

## Decision Drivers

* An upgrade must not require transcribing a commit SHA.
* The two images must still be impossible to advance independently.
* Pinning and rolling back must keep working exactly as they do now.
* No new moving part on the host: whatever makes this safe belongs in the publish workflow.

## Considered Options

* Publish `latest` from the build job, alongside the SHA
* Publish `latest` from the `verify` job, after both images are confirmed present
* Keep SHA-only and put the SHA lookup in a host-side helper script

## Decision Outcome

Chosen option: **publish `latest` from the `verify` job**.

`verify` already exists and already carries the property this needs. It runs under `needs: image`,
which on a matrix job means every leg succeeded, and it re-reads both manifests from the registry
before writing anything an operator will act on. Moving `latest` there — with
`docker buildx imagetools create`, which points a second tag at an existing manifest list rather
than rebuilding — inherits that gate for free.

The original decision's *stated* hazard was never the moving tag itself. It was that a run which
published one image and failed the other would leave the moving tag naming two different commits.
That failure mode is what `verify` was built to catch, so the tag can move as long as it moves
there and nowhere else.

Publishing `latest` from the build job was rejected for exactly that reason: the matrix legs run
independently and `fail-fast: false` lets one succeed alone, which is the hazard verbatim.

A host-side helper was rejected as the wrong location. It would put a second moving part on every
machine that deploys, to work around a registry tag the registry is perfectly able to hold.

### Consequences

* Good, because an upgrade is `docker compose pull && docker compose up -d`, with nothing to
  transcribe and nothing to get wrong.
* Good, because `latest` on a failed run stays on the last complete release rather than moving to a
  half-published one.
* Good, because a Docker stack that already addresses these images as `latest` works unchanged.
* Bad, because two consecutive registry calls are not one transaction. A pull landing between the
  two `imagetools create` calls takes a new app against an old PocketBase. The window is two API
  calls wide with no build in it, and pinning a SHA removes it entirely.
* Neutral, because pinning and rollback are unchanged: both Compose services still read one
  variable, and setting it to a commit SHA still addresses that exact release.

### Confirmation

`verify` fails the run if any image is not retrievable at the run's SHA, and `latest` is written in
the same step, after that check, so the ordering cannot drift without the step being rewritten. The
count guard in that step fails the job rather than passing an empty loop.

## More Information

Supersedes the `latest` half of KTD7 in
[the two-target deployment plan](../plans/2026-09-08-0030-feat-two-target-deployment-plan.md). The
rest of KTD7 — one variable addressing both images, so they cannot be moved independently — is
unchanged and is what makes this decision safe.

Operator-facing detail: [`how-to/deployment.md`](../../how-to/deployment.md).
