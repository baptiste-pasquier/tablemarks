---
title: Cache cross-origin assets in a service worker only in CORS mode — opaque responses make the bound a lie
date: 2026-06-13
category: conventions
module: pwa / map
problem_type: convention
component: frontend_stimulus
severity: high
related_components:
  - frontend
applies_when:
  - A service worker runtime-caches a third-party asset (map tiles, CDN images/fonts) with an entry or size bound
  - Using Workbox CacheFirst/StaleWhileRevalidate against a cross-origin host
  - The cache is meant to be "bounded" (maxEntries / maxAgeSeconds)
tags:
  - service-worker
  - workbox
  - cors
  - opaque-response
  - caching
  - pwa
  - storage-quota
---

# Cache cross-origin assets in a service worker only in CORS mode — opaque responses make the bound a lie

## Context

The offline map (R10) caches OSM tiles in a Workbox `CacheFirst` runtime cache, bounded to `maxEntries: 500`. The intent: a few browsed neighborhoods survive offline, well clear of the storage quota. But a cross-origin request made *without* CORS doesn't behave the way "500 small tiles" suggests.

## Guidance

**A cross-origin fetch without CORS returns an _opaque_ response (status `0`), and the browser pads each cached opaque response to a large fixed size to prevent cross-origin size leakage** — on the order of **~7 MB in Chrome**, regardless of the asset's real size (a tile is a few KB). So an *entry-count* cap does not bound *bytes*: 500 opaque tiles ≈ **1.4 GB+**, which blows the storage quota, triggers eviction, and turns the "bounded" offline cache into one that silently evicts itself. Workbox's `CacheFirst` also won't store opaque responses by default (a status-0 response could be a hidden 404), so a naive setup may cache *nothing*.

**Fix: request the asset in CORS mode so the response is non-opaque (status 200), then cache only 200s.** Concretely:

- Set the request to CORS mode at the source — e.g. `crossOrigin="anonymous"` on the `<img>`/tile layer, or `mode: 'cors'` in a manual fetch.
- Confirm the host actually sends `Access-Control-Allow-Origin` (OSM tiles send `*`). If it doesn't, CORS mode is impossible and you must accept opaque caching's cost (or not cache).
- In the Workbox rule: `cacheableResponse: { statuses: [200] }` + an `ExpirationPlugin` with `maxEntries`/`maxAgeSeconds` and `purgeOnQuotaError: true` as a backstop.

**Tradeoff to weigh:** CORS mode makes the bound real, but it also means that if the host ever stops sending CORS headers, the tile fetch *hard-fails* (blank tile) instead of silently caching opaque — so the CORS-mode choice depends on the host's contractual CORS support.

## Why This Matters

The entry cap reads like a safety bound but, with opaque responses, it bounds the wrong dimension. The failure is silent and delayed: the cache fills with multi-MB padded entries, hits quota, and starts evicting the very tiles offline mode depends on — exactly the opposite of the feature's intent. Knowing the opaque-padding rule turns "why is my 500-entry cache using a gigabyte / evicting everything?" from a debugging session into a one-line `crossOrigin` decision made up front.

## When to Apply

- Any service-worker runtime cache of a cross-origin asset where you've set an entry or age bound and expect it to hold — map tiles, CDN images, web fonts, third-party avatars.
- Before trusting a `maxEntries` cap: ask "are these responses opaque?" If the request isn't CORS-mode and the host is cross-origin, the byte-bound is a lie until you fix the fetch mode.

## Examples

**Request the asset in CORS mode at the source (react-leaflet tile layer):**

```tsx
<TileLayer url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" crossOrigin="anonymous" />
```

**Cache only non-opaque 200s, bounded, with a quota backstop (Workbox `generateSW`):**

```ts
runtimeCaching: [{
  urlPattern: ({ url }) => url.hostname === 'tile.openstreetmap.org',
  handler: 'CacheFirst',
  options: {
    cacheName: 'osm-tiles',
    expiration: { maxEntries: 500, maxAgeSeconds: 60 * 60 * 24 * 7, purgeOnQuotaError: true },
    cacheableResponse: { statuses: [200] }, // non-opaque only — depends on the CORS-mode fetch above
  },
}]
```

## Related

- Same PR's service-worker update prompt has its own sharp edges worth remembering: `updateServiceWorker(true)` triggers a reload, so the Reload control needs an in-flight guard (a double-click would fire it twice), and because the activating worker claims all clients, the reload fires in *every* open tab — not just the one clicked.
- Source: `vite.config.ts` (Workbox `runtimeCaching`), `src/features/map/MapView.tsx` (`crossOrigin`), `src/features/pwa/ReloadPrompt.tsx`.
