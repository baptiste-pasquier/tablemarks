---
title: A service worker's navigateFallback must skip every co-hosted backend path, not just the API
date: 2026-10-11
category: conventions
module: pwa / deployment
problem_type: convention
component: frontend_stimulus
severity: medium
related_components:
  - frontend
  - deployment
applies_when:
  - A reverse proxy serves PocketBase (or any backend) on the same origin as the PWA
  - Workbox `navigateFallback` is set to the SPA shell
  - A backend page is meant to be opened by navigation (an admin dashboard, an OAuth callback)
tags:
  - service-worker
  - workbox
  - navigate-fallback
  - reverse-proxy
  - pocketbase
  - pwa
---

# A service worker's navigateFallback must skip every co-hosted backend path, not just the API

## Context

The private stack sits behind a reverse proxy that routes `/` to the app container and both `/api/`
and `/_/` to PocketBase, on one hostname. The PocketBase dashboard at `/_/` showed the Tablemarks app
instead. The proxy configuration was correct: an identical setup for another app without a service
worker served its dashboard normally.

## Guidance

**`navigateFallback: 'index.html'` answers every navigation request the denylist does not exclude,
from the cache, without touching the network.** `navigateFallbackDenylist` held only `/^\/api\//`, so
a navigation to `/_/` was answered by the worker with the precached SPA shell and never reached the
proxy. A private window has no worker, so it is the quickest way to confirm the cause.

**Fix:** list every path prefix the backend owns on the shared origin — here
`[/^\/api\//, /^\/_\//]`.

Fetch and XHR calls are not affected: `navigateFallback` only handles `mode: 'navigate'` requests.
That is why the API kept working while the dashboard did not.

## Why This Matters

The failure is invisible from the server: the request never leaves the browser, so the proxy has
nothing to log, and a client without the worker, such as `curl`, is not affected. It shows only in
a browser that has installed the app, which is exactly the operator's own browser. A fixed worker reaches that browser only after the update prompt is accepted, so a private
window is the immediate workaround.

## When to Apply

- Adding a proxy route to the backend on the app's hostname: add its prefix to
  `navigateFallbackDenylist` in the same change.
- Debugging "this URL shows the app instead of X" on a PWA origin: retry in a private window before
  touching the proxy.

## Related

- Source: `vite.config.ts` (Workbox `navigateFallbackDenylist`).
- Operator-facing rule: `docs/how-to/deployment.md`, section "PocketBase on the app's origin".
