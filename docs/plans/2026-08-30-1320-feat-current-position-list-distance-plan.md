---
title: Current Position & List Distance - Plan
type: feat
date: 2026-08-30
topic: current-position-list-distance
artifact_contract: ce-unified-plan/v1
artifact_readiness: requirements-only
product_contract_source: ce-brainstorm
execution: code
---

# Current Position & List Distance - Plan

## Goal Capsule

- **Objective:** When the device can obtain a location fix, the user can see their own position on the map and glance at how far each saved restaurant is directly from the list, without panning the map or opening "Où manger ?".
- **Product authority:** This plan owns showing the device's real current position on the map and its distance to each restaurant in the main list only. The map-pan "anchor" and radius search already used by `src/features/decide/` are not touched or reused.
- **Open blockers:** None — the dialogue resolved every product decision below.

---

## Product Contract

### Summary

On app load, the app automatically requests the device's location once. When a fix comes back, a "you are here" marker appears on the map and every restaurant row in the main list shows its straight-line distance from that fix. When no fix is available, both surfaces look exactly as they do today.

### Key Decisions

- **Automatic fetch on load, not gated behind a tap** (session-settled: user-directed — chosen over reusing the existing "📍 Localiser" button as the only trigger, which is today's explicit-opt-in pattern for geolocation: the user wants the pin and distances to appear without an extra action). Governs R1, R6.
- **Any successful fix counts as "available"** (session-settled: user-directed — chosen over gating on `position.coords.accuracy`: keeps behavior simple and matches `geolocate()`, which already doesn't inspect accuracy). Governs R1, R3.
- **List order is unchanged; distance is added information only** (session-settled: user-directed — chosen over sorting the list nearest-first now that distance is visible). Governs R4.

### Requirements

**Map position**
- R1. On app load, the app attempts to obtain the device's location once; when a fix comes back, a distinct "current position" marker appears on the map at that point, visually distinct from restaurant pins.
- R2. Tapping the existing "📍 Localiser" button re-fetches the location and refreshes the current-position marker, in addition to its existing recenter-the-map behavior — it is not a separate, unrelated fetch.

**List distance**
- R3. Whenever a device location fix is available (from R1 or R2), every restaurant row in the main list (`src/features/RestaurantList.tsx`) shows its straight-line distance from that fix, formatted the way `DecidePanel` already formats distance (meters below 1 km, one decimal km above).
- R4. The list's current sort order and facet filtering (`src/features/facets/filter.ts`) are unchanged; distance is additional per-row information, not a new sort key.
- R5. A restaurant with no resolved coordinates (a provisional record, per `src/features/decide/candidates.ts`'s existing exclusion) shows no distance.

**Fallback**
- R6. When no location fix is available — permission denied, timeout, or no Geolocation support — the map shows no current-position marker and the list shows no distances; nothing else changes and no error is surfaced to the user.

### Key Flows

- F1. Automatic fetch on load
  - **Trigger:** The app mounts.
  - **Steps:** The app calls the existing `geolocate()` once; on success the fetched point becomes the shared "current position" used by both the map marker and the list; on failure, timeout, or no support, that state stays unset and both surfaces render as they do today.
  - **Covers:** R1, R3, R6

- F2. Manual refresh via "Localiser"
  - **Trigger:** The user taps the map's existing "📍 Localiser" button.
  - **Steps:** The existing recenter-the-map behavior runs unchanged; the same fetched point also replaces the shared "current position", updating the marker and every list distance.
  - **Covers:** R2

### Acceptance Examples

- AE1. **Covers R1, R6.** Given the user opens the app and grants the location permission prompt, when a fix returns, then a "you are here" marker appears on the map without any extra tap.
- AE2. **Covers R6.** Given the user denies the location prompt (or no fix arrives before the timeout), when the app finishes loading, then no current-position marker appears and no list row shows a distance — the app looks exactly as it does today.
- AE3. **Covers R3, R5.** Given a mix of restaurants with and without resolved coordinates, when a location fix is available, then rows with coordinates show a distance and provisional/coordinate-less rows show none.
- AE4. **Covers R2.** Given the app already has a current-position marker from the load-time fetch, when the user taps "Localiser" again after moving, then the marker and every list distance update to the new fix.

### Scope Boundaries

- **Deferred for later:** Continuous/live position tracking while the app stays open (`watchPosition`) — this plan only ever takes one fix per trigger (load, or a "Localiser" tap).
- **Outside this scope:** The map-pan "anchor" and radius search used by "Où manger ?" (`src/features/decide/`) are untouched and keep working exactly as today, independent of this new device-location concept. Sorting the list by distance is explicitly out of scope (R4).

### Dependencies / Assumptions

- Reuses `geolocate()` (`src/lib/geolocate.ts:13`) and `haversineMeters()` (`src/lib/geo.ts:9`) as-is; no new geolocation or distance-math capability is needed.
- Assumes a one-shot fetch per trigger, matching `geolocate()`'s existing contract, rather than continuous tracking — consistent with the "simple distance" framing and the absence of any `watchPosition` use elsewhere in the codebase.
- The distance-formatting helper currently lives inline in `DecidePanel.tsx:12` (`formatDistance`); reusing it for the list implies sharing it across both call sites, a planning-level detail.

### Sources / Research

- `src/lib/geolocate.ts:13` — `geolocate()`: resolves the device position once, or `null` on denial/timeout/no support; never rejects.
- `src/lib/geo.ts:6-18` — `haversineMeters()` and `DEFAULT_MAP_CENTER` (Paris fallback), already used for distance math.
- `src/features/map/MapView.tsx:99-104` — the existing "📍 Localiser" button already calls `geolocate()` and recenters the map; today it does not drop a marker or feed the list.
- `src/features/decide/candidates.ts:22-35` and `src/features/decide/DecidePanel.tsx:12-18` — the existing "Où manger ?" flow already computes and formats per-restaurant distance from a pannable map-center anchor, and already excludes deleted/pending/coordinate-less restaurants — the pattern this plan's list distance follows, without reusing the anchor itself.
- `src/App.tsx:31` — today's `anchor` state defaults to `DEFAULT_MAP_CENTER` and updates only from map panning (`onCenterChange`); this plan introduces a separate "current position" concept fed by real device geolocation instead.
- `src/i18n/locales/fr/translation.json:129` — `"locateAria": "Centrer sur ma position"` confirms geolocation is currently framed as an explicit, user-initiated action; R1 is a deliberate change from that pattern (see Key Decisions).
