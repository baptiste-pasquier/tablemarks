---
title: Restaurant Modal Map Actions - Plan
type: feat
date: 2026-08-30
topic: restaurant-map-actions
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: ce-brainstorm
execution: code
---

# Restaurant Modal Map Actions - Plan

## Goal Capsule

- **Objective:** From the restaurant detail modal, a user can open the restaurant's location in Google Maps and start navigating to it, whenever the restaurant's location data supports it.
- **Means:** Two independently-conditioned link buttons on `RestaurantDetail.tsx`, built from the existing `mapsUrl`, `address`, `lat`, and `lng` fields on `Restaurant` — no new data captured, no geolocation permission requested.
- **Product authority:** The Product Contract below is authoritative for user-facing behavior. No open product blocker remains.
- **Execution profile:** Lightweight-depth software plan, `execution: code`.
- **Product Contract preservation:** Product Contract unchanged.

## Product Contract

### Summary

Add two independent, conditionally-visible action buttons to the restaurant detail modal: "Google Maps" opens the restaurant's location in Google Maps, and "Go to" opens turn-by-turn directions to it — each appearing only when the data needed to build its own link exists.

### Requirements

- R1. A "Google Maps" button opens `mapsUrl` in a new tab when it is a valid `http(s)` URL (same guard as `DecidePanel.tsx`'s existing `isHttpUrl` check); when `mapsUrl` is absent or invalid, it instead opens a Google Maps search link built from `address`, or from `lat`/`lng` when `address` is also absent.
- R2. A "Go to" button opens a Google Maps directions link whose destination is `address` when set, or `lat`/`lng` when `address` is absent.
- R3. Each button renders only when it can resolve a destination under its own rule (R1 for Google Maps, R2 for Go to); a restaurant with no `mapsUrl`, no `address`, and no `lat`/`lng` shows neither button.

### Key Decisions

- **"Go to" falls back to coordinates when no address is on file**, rather than staying strictly address-only — covers restaurants whose address hasn't resolved yet. Governs R2. (session-settled: user-approved — chosen over address-only: coordinates back-fill availability when the address text hasn't resolved)
- **"Google Maps" also falls back to a synthesized search link when `mapsUrl` is absent**, accepting the resulting near-duplication with "Go to" in that case (a search/pin view and a directions view remain two distinct actions even when built from the same data). Governs R1. (session-settled: user-directed — chosen over keeping the button strictly tied to a stored `mapsUrl`: the button should be available whenever any location data exists, not only when a link was explicitly captured)

### Scope Boundaries

- No user geolocation: "Go to" opens a destination-only directions link; it does not request the browser's location or compute a route from the user's current position.
- No new data captured or stored: both buttons read only the existing `mapsUrl`, `address`, `lat`, and `lng` fields already on `Restaurant` (`src/types/models.ts:53-68`).

### Acceptance Examples

- AE1. **Given** a restaurant with a valid `mapsUrl`, **when** the modal opens, **then** "Google Maps" opens that link in a new tab. **Covers R1.**
- AE2. **Given** a restaurant with no `mapsUrl` but an `address`, **when** the modal opens, **then** "Google Maps" opens a Google Maps search link built from the address. **Covers R1.**
- AE3. **Given** a restaurant with no `mapsUrl` and no `address` but `lat`/`lng` set, **when** the modal opens, **then** "Google Maps" opens a search link built from the coordinates, and "Go to" opens directions to the same coordinates. **Covers R1, R2.**
- AE4. **Given** a restaurant with an `address`, **when** the modal opens, **then** "Go to" opens directions to that address regardless of whether `mapsUrl` is set. **Covers R2.**
- AE5. **Given** a restaurant with no `mapsUrl`, no `address`, and no `lat`/`lng`, **when** the modal opens, **then** neither button renders. **Covers R3.**

### Sources / Research

- `src/features/visits/RestaurantDetail.tsx` — target modal component.
- `src/features/decide/DecidePanel.tsx:112-121` — existing pattern for a conditionally-rendered Google Maps link button, including the `isHttpUrl` guard (`DecidePanel.tsx:21-23`).
- `src/types/models.ts:53-68` — `Restaurant` type: `mapsUrl?: string`, `address?: string`, `lat: number | null`, `lng: number | null`.
- No existing helper builds a Google Maps URL from coordinates or an address; one is needed for R1's and R2's fallback paths, e.g. `https://www.google.com/maps/search/?api=1&query=<encoded address-or-lat,lng>` (search) and `https://www.google.com/maps/dir/?api=1&destination=<encoded address-or-lat,lng>` (directions).
- `src/lib/geo.ts` / `src/lib/geo.test.ts` — the repo's convention for a small, pure, tested `src/lib/` helper module.
- `src/i18n/locales/{en,fr}/translation.json` — `visitDetail.*` holds `RestaurantDetail.tsx`'s existing labels; `decide.directions` shows the French phrasing already used for a directions-style action ("Itinéraire").

---

## Planning Contract

### Key Technical Decisions

- KTD1. **Extract `isHttpUrl` into a new shared `src/lib/mapsLinks.ts` module, and update `DecidePanel.tsx` to import it there instead of keeping its own copy.** Governs R1. (session-settled: user-approved — chosen over duplicating the guard locally in `RestaurantDetail.tsx`: avoids a second copy of the same security-relevant URL-scheme check.)
- KTD2. **A single `resolveDestination` function decides the destination for both buttons:** `address` when set, else `"<lat>,<lng>"` when both coordinates are set, else `undefined`. Governs R1, R2, R3.
- KTD3. **Google Maps URLs use the no-API-key query-param formats:** `https://www.google.com/maps/search/?api=1&query=<destination>` for a search/pin view, and `https://www.google.com/maps/dir/?api=1&destination=<destination>` for directions, with `destination` URI-encoded. Both open the Google Maps app on mobile and maps.google.com on desktop. Governs R1, R2.
- KTD4. **Icons follow the app's existing `lucide-react` import convention** (currently only `Settings` in `src/App.tsx`): `MapPin` for "Google Maps", `Navigation` for "Go to".

### Assumptions

- Exact i18n copy for the two new labels (`visitDetail.googleMaps`, `visitDetail.goTo`) is chosen during implementation to match the app's existing tone; French can mirror the existing `decide.directions` ("Itinéraire") phrasing for "Go to" if that reads more naturally than a literal translation.
- Button placement inside `RestaurantDetail.tsx` follows the existing address/status line at the top of the modal, styled as secondary text links (matching `DecidePanel.tsx`'s directions link), not as primary CTA buttons.

---

## Implementation Units

### U1. Shared Google Maps link helpers

- **Goal:** Provide the destination-resolution and URL-building logic both buttons need, plus the shared `isHttpUrl` guard, in one tested module.
- **Requirements:** R1, R2, R3 (KTD1, KTD2, KTD3)
- **Dependencies:** none
- **Files:**
  - `src/lib/mapsLinks.ts` (new)
  - `src/lib/mapsLinks.test.ts` (new)
  - `src/features/decide/DecidePanel.tsx` (modify)
- **Approach:**
  1. Move `isHttpUrl` (currently `DecidePanel.tsx:21-23`) into `src/lib/mapsLinks.ts`, unchanged.
  2. Add `resolveDestination(restaurant: { address?: string; lat: number | null; lng: number | null }): string | undefined` per KTD2.
  3. Add `googleMapsSearchUrl(destination: string): string` and `googleMapsDirectionsUrl(destination: string): string` per KTD3, URI-encoding `destination`.
  4. Update `DecidePanel.tsx` to import `isHttpUrl` from `src/lib/mapsLinks` and remove its local definition; no behavior change.
- **Patterns to follow:** `src/lib/geo.ts` — small, pure, tested helper module shape.
- **Test scenarios:**
  - `resolveDestination` returns `address` when set, even if coordinates are also set.
  - `resolveDestination` returns `"lat,lng"` when `address` is unset and both coordinates are set.
  - `resolveDestination` returns `undefined` when `address` is unset and either coordinate is `null`.
  - `googleMapsSearchUrl` and `googleMapsDirectionsUrl` URI-encode a destination containing spaces and commas, embedding it under the correct query parameter.
  - `isHttpUrl` accepts `http://` and `https://`, and rejects `undefined`, an empty string, and a `javascript:` URL.
- **Verification:** `src/lib/mapsLinks.test.ts` passes; `DecidePanel.test.tsx` still passes unchanged.

### U2. Restaurant modal location action buttons

- **Goal:** Render the "Google Maps" and "Go to" buttons in `RestaurantDetail.tsx` per R1–R3.
- **Requirements:** R1, R2, R3, AE1–AE5
- **Dependencies:** U1
- **Files:**
  - `src/features/visits/RestaurantDetail.tsx` (modify)
  - `src/features/visits/RestaurantDetail.test.tsx` (modify)
  - `src/i18n/locales/en/translation.json` (modify)
  - `src/i18n/locales/fr/translation.json` (modify)
- **Approach:**
  1. Compute `destination = resolveDestination(restaurant)`.
  2. Compute the "Google Maps" href: `isHttpUrl(restaurant.mapsUrl) ? restaurant.mapsUrl : (destination ? googleMapsSearchUrl(destination) : undefined)`.
  3. Compute the "Go to" href: `destination ? googleMapsDirectionsUrl(destination) : undefined`.
  4. Render each as an `<a target="_blank" rel="noreferrer">` only when its href is truthy, near the existing status/address line.
  5. Add the `MapPin` and `Navigation` icons per KTD4, and the two new i18n keys in both locale files.
- **Patterns to follow:** `src/features/decide/DecidePanel.tsx:112-121` for the conditional `<a>` pattern; `RestaurantDetail.tsx`'s existing layout for placement.
- **Test scenarios:**
  - Covers AE1. Given a valid `http(s)` `mapsUrl`, "Google Maps" links to that URL.
  - Covers AE2. Given no `mapsUrl` but an `address`, "Google Maps" links to a search URL built from the address.
  - Covers AE3. Given no `mapsUrl`, no `address`, but `lat`/`lng` set, both buttons render, pointing at the coordinate-based search and directions URLs.
  - Covers AE4. Given an `address`, "Go to" links to a directions URL for that address regardless of `mapsUrl`.
  - Covers AE5. Given no `mapsUrl`, no `address`, and null `lat`/`lng`, neither button renders.
  - Edge case: an invalid (non-`http(s)`) `mapsUrl` is treated as absent — "Google Maps" falls back to the synthesized link when a destination resolves, or hides when none does.
- **Verification:** New cases in `RestaurantDetail.test.tsx` pass; existing cases in that file still pass.

---

## Verification Contract

| Command | Applicability | Done signal |
|---|---|---|
| `npm run test` | U1, U2 | `mapsLinks.test.ts`, updated `RestaurantDetail.test.tsx`, and unchanged `DecidePanel.test.tsx` all pass |
| `npm run build` | U1, U2 | `tsc --noEmit` reports no type errors |

## Definition of Done

- All Acceptance Examples (AE1–AE5) hold in `RestaurantDetail.test.tsx`.
- `DecidePanel.tsx`'s existing directions-link behavior is unchanged after the `isHttpUrl` extraction.
- Both new i18n keys have English and French copy; no hardcoded label text remains in `RestaurantDetail.tsx`.
- `npm run test` and `npm run build` pass.
- No leftover dead code from the `isHttpUrl` extraction (no unused local copy left in `DecidePanel.tsx`).
