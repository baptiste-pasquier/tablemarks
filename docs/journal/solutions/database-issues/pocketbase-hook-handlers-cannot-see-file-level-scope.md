---
title: PocketBase hook handlers run in an isolated VM and cannot see file-level scope
date: 2026-09-08
category: database-issues
module: pocketbase / pb_hooks
problem_type: bug
component: database
severity: high
related_components:
  - pocketbase
  - capture
applies_when:
  - Writing a `routerAdd` / `onRecord*` handler in a `pb_hooks/*.pb.js` file
  - Declaring a constant, regex or helper function at the top of a hook file
  - Reaching for `$http.send` to inspect where a URL redirects
tags:
  - pocketbase
  - pb-hooks
  - goja
  - scope
  - ssrf
  - redirects
  - short-links
---

# PocketBase hook handlers run in an isolated VM and cannot see file-level scope

Verified against PocketBase **0.39.3**, the version `docker/Dockerfile.pocketbase` pins. Both
findings were confirmed empirically against a running container, not read off
`pb_data/types.d.ts`.

## Context

`pocketbase/pb_hooks/resolveShortLink.pb.js` adds a public route,
`GET /api/tablemarks/resolve-short-link?url=...`, that turns a `maps.app.goo.gl` link into
coordinates. The browser cannot follow Google's cross-origin redirect, so the server does it.
Capture's short-link path is the only consumer.

The file was written the way any JavaScript module is written: an allowlist constant, a
destination-host regex and a small URL parser at the top, and the handler below them calling
into all three.

## Finding 1 — the handler body cannot see anything declared outside it

PocketBase executes each hook handler in its **own goja VM**, with no access to the enclosing
file's scope. A constant or a helper declared at file level raises `ReferenceError` the moment
the handler touches it.

The failure mode is what made this expensive. PocketBase does not surface the `ReferenceError`.
The caller gets a generic

```
400 {"message":"Something went wrong while processing your request."}
```

and the container log carries nothing that names the missing binding. The route answered every
real short link that way. Only the missing-parameter branch — the one guard that returned before
reaching any file-level name — ever produced a meaningful response, which made the route look
alive from a smoke test while resolving nothing.

### The rule

**Everything a hook handler uses is declared inside the handler.** Constants, regexes and helper
functions all move into the function body. The file may hold comments and the
`/// <reference>` line, nothing else that the handler needs at runtime.

The cost is duplication across handlers in the same file. Pay it. The alternative fails silently
in production and is invisible in the logs.

## Finding 2 — `$http.send` follows redirects and never tells you where it landed

`$http.send` ends in Go's `http.DefaultClient.Do`. That client follows up to **10 redirects** by
default, and no `CheckRedirect` hook is reachable from the JavaScript side.

Its result object exposes exactly `json`, `headers`, `cookies`, `raw`, `body`, `statusCode`.
There is **no final-URL field**, whatever the generated type definitions suggest.

Both properties are disqualifying for a resolver that has to *inspect* a redirect target before
trusting it:

| What the code wants | What `$http.send` does |
| --- | --- |
| Read the `Location` value and validate the host | Returns no final URL, so the destination is unknowable |
| Decide whether to fetch the destination | Has already fetched it, up to ten hops deep |

A destination allowlist written *after* the `$http.send` call is decoration: the request has
already gone wherever the upstream pointed. Confirmed with a canary host — a short link pointed
at it, and the canary logged the hit even though the destination check in the handler rejected
it afterwards.

### The rule

**Do not use `$http.send` when the redirect itself is the thing being inspected.** The hook
shells out to `curl` instead, with `--max-redirs 0`, `--proto '=https'`, `-o /dev/null` and
`--write-out '%{http_code} %{redirect_url}'`. `curl` returns the absolutised `Location` as a
string without following it, so the destination is validated before anything fetches it.

This makes `curl` a **load-bearing runtime dependency of the PocketBase image**, not a
convenience. `docker/Dockerfile.pocketbase` installs it and says so. Removing it makes the
resolver fail closed: the route returns `502` and capture falls back to the search and
full-URL paths.

## Scope

Both findings are properties of PocketBase 0.39.3's JSVM. The `$http` / router API shapes move
between minors, which is why the image pins an exact version rather than a floating tag. Re-verify
against a running container before moving the pin.

## Related

- [`../../decisions/0001-read-the-backend-location-at-runtime.md`](../../decisions/0001-read-the-backend-location-at-runtime.md)
  — why the app learns its backend location at runtime
- [`../../../how-to/deployment.md`](../../../how-to/deployment.md) — the deployment procedure that
  depends on this route working
