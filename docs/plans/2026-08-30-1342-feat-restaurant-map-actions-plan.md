---
title: Restaurant Modal Map Actions - Plan
type: feat
date: 2026-08-30
topic: restaurant-map-actions
artifact_contract: ce-unified-plan/v1
artifact_readiness: requirements-only
product_contract_source: ce-brainstorm
execution: code
---

# Restaurant Modal Map Actions - Plan

## Goal Capsule

- **Objective:** From the restaurant detail modal, a user can open the restaurant's location in Google Maps and start navigating to it, whenever the restaurant's location data supports it.
- **Means:** Two independently-conditioned link buttons on `RestaurantDetail.tsx`, built from the existing `mapsUrl`, `address`, `lat`, and `lng` fields on `Restaurant` — no new data captured, no geolocation permission requested.
- **Product authority:** The Product Contract below is authoritative for user-facing behavior. No open product blocker remains.
- **Execution profile:** Lightweight-depth software plan, `execution: code`.

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

### Outstanding Questions

**Deferred to Planning:**
- Exact button placement, icon choice (`lucide-react`, matching the app's existing convention), and visual styling within `RestaurantDetail.tsx`.
- Whether to extract `isHttpUrl` (currently a local, unexported helper in `DecidePanel.tsx:21-23`) into a shared utility or duplicate it for `RestaurantDetail.tsx`.
- i18n key names and label wording for both buttons.

### Sources / Research

- `src/features/visits/RestaurantDetail.tsx` — target modal component.
- `src/features/decide/DecidePanel.tsx:112-121` — existing pattern for a conditionally-rendered Google Maps link button, including the `isHttpUrl` guard (`DecidePanel.tsx:21-23`).
- `src/types/models.ts:53-68` — `Restaurant` type: `mapsUrl?: string`, `address?: string`, `lat: number | null`, `lng: number | null`.
- No existing helper builds a Google Maps URL from coordinates or an address; one is needed for R1's and R2's fallback paths, e.g. `https://www.google.com/maps/search/?api=1&query=<encoded address-or-lat,lng>` (search) and `https://www.google.com/maps/dir/?api=1&destination=<encoded address-or-lat,lng>` (directions).
