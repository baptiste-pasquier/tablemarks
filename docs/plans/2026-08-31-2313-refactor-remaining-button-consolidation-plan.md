---
title: Remaining Button Consolidation - Plan
type: refactor
date: 2026-08-31
topic: remaining-button-consolidation
artifact_contract: ce-unified-plan/v1
artifact_readiness: requirements-only
product_contract_source: ce-brainstorm
execution: code
---

# Remaining Button Consolidation - Plan

## Goal Capsule

- **Objective:** The remaining raw `<button>` elements that carry a real duplicated visual pattern render through the existing `Button` / `ToggleChip` primitives, so the class-drift risk PR21 already fixed for its six original patterns doesn't recur in the call sites it didn't touch.
- **Means:** Extend `Button`'s variant API with a link-style text-button treatment and an icon-only dismiss treatment, and adopt the existing `ToggleChip shape="pill"` for two call sites that already duplicate its classes almost verbatim — following `AGENTS.md`'s "extend, don't abandon" rule and the uniformization precedent PR21's plan already established (`docs/plans/2026-08-31-2036-refactor-ui-primitives-plan.md`).
- **Product authority:** Product Contract below governs which clusters converge and which stay bespoke; the Planning Contract added by `ce-plan` governs the technical mechanism.
- **Execution profile:** Standard code change, same shape as PR21 — no migration, no external service, no rollout sequencing beyond normal PR review.
- **Stop conditions:** None currently open.
- **Tail ownership:** Implementer runs `npm run test` and `npm run lint`; PR review confirms no visual regression outside the reconciliations named in Key Decisions.
- **Open blockers:** None.

---

## Product Contract

### Summary

Extend `Button` with two new variants and adopt the existing `ToggleChip` primitive at two call sites that already duplicate its classes, closing the three remaining clusters of duplicated raw `<button>` markup that PR21 didn't cover. Genuinely unique controls (a FAB, a map overlay control, a tinted list card, a dynamically-colored status toggle, one one-off outline button, and two structurally distinct list-row buttons) stay bespoke Tailwind — they don't share a duplicated pattern with anything else in the tree.

### Problem Frame

PR21 (`docs/plans/2026-08-31-2036-refactor-ui-primitives-plan.md`) extracted `Button`, `Badge`, `ToggleChip`, and `Eyebrow` from six duplicated Tailwind patterns, but its scope was bounded to the patterns found at the time. A repo-wide scan now finds 16 remaining raw `<button>` elements across 10 files. Three of them form real duplicated clusters the same way PR21's originals did:

- A brand-underline text-button (`font-medium text-brand underline` or a close variant) appears in `AddPlace.tsx`, `DecidePanel.tsx`, and `FilterBar.tsx`, each with a small independent divergence (weight, underline-on-hover vs. always-on, text size) — the same drift shape PR21's KD1 described.
- `SettingsPanel.tsx`'s language toggle and `DecidePanel.tsx`'s radius-preset toggle each hand-roll a bordered pill with `aria-pressed`, and `SettingsPanel.tsx`'s active/inactive classes already match the existing `ToggleChip shape="pill"` almost byte-for-byte — the primitive exists and is simply unused at these two sites.
- An icon-only "✕" dismiss button appears in `RestaurantDetail.tsx` (destructive, deletes a visit) and `ReloadPrompt.tsx` (dismisses a PWA update toast), sharing a `text-gray-400`/transition base but diverging on hover tone and hit-target chrome.

### Requirements

**Button: link variant**

- R1. `Button` gains a variant that replaces the duplicated brand-underline text-button markup in `AddPlace.tsx:133`, `DecidePanel.tsx:69`, and `FilterBar.tsx:102`, converging their existing small divergences onto one canonical treatment.

**Button: icon-dismiss variant**

- R2. `Button` gains an icon-only dismiss treatment that replaces the "✕" buttons in `RestaurantDetail.tsx:281` and `ReloadPrompt.tsx:62`, sharing one base chrome while preserving each site's distinct hover tone (destructive red for the delete action vs. neutral-to-white for the toast dismiss).

**ToggleChip adoption**

- R3. `SettingsPanel.tsx:22`'s language toggle and `DecidePanel.tsx:47`'s radius-preset toggle render through the existing `ToggleChip shape="pill"` primitive instead of their own locally duplicated pill markup, converging their active/inactive treatment onto `ToggleChip`'s canonical classes.

### Key Decisions

- **KD1. Converge each cluster's discovered divergences rather than preserve pixel-parity, matching PR21's KD1 precedent.** Within each of R1–R3, the small differences between call sites (FilterBar's `hover:underline`-only vs. AddPlace/DecidePanel's always-on `underline`; SettingsPanel's `text-sm` vs. ToggleChip's `text-xs`; the two dismiss buttons' differing padding/border) resolve to one canonical treatment per cluster rather than being preserved as ad hoc per-site variants. Exact mechanism (a size prop, a tone prop, etc.) is left to planning. Governs R1, R2, R3.
- **KD2. Scope is bounded to clusters with a real duplicated pattern; genuine one-offs stay bespoke.** (session-settled: user-directed — chosen over both a stricter Rule-of-Three-only pass and a maximal pass that would also convert one-offs: the user picked "pragmatic convergence" over "règle des 3 stricte" and "uniformisation maximale.") The following are considered and intentionally excluded, each for a distinct reason:
  - `App.tsx`'s FAB (`+` button, `App.tsx:232`) and its list/map segmented tab (`App.tsx:251`, solid `bg-brand` active treatment, unlike `ToggleChip`'s soft-brand active state) — both were already explicitly excluded by PR21's plan as "visually distinct from both `Button` variants."
  - `MapView.tsx:454`'s locate overlay control — an absolute-positioned map control with no visual twin elsewhere.
  - `RestaurantList.tsx:44`'s cuisine-tinted card — a clickable card container with a dynamic `color-mix()` background, not a "button" style pattern.
  - `SyncStatusIndicator.tsx:69`'s status toggle — its class comes from a `labelClassName(status.state)` function with no fixed chrome to converge.
  - `App.tsx:193`'s "whereToEat" outline button (`border-brand/30`, brand text) — a single occurrence of a new outline pattern with no duplicate elsewhere in the tree; not a Rule-of-Three case today.
  - `AddPlace.tsx:147` and `DecidePanel.tsx:94` — both wrap a list row in a `<button>`, but with different padding, hover treatment, and internal structure; they share a role ("row as button") but not a duplicated class string.
  - `DecidePanel.tsx:110`'s "directions" link (`text-brand underline`) — visually close to R1's cluster, but it's a real `<a href>` to an external maps URL, not a `<button>`; converting it to the `Button` primitive would drop its link semantics (no `href`, no ctrl/cmd-click to a new tab).
  Governs nothing directly; this decision draws the boundary around R1–R3.
- **KD3. The icon-dismiss variant (R2) parameterizes hover tone rather than forcing one color.** `RestaurantDetail.tsx`'s delete action and `ReloadPrompt.tsx`'s toast dismiss sit in different visual contexts (a plain list row vs. a colored toast) and serve different severities (destructive vs. neutral); the shared variant carries the common base chrome and lets each call site supply its hover tone rather than picking one hover color for both. Governs R2.

### Success Criteria

- Every call site named in R1–R3 renders through the corresponding `Button` variant or `ToggleChip shape="pill"`; no leftover copy of the converged class strings remains in the touched files.
- Existing test suites (`App.test.tsx`, `SettingsPanel` and `DecidePanel` coverage, etc.) pass unchanged, and `Button.test.tsx` / `ToggleChip.test.tsx` gain coverage for the new variant/adoption.
- No visual regression outside the specific reconciliations named in KD1 and KD3.

### Scope Boundaries

- The one-offs listed under KD2 are out of scope for this plan — no new `Button` variant or primitive is introduced for any of them.
- `DecidePanel.tsx:110`'s external "directions" link stays a plain `<a>`; only its visual kinship with R1 is noted, not its markup.
- No new visual designs or behavior changes beyond the reconciliations named in KD1 and KD3 — this is a de-duplication refactor, not a redesign.

### Dependencies / Assumptions

- Assumes `Button`'s existing `cn`-based composition (base class map merged with a caller `className`) extends cleanly to a link variant and an icon-dismiss variant without needing a new primitive, per `AGENTS.md`'s "extend, don't abandon" rule.
- Assumes `ToggleChip`'s existing `shape="pill"` covers `SettingsPanel.tsx` and `DecidePanel.tsx` structurally (both are `aria-pressed` toggles with bordered pill chrome); any sizing difference (e.g. `SettingsPanel`'s current `text-sm` vs. `ToggleChip`'s hardcoded `text-xs`) is a KD1 reconciliation, not a blocker.
- Assumes no new design tokens are needed in `src/index.css` beyond what `Button`/`ToggleChip` already reference.

### Sources / Research

- Full raw `<button>` inventory (grep-confirmed against the current tree, 2026-08-31): `App.tsx:193,232,251`; `RestaurantList.tsx:44`; `AddPlace.tsx:133,147`; `DecidePanel.tsx:47,69,94`; `SettingsPanel.tsx:22`; `FilterBar.tsx:102,144`; `RestaurantDetail.tsx:281`; `ReloadPrompt.tsx:51,62`; `MapView.tsx:454`; `SyncStatusIndicator.tsx:69`.
- Link-button cluster (R1): `AddPlace.tsx:133-139` (`mt-1 font-medium text-brand underline`), `DecidePanel.tsx:69-75` (identical classes), `FilterBar.tsx:102-104` (`text-xs text-brand hover:underline` — the size/hover divergence KD1 reconciles).
- Icon-dismiss cluster (R2): `RestaurantDetail.tsx:281-288` (`text-gray-400 hover:text-red-600`, no padding/border), `ReloadPrompt.tsx:62-69` (`rounded-full p-1 text-gray-400 transition hover:text-white active:text-white`).
- ToggleChip-adoption cluster (R3): `SettingsPanel.tsx:22-31` (active: `border-brand bg-brand-soft font-semibold text-brand-strong shadow-sm`, inactive: `border-gray-300 text-gray-600 hover:border-gray-400 hover:bg-gray-50` — matches `ToggleChip`'s pill classes in `src/features/ui/ToggleChip.tsx:16-20` almost exactly), `DecidePanel.tsx:47-57` (active: `border-brand bg-brand-soft text-brand`, inactive: `border-gray-300` — a lighter version of the same pattern).
- Existing primitives referenced: `src/features/ui/Button.tsx` (variant/size/iconOnly pattern to extend), `src/features/ui/ToggleChip.tsx` (`shape="pill"` to adopt), `src/lib/cn.ts`.
- Precedent plan: `docs/plans/2026-08-31-2036-refactor-ui-primitives-plan.md`, whose KD1 ("uniformize discovered visual inconsistencies rather than preserve pixel-parity") and explicit exclusion of `App.tsx`'s FAB and toggle bar this plan continues.
- `ReloadPrompt.tsx:51`'s primary-style button (`rounded-full bg-brand px-3 py-1`) was checked against `Button`'s `primary` variant and against R2/R3's clusters — it doesn't duplicate either (different shape and padding from `Button`'s `primary`, not an icon or a pill-toggle), so it isn't included in any requirement above.

