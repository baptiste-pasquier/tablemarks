---
title: UI Primitives Factoring - Plan
type: refactor
date: 2026-08-31
topic: ui-primitives
artifact_contract: ce-unified-plan/v1
artifact_readiness: requirements-only
product_contract_source: ce-brainstorm
execution: code
---

# UI Primitives Factoring - Plan

## Goal Capsule

- **Objective:** Inline Tailwind class duplication across `App.tsx`, `SortBar.tsx`, `FilterBar.tsx`, and several panels is eliminated behind a small set of reusable, tested UI primitives, so a future style change touches one file instead of five-plus call sites.
- **Means:** Extract `Button`, `Badge`, `ToggleChip`, `Eyebrow`, a `cn` class-merging helper, and a shared safe-area-floating utility from the existing duplicated markup, following the `Modal.tsx`/`ModalHeader.tsx` pattern already established in `src/features/ui/`.
- **Product authority:** `ce-brainstorm` session (seeded by the user's own code analysis, verified against the current codebase).
- **Open blockers:** none.

## Product Contract

### Summary

Extract six duplicated Tailwind patterns into shared, tested primitives under `src/features/ui/` — `Button`, `Badge`, `ToggleChip`, `Eyebrow`, a hand-written `cn` helper, and one shared safe-area-floating utility — reconciling the handful of small visual inconsistencies the duplication had let drift apart. `IconLabel` is not built: the icon+label call sites don't actually share duplicated classes.

### Problem Frame

`src/features/ui/Modal.tsx` and `ModalHeader.tsx` already establish a shared-primitive pattern (colocated tests, a `Record`-keyed variant map) reused by four panels. Everything else still copies Tailwind class strings by hand: the same "brand" button markup appears in five files, the same pill-button markup in three, the same section-title classes in three, and the same safe-area `calc()` formula in two — with no `cn`/`clsx` utility, so conditional classes are built with raw template literals. Small drift has already crept in between copies (see Key Decisions), which is the risk this pattern creates going forward: any small future style tweak has to be found and repeated at every call site, and some already weren't.

### Requirements

**Button**

- R1. A shared `Button` component (`src/features/ui/Button.tsx`) replaces the primary "brand" button markup duplicated in `App.tsx`, `AddPlace.tsx`, `DecidePanel.tsx`, `RestaurantDetail.tsx`, and `PortabilityPanel.tsx` (2 call sites there), rendering one canonical style — including hover/active states — at every call site.
- R2. The same `Button` component (via a documented variant) replaces the secondary pill-button markup duplicated in `App.tsx` (3 call sites), `SortBar.tsx`'s direction toggle, and `RestaurantDetail.tsx`'s pill button, with one canonical hover/active treatment.

**Badge**

- R3. `Badge` is extracted from `StatusBadge.tsx` into its own shared component and accepts either a Tailwind class (for the closed set of status/verdict colors) or an inline color style (for per-cuisine colors), so `RestaurantList.tsx`'s cuisine tag renders through the same component instead of reimplementing the visual pattern by hand.
- R4. The existing size/spacing/weight differences between the status badge and the cuisine tag are reconciled to one shared sizing so both read as the same visual "badge" language.

**ToggleChip**

- R5. A shared toggle-chip component replaces the `segmentClass` logic in `SortBar.tsx` and the local `Chip` component in `FilterBar.tsx`, exposing a shape option for the connected-segment group (SortBar's Distance/Date selector) versus the standalone pill (FilterBar's cuisine/status/verdict chips), while sharing one active/hover/disabled treatment.

**Eyebrow**

- R6. A shared `Eyebrow` (section-title) component replaces the duplicated `text-xs font-semibold uppercase tracking-wide text-gray-400` pattern in `SettingsPanel.tsx`, `SortBar.tsx`, and `FilterBar.tsx`.

**Shared utilities**

- R7. A hand-written `cn` helper (`src/lib/cn.ts`, no new dependency) replaces manual template-literal class concatenation, used at minimum inside the new primitives and wherever `FilterBar.tsx` / `ModalHeader.tsx` currently hand-concatenate classes.
- R8. The `bottom-[calc(var(--spacing-toggle-bar)+env(safe-area-inset-bottom)+1rem)]` formula duplicated in `App.tsx`'s FAB and `features/pwa/ReloadPrompt.tsx` is replaced by one shared definition (mechanism left to planning).

### Key Decisions

- **KD1. Uniformize discovered visual inconsistencies rather than preserve pixel-parity.** Extraction is also a small cleanup pass: `RestaurantDetail.tsx`'s brand-tinted secondary-button hover (`hover:bg-brand-soft` instead of the neutral `hover:bg-gray-100` used elsewhere), `PortabilityPanel.tsx`'s primary button (missing the `active:` states the other call sites have), and `AddPlace.tsx`'s primary button (`py-2` instead of the `py-2.5` used everywhere else) all converge on one canonical style — including one shared way of expressing the `disabled` state, which `AddPlace.tsx` and `PortabilityPanel.tsx` currently opt into ad hoc via `disabled:opacity-50` — instead of being preserved as one-off variants. (session-settled: user-approved — chosen over preserving each site's exact current rendering: pixel parity would complicate the shared component API for no real benefit.) Governs R1, R2.
- **KD2. Hand-written `cn` helper, no new dependency.** The repo has no class-merging utility today and the need is simple conditional concatenation, not Tailwind-aware merging. (session-settled: user-approved — chosen over adding `clsx`: the extra dependency isn't justified by the current need.) Governs R7.
- **KD3. One `Badge` component, two color-source modes.** Rather than a separate cuisine-tag component, `Badge` accepts either a Tailwind class or an inline color style, keeping one source of truth for size/padding/font. (session-settled: user-approved — chosen over two separate components: avoids two places to keep visually in sync.) Governs R3, R4.
- **KD4. One `ToggleChip`, shape-variant prop.** SortBar's connected-segment group and FilterBar's standalone chips share one component with a shape prop rather than being extracted as two components. (session-settled: user-approved — chosen over two separate components: shares the active/hover/disabled logic in one place.) Governs R5.
- **KD5. `IconLabel` is out of scope.** The four icon+label call sites (`SortBar.tsx`, `RestaurantDetail.tsx` ×3, `App.tsx`'s Settings trigger) don't share duplicated classes — each icon+text pair sits in its own container with its own gap/color — so a wrapper would add an abstraction without removing any real duplication. (session-settled: user-approved — chosen over adding an `IconLabel` wrapper: no real duplication exists to eliminate.)
- **KD6. `Eyebrow` covers only the cross-file section-title pattern.** `FilterBar.tsx`'s internal `text-[10px]` `GroupLabel` sub-labels (`Cuisine` / `Statut & verdict`) aren't duplicated anywhere else in the codebase, so `GroupLabel` stays a local component rather than folding into `Eyebrow`. Governs R6.

### Success Criteria

- Every call site named in R1-R8 renders through the corresponding shared component or helper; no leftover copy of the duplicated class strings remains in the changed files.
- Existing test suites (`App.test.tsx`, `RestaurantList.test.tsx`, and the rest) pass unchanged, and each new primitive gets its own colocated test file following the `Modal.tsx` / `Modal.test.tsx` convention already used in `src/features/ui/`.
- No visual regression outside the specific reconciliations named in KD1.

### Scope Boundaries

- `IconLabel` wrapper — not built (KD5).
- `FilterBar.tsx`'s internal `GroupLabel` sub-labels — stay as-is, not merged into `Eyebrow` (KD6).
- No new visual designs or behavior changes beyond the reconciliations named in KD1 — this is a de-duplication refactor, not a redesign.

### Dependencies / Assumptions

- Assumes the existing design tokens in `index.css` (`--color-brand*`, `--color-verdict-*`, `--spacing-toggle-bar`) are sufficient for every extracted primitive; no new tokens are anticipated.
- Assumes the `Modal.tsx` / `ModalHeader.tsx` convention (variant behavior expressed as a `Record<Variant, {...}>` map, not a general-purpose variant library) is the model the new primitives should replicate.

### Outstanding Questions

- **Deferred to Planning:** exact mechanism for the shared safe-area formula in R8 (a CSS custom property vs. a shared Tailwind utility class).
- **Deferred to Planning:** exact prop API for each primitive's variants (e.g., whether `Button` exposes `variant="primary" | "secondary"` versus separate exported components, and how `PortabilityPanel`'s disabled-submit state fits the shared `Button` API) — Requirements fix the visual outcome, not the API shape.

### Sources / Research

Verified locations for each duplicated pattern (grep-confirmed against the current tree):

- Primary "brand" button (R1): `src/App.tsx:200`, `src/features/decide/DecidePanel.tsx:82`, `src/features/visits/RestaurantDetail.tsx:254`, `src/features/portability/PortabilityPanel.tsx:141` (missing `active:` states), `src/features/capture/AddPlace.tsx:120` (`py-2` instead of `py-2.5`, has `disabled:opacity-50`).
- Secondary pill button (R2): `src/App.tsx:164,173,183`, `src/features/facets/SortBar.tsx:80`, `src/features/visits/RestaurantDetail.tsx:32` (this one already differs — see KD1).
- Badge (R3, R4): `src/features/StatusBadge.tsx:11` (shared `Badge`), `src/features/RestaurantList.tsx:77` (cuisine tag, currently hand-rolled with inline `style`).
- Toggle chip (R5): `src/features/facets/SortBar.tsx:20-27,57-75` (`segmentClass`), `src/features/facets/FilterBar.tsx:17-48` (`Chip`).
- Eyebrow (R6): `src/features/settings/SettingsPanel.tsx:18`, `src/features/facets/SortBar.tsx:56`, `src/features/facets/FilterBar.tsx:131`. `FilterBar.tsx:50-52`'s `GroupLabel` is the excluded `text-[10px]` variant (KD6).
- Safe-area formula (R8): `src/App.tsx:247`, `src/features/pwa/ReloadPrompt.tsx:46`.
- Existing shared-primitive precedent: `src/features/ui/Modal.tsx`, `src/features/ui/ModalHeader.tsx` (plus their colocated `.test.tsx` files).
