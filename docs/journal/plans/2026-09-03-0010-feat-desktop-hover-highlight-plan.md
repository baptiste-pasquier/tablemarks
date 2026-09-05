---
title: Desktop Hover Highlight - Plan
type: feat
date: 2026-09-03
topic: desktop-hover-highlight
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: ce-brainstorm
execution: code
status: shipped
---

# Desktop Hover Highlight - Plan

## Goal Capsule

- **Objective:** Someone browsing restaurants on desktop can immediately see which map pin corresponds to a restaurant they're pointing at in the list, with no change to the mobile experience or to today's restaurant-detail modal.
- **Means:** Add a `hoveredId` state that mirrors the existing `selectedId`-driven pin halo, threaded from `RestaurantList`'s card hover through `App.tsx` to `MapView`'s marker rendering (KTD1-KTD3).
- **Authority hierarchy:** Product Contract constrains Planning Contract; Planning Contract constrains Implementation Units. A conflict resolves in favor of the higher layer.
- **Stop conditions:** Stop and flag if giving `iconForColor` an OR'd `selected` boolean (selection OR hover) conflicts with `pinHtml`'s cache, which is keyed on `color:selected` (`src/features/map/MapView.tsx`).
- **Execution profile:** Standard interactive implementation; no autonomous rollout.
- **Tail ownership:** The implementer runs the Verification Contract commands; no autonomous shipping tail is in scope.

This plan implements only the Hover Highlight portion of the brainstorm's Product Contract (R1-R3). The zoom-on-open behavior (R4-R6) and the desktop floating-panel redesign (R7-R11) remain documented below as settled product decisions, deferred to a follow-up plan per explicit user direction (see Scope Boundaries).

---

## Product Contract

**Product Contract preservation:** unchanged — all R/KD/F/AE IDs and text are preserved verbatim from the brainstorm. This plan's Implementation Units cover R1-R3 (and verify R12) only; R4-R11 are deferred to a follow-up plan (see Scope Boundaries).

### Summary

This plan adds a `hoveredId` state, threaded from `RestaurantList` through `App` to `MapView`, so hovering a restaurant card gives its map pin the same halo `MapView` already renders for a selected pin. No new visual style is introduced, and no other behavior from the brainstorm's fuller scope (zoom-on-open, the floating detail panel) is touched in this pass.

### Problem Frame

Today, `RestaurantList` and `MapView` already render side by side on desktop, but nothing connects them until a restaurant is actually opened — scanning the list gives no visual cue about where a restaurant sits on the map. `MapView` already has a "selected" pin halo (`iconForColor`/`pinHtml`), driven by `selectedId`, but nothing drives it from a hover.

### Key Decisions

- **KD1. Hover-highlight reuses the same pin halo as an open restaurant, with no forced map pan.** (session-settled: user-directed — chosen over a visually distinct hover style and over auto-panning to reveal an off-screen pin; reconfirmed after learning the list stays interactive while a panel is open.) Governs R1, R2, R3.
- **KD2. Opening any restaurant's detail always snaps the map to one fixed, close zoom level on that point, in about 250ms, regardless of entry point.** (session-settled: user-directed — chosen over a slower swoop animation, over zooming relative to the current level, and over restricting the trigger to list-originated opens only.) Governs R4, R5. *(Deferred — see Scope Boundaries.)*
- **KD3. The map keeps its zoomed position after the panel closes.** (session-settled: user-directed — chosen over animating back to the pre-open view, for simplicity and no state to restore.) Governs R6. *(Deferred — see Scope Boundaries.)*
- **KD4. Desktop's restaurant detail becomes a floating panel docked beside the restaurant list, layered over the map, replacing today's full-screen modal.** (session-settled: user-directed — chosen after visually comparing a right-docked side panel, the current centered modal, a centered modal with an embedded mini-map, and a full-screen split view; refined further to dock from the left, immediately after the (unchanged) list column, with the map re-centering so the target pin stays clear of the panel.) Governs R7, R8, R9. *(Deferred — see Scope Boundaries.)*
- **KD5. The list stays interactive while a panel is open, and closing is explicit.** (session-settled: user-directed — clicking another restaurant swaps the open panel directly rather than requiring it to close first; closing is limited to an explicit close control and Escape, rejecting a click-elsewhere-on-map affordance that risked accidental dismissal while panning.) Governs R10, R11. *(Deferred — see Scope Boundaries.)*
- **KD6. The new desktop behavior activates at the app's existing ≥768px breakpoint.** (session-settled: user-directed — chosen over introducing a wider, dedicated breakpoint just for this panel.) Governs R7. *(Deferred — see Scope Boundaries.)*
- **KD7. Mobile is untouched.** (session-settled: user-directed — reaffirmed explicitly as a hard constraint: the list/map toggle and the full-screen restaurant-detail sheet behave exactly as they do today below the desktop breakpoint.) Governs R3, R12.

### Requirements

**Hover highlight** *(this plan's scope)*

- R1. On desktop (≥768px), hovering a restaurant card in the list highlights its corresponding pin on the map using the same halo styling as an open restaurant's pin. Governs: KD1.
- R2. Hovering never pans or re-centers the map, even when the hovered restaurant's pin is outside the current view. Governs: KD1.
- R3. Hover highlighting has no effect below the desktop breakpoint. Governs: KD1, KD7.

**Zoom on open** *(deferred to a follow-up plan)*

- R4. Opening a restaurant's detail on desktop — via a list click, a map pin click, or any other existing flow that opens it — triggers a roughly 250ms map animation to a fixed, close zoom level centered on that restaurant. Governs: KD2.
- R5. The zoom always targets the same fixed level, independent of the map's zoom when the detail was opened. Governs: KD2.
- R6. After the panel closes, the map remains at its zoomed position; nothing animates it back toward the pre-open view. Governs: KD3.

**Desktop panel layout** *(deferred to a follow-up plan)*

- R7. On desktop, opening a restaurant's detail renders a floating panel docked immediately after the restaurant list, positioned over the map rather than in its own layout column, with no full-screen dark backdrop. Governs: KD4, KD6.
- R8. While the panel is open, the map re-centers so the open restaurant's pin stays visible in the portion of the map not covered by the panel. Governs: KD4.
- R9. The restaurant list stays visible at its current width and position whether or not a panel is open. Governs: KD4.
- R10. Clicking a different restaurant in the list while a panel is already open replaces the panel's content and re-triggers the zoom onto the new restaurant, without requiring the current panel to close first. Governs: KD5.
- R11. The panel closes only via its explicit close control or the Escape key; clicking elsewhere on the map does not close it. Governs: KD5.

**Mobile (non-regression)** *(this plan's scope — R12 constrains this pass too)*

- R12. Below the desktop breakpoint, the list/map toggle and the restaurant detail's current full-screen presentation are unchanged by this work. Governs: KD7.

### Key Flows

- F1. Hover preview *(this plan's scope)*
  - **Trigger:** The user moves the mouse over a restaurant card in the list (desktop only).
  - **Steps:** The corresponding pin gains the halo styling; moving off the card removes it; the map does not move.
  - **Covers:** R1, R2, R3.
- F2. Open a restaurant's detail *(deferred)*
  - **Trigger:** The user clicks a restaurant in the list, clicks its pin on the map, or reaches it via another existing flow.
  - **Steps:** The floating panel opens beside the list with that restaurant's detail; the map snaps to the fixed close zoom on that point, re-centered clear of the panel.
  - **Covers:** R4, R5, R7, R8, R9.
- F3. Switch restaurants while a panel is open *(deferred)*
  - **Trigger:** The user clicks a different restaurant in the list while a panel is already open.
  - **Steps:** The panel's content swaps to the new restaurant; the map re-runs its zoom snap on the new point.
  - **Covers:** R10.
- F4. Close the panel *(deferred)*
  - **Trigger:** The user clicks the panel's close control or presses Escape.
  - **Steps:** The panel closes; the map stays at its current zoomed position.
  - **Covers:** R6, R11.

### Acceptance Examples

- AE1. **Covers R10.** Given a panel is open for Restaurant A, when the user clicks Restaurant B in the list, then the panel's content switches to B and the map re-zooms to B's location, with no intermediate closed state. *(Deferred.)*
- AE2. **Covers R4, R5.** Given the user opens Restaurant A by clicking its pin directly on the map while already near the target zoom level, when the panel opens, then the map still runs its ~250ms snap to the fixed zoom level on that point — the behavior is uniform regardless of entry point or starting zoom. *(Deferred.)*
- AE3. **Covers R6, R11.** Given a panel is open, when the user presses Escape or clicks the panel's close control, then the panel closes and the map remains at its current zoomed position; clicking an empty area of the map while the panel is open does not close it. *(Deferred.)*
- AE4. **Covers R3, R12.** Given the viewport is narrower than the desktop breakpoint, when the user taps a restaurant in the list, then the existing full-screen detail sheet opens exactly as it does today, with no hover-highlight, no floating panel, and no automatic zoom. **This plan's Verification Contract exercises the "no hover-highlight" clause.**

### Success Criteria

- Manually verified in a running dev server at both a common desktop width and a common mobile width: hovering a restaurant card highlights the matching pin at desktop width, and has no visible effect at mobile width.
- The hover halo reads as the same visual language as an open restaurant's pin, not a new or distinct style.

### Scope Boundaries

#### Deferred to Follow-Up Work

- Zoom-on-open (R4-R6, KD2-KD3) and the desktop floating-panel redesign (R7-R11, KD4-KD6) are out of scope for this implementation pass, at the user's explicit request when handing this brainstorm off to `ce-plan`. They are not abandoned — they remain documented above as settled product decisions for a follow-up plan to enrich with its own Planning Contract and Implementation Units.

#### Other boundaries (carried from the brainstorm)

- Other panels built on the shared `Modal` component (Settings, Filters/Sort) keep their current full-screen presentation on every viewport; this work does not change `Modal`'s default behavior for those callers.
- Click-elsewhere-on-map-to-close and a dedicated wider breakpoint for the floating panel were both considered and rejected (KD5, KD6), not deferred for later.
- No equivalent of hover-highlight, the floating panel, or automatic zoom exists on mobile; that experience does not change at all (KD7).

### Outstanding Questions

- **Deferred to Planning (for the follow-up plan, not this one):** The exact fixed zoom level and the floating panel's width/max-height are left to that planning pass to choose, consistent with the app's existing spacing conventions (e.g. `--safe-area-floating-offset`).
- **Deferred to Planning (for the follow-up plan, not this one):** Confirm the left-docked floating panel does not visually clash with the existing right-docked Locate/zoom control stack or the top-pinned filter overlay introduced by `docs/plans/2026-09-01-0039-feat-filter-map-layout-relocation-plan.md`.

### Sources / Research

- `src/features/ui/Modal.tsx` — the shared modal shell: full-screen backdrop, focus trap, and the `panelClassName`/`zIndexClassName`/`initialFocus` variant surface reused by every current caller. *(Relevant to the deferred panel work, not this pass.)*
- `src/App.tsx` — the desktop/mobile layout switch (`md` breakpoint) and the `selectedId` state that already drives both the map's "selected" pin styling and the `RestaurantDetail` modal; this pass adds a sibling `hoveredId` state following the same pattern.
- `src/features/map/MapView.tsx` — the existing per-marker "selected" halo styling (`iconForColor`/`pinHtml`), reused unchanged by this pass's hover-highlight; the marker-rendering call site (`m.id === selectedId` passed as `iconForColor`'s `selected` argument) is where `hoveredId` is OR'd in.
- `src/features/RestaurantList.tsx` — the restaurant list cards; today's hover is a local CSS shadow change only (`hover:shadow-md`), with no map-facing effect.
- `docs/solutions/conventions/react-leaflet-test-mock-stability.md` — the project's convention for mocking `react-leaflet`'s `useMap` with a stable instance; relevant when extending `MapView.test.tsx`'s existing map mock.
- `docs/plans/2026-09-01-0039-feat-filter-map-layout-relocation-plan.md` — a sibling plan relocating the filter overlay and Locate/zoom controls on the same desktop map area. *(Relevant to the deferred panel work's outstanding question above, not this pass.)*

---

## Planning Contract

### Key Technical Decisions

- KTD1. Add a `hoveredId?: string | null` piece of state in `App.tsx`, sibling to the existing `selectedId` state, following the exact same prop-threading pattern: an `onHover?: (id: string | null) => void` callback passed to `RestaurantList`, and a `hoveredId` prop passed to `MapView` alongside `selectedId`. No new state-management approach is introduced. Governs R1.
- KTD2. In `RestaurantList`, add `onMouseEnter`/`onMouseLeave` and `onFocus`/`onBlur` handlers to each card's existing `<button>`, each pair calling `onHover(r.id)` / `onHover(null)` — the focus/blur pair gives keyboard users (Tab) the same highlight mouse users get. The card's existing `onClick` also calls `onHover(null)`, so a touch tap — which synthesizes a `mouseenter` with no matching `mouseleave` — never leaves a phantom halo lit on the map after the restaurant opens. Governs R1.
- KTD3. In `MapView`, at the marker-rendering call site, change the `selected` argument passed to `iconForColor` from `m.id === selectedId` to `m.id === selectedId || m.id === hoveredId`. `iconForColor` and `pinHtml` are otherwise unchanged — the halo they already render for `selected` is reused as-is (KD1). Governs R1.
- KTD4. No explicit desktop-only breakpoint gate is added for the hover effect. Mobile's existing mutually-exclusive list/map panes (the `view === 'list'` vs `'map'` toggle in `src/App.tsx`) already guarantee a hovered pin's halo is never on-screen at the same time as the hovering list card below the desktop breakpoint, since only one pane is ever visible at a time on mobile. (session-settled: user-directed — chosen over adding an explicit media-query/width check, confirmed in this plan's brainstorm-sourced scoping synthesis.) Governs R3.

---

## Implementation Units

### U1. Report hover state from the restaurant list

- **Goal:** `RestaurantList` exposes which restaurant card is currently under the mouse pointer.
- **Requirements:** R1 (KTD1, KTD2)
- **Dependencies:** none
- **Files:**
  - `src/features/RestaurantList.tsx`
  - `src/features/RestaurantList.test.tsx`
- **Approach:**
  1. Add an `onHover?: (id: string | null) => void` prop to `RestaurantList`, alongside the existing `onSelect` prop.
  2. Add `onMouseEnter={() => onHover?.(r.id)}`, `onMouseLeave={() => onHover?.(null)}`, `onFocus={() => onHover?.(r.id)}`, and `onBlur={() => onHover?.(null)}` to each card's existing `<button>` (KTD2).
  3. Also call `onHover?.(null)` from the card's existing `onClick` handler, alongside its unchanged `onSelect?.(r.id)` (KTD2) — so a touch tap clears any lingering hover state instead of leaving a phantom halo lit.
- **Patterns to follow:** the existing `onSelect` prop's shape and per-card wiring already in this file.
- **Test scenarios:**
  - Happy path: hovering a card calls `onHover` with that restaurant's id.
  - Happy path: moving the mouse off a card calls `onHover(null)`.
  - Happy path: focusing a card (e.g. via Tab) calls `onHover` with that restaurant's id; blurring it calls `onHover(null)` — the same effect as mouse hover.
  - Happy path: clicking a card calls both `onSelect` and `onHover(null)`, so a touch tap that synthesizes a `mouseenter` with no matching `mouseleave` still clears the hover state.
  - Edge case: omitting `onHover` does not throw when a card is hovered, focused, or clicked.
  - No regression: `onSelect`/click behavior is unaffected by the new hover/focus handlers.
- **Verification:** `npm run test -- RestaurantList` passes.

### U2. Highlight the hovered restaurant's pin and wire hover state end-to-end

- **Goal:** The map gives a hovered restaurant's pin the same halo as a selected one; `App` connects list hover to the map.
- **Requirements:** R1, R2, R3 (KTD1, KTD3, KTD4)
- **Dependencies:** U1
- **Files:**
  - `src/features/map/MapView.tsx`
  - `src/features/map/MapView.test.tsx`
  - `src/App.tsx`
  - `src/App.test.tsx`
- **Approach:**
  1. Add a `hoveredId?: string | null` prop to `MapView`, alongside the existing `selectedId` prop.
  2. At the marker-rendering call site, change the `iconForColor` call's `selected` argument from `m.id === selectedId` to `m.id === selectedId || m.id === hoveredId`.
  3. In `App.tsx`, add a `hoveredId` state (sibling to `selectedId`), pass `onHover={setHoveredId}` to `RestaurantList`, and pass `hoveredId={hoveredId}` to `MapView` alongside its existing `selectedId` prop.
- **Patterns to follow:** the existing `selectedId` prop-threading between `App`, `RestaurantList`, and `MapView`; `docs/solutions/conventions/react-leaflet-test-mock-stability.md` when extending `MapView.test.tsx`'s mocked map instance.
- **Test scenarios:**
  - Happy path: a marker whose id equals `hoveredId` renders with the same halo/size as a selected marker (mirrors the existing "renders the selected marker larger" test).
  - Happy path: a hover-only state change never calls the map's pan/re-center path (R2).
  - Edge case: a marker that is both the `selectedId` and the `hoveredId` still renders with one unchanged halo look, not a distinct "double" state.
  - Integration: hovering a `RestaurantList` card updates the corresponding `MapView` marker's halo end-to-end through `App`'s wiring.
  - Covers AE4. No regression: on a mobile-width viewport (`view: 'list'`), the restaurant list still opens the existing full-screen detail sheet, with no visible hover effect since the map pane is not shown.
- **Verification:** `npm run test -- MapView App` passes.

---

## Verification Contract

| Command                                             | Applies to | Done signal                                                                                      |
| --------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------ |
| `npm run test`                                      | U1, U2     | All existing and new tests pass                                                                  |
| `npm run lint`                                      | U1, U2     | `tsc --noEmit` reports no errors                                                                 |
| `npm run build`                                     | U1, U2     | Vite production build succeeds                                                                   |
| Manual: `npm run dev`, resize below and above 768px | U2         | Hovering a list card highlights its pin only at desktop width; no visible effect at mobile width |

## Definition of Done

- Requirements R1-R3 are implemented, and R12 (mobile non-regression) is verified unchanged, both covered by passing tests.
- `npm run lint`, `npm run test`, and `npm run build` all succeed.
- Manually verified in a running dev server that the hover halo matches the selected-pin halo, and has no visible effect below the desktop breakpoint.
- No dead or experimental code remains from approaches that did not pan out.
- R4-R11 (zoom-on-open, desktop panel redesign) are intentionally not implemented by this plan and stay documented above for a follow-up plan.
