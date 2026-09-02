---
title: Remaining Button Consolidation - Plan
type: refactor
date: 2026-08-31
topic: remaining-button-consolidation
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: ce-brainstorm
execution: code
status: shipped
---

# Remaining Button Consolidation - Plan

**Product Contract preservation:** restructured, no scope change — R2's file list corrected from 2 to 3 sites (`src/features/ui/ModalHeader.tsx:35` added) after planning research found the same icon-dismiss "✕" pattern there, predating R2's other two sites. The requirement's intent (one shared icon-dismiss treatment replacing the "✕" buttons) is unchanged; KD3 is updated to name all three hover tones this now covers.

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

PR21 (`docs/plans/2026-08-31-2036-refactor-ui-primitives-plan.md`) extracted `Button`, `Badge`, `ToggleChip`, and `Eyebrow` from six duplicated Tailwind patterns, but its scope was bounded to the patterns found at the time. A repo-wide scan now finds 17 remaining raw `<button>` elements across 10 files. Three of them form real duplicated clusters the same way PR21's originals did:

- A brand-underline text-button (`font-medium text-brand underline` or a close variant) appears in `AddPlace.tsx`, `DecidePanel.tsx`, and `FilterBar.tsx`, each with a small independent divergence (weight, underline-on-hover vs. always-on, text size) — the same drift shape PR21's KD1 described.
- `SettingsPanel.tsx`'s language toggle and `DecidePanel.tsx`'s radius-preset toggle each hand-roll a bordered pill with `aria-pressed`, and `SettingsPanel.tsx`'s active/inactive classes already match the existing `ToggleChip shape="pill"` almost byte-for-byte — the primitive exists and is simply unused at these two sites.
- An icon-only "✕" dismiss button appears in `RestaurantDetail.tsx` (destructive, deletes a visit) and `ReloadPrompt.tsx` (dismisses a PWA update toast), sharing a `text-gray-400`/transition base but diverging on hover tone and hit-target chrome.

### Requirements

**Button: link variant**

- R1. `Button` gains a variant that replaces the duplicated brand-underline text-button markup in `AddPlace.tsx:133`, `DecidePanel.tsx:69`, and `FilterBar.tsx:102`, converging their existing small divergences onto one canonical treatment.

**Button: icon-dismiss variant**

- R2. `Button` gains an icon-only dismiss treatment that replaces the "✕" buttons in `src/features/ui/ModalHeader.tsx:35`, `RestaurantDetail.tsx:281`, and `ReloadPrompt.tsx:62`, sharing one base chrome while preserving each site's distinct hover tone (neutral gray for the modal close action, destructive red for the delete action, light-on-color for the toast dismiss).

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
  - `FilterBar.tsx:144`'s cuisine-overflow "show more" toggle — a dashed-border expand/collapse control (`aria-expanded`, not `aria-pressed`) with no visual twin anywhere else in the tree.
  Governs nothing directly; this decision draws the boundary around R1–R3.
- **KD3. The icon-dismiss variant (R2) parameterizes hover tone rather than forcing one color, and covers `ModalHeader.tsx`'s dismiss button alongside the two originally scoped sites.** `ModalHeader.tsx`'s modal-close action, `RestaurantDetail.tsx`'s delete action, and `ReloadPrompt.tsx`'s toast dismiss sit in three different visual contexts (a modal title bar, a plain list row, a colored toast) and serve three different severities (neutral, destructive, neutral-on-color); the shared variant carries the common base chrome and lets each call site supply its hover tone rather than picking one hover color for all three. (session-settled: user-approved — chosen over treating `ModalHeader.tsx` as a separate follow-up: it's the same pattern, found during planning research, and folding it in avoids leaving an identical duplicate unconverted right next to the new variant.) Governs R2.
- **KD4. The link variant (R1) preserves each call site's text size via a `size` prop rather than converging to one value.** `FilterBar.tsx`'s clear-all link keeps its current compact `text-xs` treatment — distinct from `AddPlace.tsx`'s and `DecidePanel.tsx`'s currently-larger inherited size — because the two sizes serve different visual contexts (a dense filter-header row vs. a spaced-out panel body) and the canonical `font-medium text-brand underline` base carries no text-size utility of its own to converge onto. (session-settled: user-approved — chosen over letting `FilterBar.tsx`'s link grow to the app's default body size: confirmed at document review after design-lens review flagged the gap.) Governs R1.

### Success Criteria

- Every call site named in R1–R3 renders through the corresponding `Button` variant or `ToggleChip shape="pill"`; no leftover copy of the converged class strings remains in the touched files.
- Existing test suites (`App.test.tsx`, `SettingsPanel` and `DecidePanel` coverage, etc.) pass unchanged, and `Button.test.tsx` / `ToggleChip.test.tsx` gain coverage for the new variant/adoption.
- No visual regression outside the specific reconciliations named in KD1, KD3, and KD4.

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
- Link-button cluster (R1): `AddPlace.tsx:133-139` (`mt-1 font-medium text-brand underline`), `DecidePanel.tsx:69-75` (identical classes), `FilterBar.tsx:102-104` (`text-xs text-brand hover:underline` — the hover-timing divergence KD1 reconciles; the `text-xs` sizing is preserved via KD4's `size` prop, not converged).
- Icon-dismiss cluster (R2): `src/features/ui/ModalHeader.tsx:35-42` (`text-gray-400 hover:text-gray-600`, no padding/border — found during planning research), `RestaurantDetail.tsx:281-288` (`text-gray-400 hover:text-red-600`, no padding/border), `ReloadPrompt.tsx:62-69` (`rounded-full p-1 text-gray-400 transition hover:text-white active:text-white`).
- ToggleChip-adoption cluster (R3): `SettingsPanel.tsx:22-31` (active: `border-brand bg-brand-soft font-semibold text-brand-strong shadow-sm`, inactive: `border-gray-300 text-gray-600 hover:border-gray-400 hover:bg-gray-50` — matches `ToggleChip`'s pill classes in `src/features/ui/ToggleChip.tsx:16-20` almost exactly), `DecidePanel.tsx:47-57` (active: `border-brand bg-brand-soft text-brand`, inactive: `border-gray-300` — a lighter version of the same pattern).
- Existing primitives referenced: `src/features/ui/Button.tsx` (variant/size/iconOnly pattern to extend), `src/features/ui/ToggleChip.tsx` (`shape="pill"` to adopt), `src/lib/cn.ts`.
- Link-variant sizing (KD4): confirmed `src/index.css` sets no `font-size` on `body`, and `AddPlace.tsx:133`'s and `DecidePanel.tsx:69`'s buttons each sit inside an ancestor `text-sm` container (`AddPlace.tsx:129` `<div className="mt-3 ... text-sm">`, `DecidePanel.tsx:64` `<div className="text-sm text-gray-500">`) while `FilterBar.tsx:102`'s button sits in a bare flex row beside `Eyebrow` with no ambient text-size wrapper — so a size-less canonical class string would grow `FilterBar.tsx`'s link to the app's default size instead of preserving its current `text-xs`.
- Precedent plan: `docs/plans/2026-08-31-2036-refactor-ui-primitives-plan.md`, whose KD1 ("uniformize discovered visual inconsistencies rather than preserve pixel-parity") and explicit exclusion of `App.tsx`'s FAB and toggle bar this plan continues.
- `ReloadPrompt.tsx:51`'s primary-style button (`rounded-full bg-brand px-3 py-1`) was checked against `Button`'s `primary` variant and against R2/R3's clusters — it doesn't duplicate either (different shape and padding from `Button`'s `primary`, not an icon or a pill-toggle), so it isn't included in any requirement above.
- Planning research (repo-research-analyst) confirmed: `cn.ts` does no Tailwind-aware conflict resolution (plain filter+join), which is why `Button.tsx` already keeps `SECONDARY_TEXT_SIZE` and `ICON_ONLY_SECONDARY` as separate token sets rather than layered `className` overrides — R2's tone parameterization (KTD2) follows the same discipline. `AddPlace.tsx`, `RestaurantDetail.tsx`, and `DecidePanel.tsx` already import `Button`; `FilterBar.tsx` and `SettingsPanel.tsx` already import `ToggleChip`; `ReloadPrompt.tsx` and `ModalHeader.tsx` import neither today. None of the six touched files' existing test suites assert exact class strings on the R1-R3 buttons (only `getByRole`/`aria-pressed`/click assertions), so the class convergence itself carries no test-breakage risk.
- Institutional learnings (learnings-researcher): no existing `docs/solutions/` entry covers UI-primitive/variant-API design or `cn` conventions — this is new territory for the knowledge base, and a candidate for a `ce-compound` write-up after landing. `docs/solutions/design-patterns/normalize-filter-selection-keys-at-the-boundary.md` was checked and confirmed not applicable to R1/R3's call sites (`FilterBar.tsx`'s clear-all button doesn't read a Set key; `DecidePanel.tsx`'s toggles compare a plain `number`).

---

## Planning Contract

### Key Technical Decisions

- **KTD1. `Button` gains a `link` variant as a new arm in its existing discriminated union, typed with an optional `size` like `secondary`**: `{ variant: 'link'; iconOnly?: false; size?: ButtonSize }`. This is additive-safe — existing `primary`/`secondary` call sites are unaffected because `variant` is the discriminant. The variant's base class string is the canonical converged form from KD1: `font-medium text-brand underline`, with a size-specific text class composed on top the same way `secondary` composes `SECONDARY_TEXT_SIZE` (KD4): `size="xs"` for `FilterBar.tsx`, defaulting to `size="sm"` elsewhere to match `AddPlace.tsx`'s and `DecidePanel.tsx`'s current rendered size. Governs R1.
- **KTD2. The icon-dismiss variant takes a `tone: Record<'neutral' | 'destructive' | 'toast', string>` prop, composed via `cn` the same way `SECONDARY_TEXT_SIZE` is today**, rather than letting hover color pass through a free-form caller `className`. (session-settled: user-approved — chosen over a `className`-supplied hover color: `cn` does not dedupe conflicting Tailwind classes, so a `tone` Record keeps exactly one `hover:text-*` class present per render, matching the `size` prop precedent.) The variant's shared base chrome (no padding/border, `text-gray-400`, `transition`) covers `ModalHeader.tsx` and `RestaurantDetail.tsx`; `ReloadPrompt.tsx`'s extra `rounded-full p-1` layers in via its own caller `className`, which is safe because it adds no property the base already sets. Governs R2.
- **KTD3. R2's file list includes `ModalHeader.tsx:35`**, mapped to `tone="neutral"`; `RestaurantDetail.tsx:281` maps to `tone="destructive"`; `ReloadPrompt.tsx:62` maps to `tone="toast"`. See KD3 and the Product Contract preservation note above. Governs R2.
- **KTD4. `SettingsPanel.tsx` and `DecidePanel.tsx` adopt `ToggleChip shape="pill"` unchanged** — no new `ToggleChip` prop or shape is introduced. Both sites converge onto `ToggleChip`'s existing canonical pill classes (KD1), which for `DecidePanel.tsx`'s radius toggle is a materially larger visual change than for `SettingsPanel.tsx`'s language toggle (adds `min-h-10` tap-target growth, an inactive-state hover, and `shadow-sm`/`font-semibold` on active). (session-settled: user-approved — chosen over preserving `DecidePanel`'s current lighter pill treatment: confirmed at the Phase 5.1.5 scoping synthesis.) `aria-pressed` and `type="button"` come from `ToggleChip` automatically; each site's own state-update logic (`DecidePanel.tsx`'s toggle also calls `setPickedId(null)`) stays at the call site. Governs R3.

### Assumptions

- `Button`'s existing inline-destructured-prop-type convention (no exported `Props` type) extends to the new `link` and icon-dismiss union arms.
- No new design tokens are needed in `src/index.css` for either new variant or for `ToggleChip`'s adoption at the two R3 sites.

---

## Implementation Units

### U1. `Button` link variant and call-site migration

- **Goal:** Add a `link` variant to `Button` and migrate the three duplicated brand-underline text-buttons onto it.
- **Requirements:** R1 (KTD1)
- **Dependencies:** none
- **Files:**
  - `src/features/ui/Button.tsx` (modify)
  - `src/features/ui/Button.test.tsx` (modify — add `link` variant cases)
  - `src/features/capture/AddPlace.tsx` (modify — already imports `Button`)
  - `src/features/decide/DecidePanel.tsx` (modify — already imports `Button`)
  - `src/features/facets/FilterBar.tsx` (modify — add a new `Button` import)
- **Approach:**
  1. Add `link` to `Button`'s variant union with a base class-string entry set to the KD1-converged `font-medium text-brand underline`, plus a `size` prop (KD4/KTD1) composed the same way `secondary`'s `SECONDARY_TEXT_SIZE` is today.
  2. Migrate `AddPlace.tsx:133` and `DecidePanel.tsx:69` onto `variant="link"` at the default `size="sm"`; migrate `FilterBar.tsx:102` onto `variant="link" size="xs"` to preserve its current compact treatment. Remove each site's local class string; keep each site's existing `onClick` and translated text unchanged.
- **Patterns to follow:** `Button.tsx`'s existing `VARIANT_STYLES` `Record<ButtonVariant, string>` and `SECONDARY_TEXT_SIZE` shapes.
- **Test scenarios:**
  - `variant="link"` renders the canonical `text-brand underline` classes.
  - `size="xs"` renders `FilterBar.tsx`'s compact text size; the default size matches `AddPlace.tsx`'s/`DecidePanel.tsx`'s current rendered size.
  - Existing `primary`/`secondary` variant tests still pass unchanged.
  - A caller-supplied `className` merges alongside the `link` variant's base classes.
- **Verification:** none of the three migrated call sites retains a copy of the old class string; `npm run test` passes including the new `Button.test.tsx` cases; `npm run lint` passes.

### U2. `Button` icon-dismiss variant and call-site migration

- **Goal:** Add a tone-parameterized icon-only dismiss variant to `Button` and migrate all three "✕" dismiss buttons onto it.
- **Requirements:** R2 (KTD2, KTD3)
- **Dependencies:** none
- **Files:**
  - `src/features/ui/Button.tsx` (modify)
  - `src/features/ui/Button.test.tsx` (modify — add icon-dismiss cases per tone)
  - `src/features/ui/ModalHeader.tsx` (modify — add a new `Button` import)
  - `src/features/visits/RestaurantDetail.tsx` (modify — already imports `Button`)
  - `src/features/pwa/ReloadPrompt.tsx` (modify — add a new `Button` import)
- **Approach:**
  1. Add a new `Button` variant for icon-only dismiss, carrying a `tone` Record (KTD2) composed via `cn` so exactly one `hover:text-*` class is present per render.
  2. Migrate `ModalHeader.tsx:35` to `tone="neutral"`, `RestaurantDetail.tsx:281` to `tone="destructive"`, `ReloadPrompt.tsx:62` to `tone="toast"` (KTD3). `ReloadPrompt.tsx` supplies its extra `rounded-full p-1` via caller `className`.
  3. Preserve each site's exact `aria-label` and `onClick`.
- **Technical design (directional):** `Button({variant: 'icon-dismiss', tone, className, ...rest})` selects a shared base-chrome string plus a `TONE_HOVER[tone]` entry, merged via `cn(base, TONE_HOVER[tone], className)` — directional shape, not implementation-specification.
- **Patterns to follow:** `Button.tsx`'s existing `SECONDARY_TEXT_SIZE` decoupled-token composition.
- **Test scenarios:**
  - Each of the three `tone` values renders its own distinct hover class, with no other tone's hover class present in the same render.
  - A caller-supplied `className` (`ReloadPrompt.tsx`'s `rounded-full p-1`) merges alongside the tone base without colliding with any base-string property.
  - `ModalHeader.test.tsx`, `RestaurantDetail.test.tsx`, and any `ReloadPrompt` test continue to find the button by its existing `aria-label` and confirm `onClick` fires (existing assertions, unchanged).
- **Verification:** none of the three migrated call sites retains a copy of its old class string; `npm run test` passes; `npm run lint` passes; manual check confirms `RestaurantDetail.tsx`'s delete action keeps its red hover treatment.

### U3. `ToggleChip` adoption for `SettingsPanel` and `DecidePanel`

- **Goal:** Migrate `SettingsPanel`'s language toggle and `DecidePanel`'s radius-preset toggle onto the existing `ToggleChip shape="pill"`.
- **Requirements:** R3 (KTD4)
- **Dependencies:** none
- **Files:**
  - `src/features/settings/SettingsPanel.tsx` (modify — add a new `ToggleChip` import)
  - `src/features/decide/DecidePanel.tsx` (modify — add a new `ToggleChip` import)
- **Approach:**
  1. `SettingsPanel.tsx`: replace the local `<button>` with `<ToggleChip shape="pill" active={i18n.language === lng} onClick={...}>`, keeping `key={lng}` on the `ToggleChip` element.
  2. `DecidePanel.tsx`: replace the local `<button>` with `<ToggleChip shape="pill" active={km === radiusKm} onClick={...}>`, keeping `key={km}` and both existing state updates (`setRadiusKm`, `setPickedId(null)`) in the handler.
  3. Drop each site's now-redundant local `aria-pressed`/`type="button"` — `ToggleChip` sets both automatically.
- **Patterns to follow:** `FilterBar.tsx`'s existing `ToggleChip shape="pill"` usage.
- **Test scenarios:**
  - `SettingsPanel`'s language toggle still reflects `aria-pressed` and switches language on click (existing assertions, unchanged).
  - `DecidePanel`'s radius toggle still reflects `aria-pressed`, calls `setRadiusKm`, and resets the picked restaurant on click (existing assertions, unchanged).
  - Test expectation: no new `ToggleChip.test.tsx` case needed — both sites use the already-tested `pill` shape with no new prop combination.
- **Verification:** existing `SettingsPanel.test.tsx` and `DecidePanel.test.tsx` suites pass unchanged; no leftover copy of the old pill markup remains in either file; manual visual check confirms `DecidePanel`'s larger tap target, added hover state, and shadow are the intended KTD4 reconciliation.

---

## Verification Contract

| Command | Applicability |
|---|---|
| `npm run test` (`vitest run`) | Full suite, including new `Button.test.tsx` cases for `link` and icon-dismiss — must pass with no regressions. |
| `npm run lint` (`tsc --noEmit`) | Must pass. |
| Manual visual comparison | For each touched screen (add-place, decide, filters, restaurant detail, PWA reload toast, every `Modal`-hosted panel, settings), confirm only the KD1/KD4/KTD1-KTD4 reconciliations changed appearance — most visibly `DecidePanel`'s radius-preset toggle and `FilterBar`'s preserved compact link size. |

---

## Definition of Done

- `npm run test` and `npm run lint` both pass.
- No leftover copy of any of the three converged class-string clusters (link text-button, icon-dismiss "✕", toggle pill) remains in the seven touched files.
- `Button.tsx` carries exactly one canonical definition for the `link` variant and for each icon-dismiss `tone`.
- Manual visual comparison confirms no unintended regression outside the reconciliations named in KD1, KD4, and KTD1-KTD4.
- Any dead code from an abandoned approach is removed before merge.

