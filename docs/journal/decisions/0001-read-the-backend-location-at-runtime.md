---
status: "accepted"
date: 2026-09-08
decision-makers: [Baptiste Pasquier]
---

# Read the backend location at runtime from a served `config.json`, not from a build-time variable

## Context and Problem Statement

One source tree now produces two deployments: a private Docker stack that talks to
PocketBase, and a public GitHub Pages demo that has no backend at all. The app therefore
needs to learn *where* its backend lives — or that it has none — and the moment it learns
determines who can read the answer.

Until this decision, `src/sync/pocketbase.ts` read `import.meta.env.VITE_PB_URL` and fell
back to `http://127.0.0.1:8090`. That was the only build-time environment read anywhere in
`src/`, and Vite inlines such a read into the emitted bundle at build time.

Affected components: `src/sync/pocketbase.ts` (the shared client), the application
bootstrap in `src/main.tsx`, the container image and its entrypoint, and the GitHub Actions
workflow that builds the public demo.

## Decision Drivers

* The private instance's hostname must not travel inside artifacts that GitHub publishes.
* The same image must be startable against a different backend without a rebuild.
* The demo must be able to declare "no backend" rather than inherit a default one.
* The change should not require rewriting the module-scope PocketBase singleton.

## Considered Options

* **Build-time variable** — keep `VITE_PB_URL`, inlined by Vite, one build per target.
* **Runtime configuration file** — ship a `config.json` alongside the built assets and
  fetch it during startup, before anything touches the backend.

## Decision Outcome

Chosen option: **runtime configuration file**, because a build-time value is baked into
every artifact the build produces, and for the private target those artifacts are public.
The hostname would ship inside the container image's layers and inside the GitHub Actions
build log, readable by anyone who never visits the site. With runtime configuration the
image carries no hostname: the operator supplies the URL when the container starts, and the
entrypoint writes `config.json` next to the assets.

The PocketBase client made this cheap rather than structural. Its constructor performs no
network I/O and its `baseURL` is a public mutable field, so the module-scope singleton stays
exactly where it is and the base URL is assigned once configuration resolves. Realtime and
file URLs are built at call time from that mutable base, so no module-scope importer
captures the value at construction.

### Consequences

* Good, because the published image and the public build log contain no private hostname,
  and one image runs against any backend.
* Good, because the demo expresses "no backend" as data — an empty URL in a served file —
  rather than as a separate build configuration.
* Bad, because startup now awaits a fetch before anything touches the backend, which makes
  configuration resolution a single point of failure for the whole startup path. Mitigated
  by a bounded timeout, a three-outcome resolution (see
  [ADR-0002](0002-separate-backend-presence-from-reachability.md)), and rendering the shell
  from a `finally` so no failure mode leaves a blank page.
* Bad, because the deployed asset set gains a file that must exist; a missing `config.json`
  is an operational failure mode that a build-time value did not have.

### Confirmation

A bootstrap test in the Vitest suite asserts that a deployment whose `config.json` carries
an empty backend URL makes no backend call: `fetch` and `EventSource` spies each record zero
calls. The assertion counts calls rather than inspecting their origin, because an empty base
URL resolves against the app's own origin and an origin-scoped assertion cannot see the leak.

A review step covers the rest: any reappearance of `import.meta.env` in `src/` is the
regression this record exists to prevent, and `grep` over the built image's layers must not
find the private hostname.

## More Information

The deployment URL is not a secret in any strong sense — it appears in Certificate
Transparency logs the moment TLS is issued for it. What runtime configuration closes is the
GitHub-side exposure: public image layers and public build logs. It does not make the host
undiscoverable, and no security property should be claimed on that basis.

Companion record: [ADR-0002](0002-separate-backend-presence-from-reachability.md), which
covers what the app does with the value once it is read. Implementation plan:
[`../plans/2026-09-08-0030-feat-two-target-deployment-plan.md`](../plans/2026-09-08-0030-feat-two-target-deployment-plan.md).
Current shape of the sync design: [`../../explanation/architecture.md`](../../explanation/architecture.md).
