---
title: Filters & Cards Refresh - Plan
type: feat
date: 2026-08-29
topic: filters-cards-refresh
artifact_contract: ce-unified-plan/v1
artifact_readiness: requirements-only
product_contract_source: ce-brainstorm
execution: code
---

# Filters & Cards Refresh - Plan

## Goal Capsule

- **Objective:** Someone scanning the filter bar or the restaurant list can tell a place's cuisine and its status/verdict apart at a glance — without reading text, and without the filter panel crowding out the list below it.
- **Means:** Make the cuisine filter collapse to one row by default, add an emoji to every cuisine, fix the verdict order with icons and a retinted palette, and rebuild each list row as a cuisine-tinted card — all on top of the already-shipped "Carnet culinaire" identity, without changing that identity's tokens elsewhere.
- **Product authority:** This Product Contract is authoritative on product/visual behavior. Solo personal project — the requester is the sole user and decision-maker.
- **Open blockers:** None.

---

## Product Contract

### Summary

A follow-up visual pass on the filter bar and restaurant list, on top of the shipped "Carnet culinaire" identity: the cuisine filter collapses to one row by default, cuisine and status/verdict stay in two clearly separated groups, every cuisine shows an emoji, verdicts keep their best-to-worst order with an icon and a retinted palette, and each list row becomes a cuisine-tinted card with the cuisine as an emoji+name badge and the status/verdict plus visit count as a chip inside the card.

### Requirements

**Filtre — cuisine**

- R1. The cuisine filter group shows, by default, one wrapped row of the 6 most-used cuisines (ranked by how many current restaurants use each), with no horizontal scroll, plus a "+N autres" control when more cuisines exist.
- R2. Activating "+N autres" reveals every remaining cuisine (including "Uncategorized") in the same group; a "Réduire" control collapses back to the default row. This expand/collapse state does not persist across a reload, matching how filters already reset today.
- R3. The cuisine group is visually and structurally separate from the status/verdict group: its own label, with a divider between the two groups.

**Filtre — statut & verdict**

- R4. Status ("To try"/"Visited") and verdict chips form one group, always fully visible beneath the cuisine group, under its own label, never collapsed.
- R5. Verdict chips always render in a fixed order, best to worst — Go back, Worth a detour, Once was enough, Never again — matching the existing `VERDICT_RANK` ordering, everywhere all four are listed together.
- R6. Each verdict chip and badge carries a distinguishing icon in addition to its color, so the best-to-worst reading doesn't depend on color alone.
- R7. The verdict color tokens for "Worth a detour" and "Once was enough" are retinted so neither reads as ambiguously positive (today's olive green for "Once was enough" can read as "good"); "Go back" (teal) and "Never again" (brick red) keep their current colors.

**Identification des cuisines**

- R8. Every cuisine — the 12 curated ones and any free-text cuisine a user has typed — shows alongside a representative emoji, in filter chips and in list cards. Each curated cuisine gets its own assigned emoji; any free-text cuisine gets one consistent generic fallback emoji.

**Cartes de la liste principale**

- R9. Each row in the main restaurant list renders as a distinct card (margin, rounded corners), its background tinted by the restaurant's cuisine color via the existing cuisine-to-color mapping, replacing today's small color dot.
- R10. The cuisine's name and emoji appear together as a solid-colored badge in the card's top-right corner, in the position the status/verdict badge occupies today.
- R11. The status/verdict indicator moves inside the card body alongside the visit count (e.g. "Go back · 3 visits"), rather than sharing the header line with the restaurant name.
- R12. This card treatment applies to the main restaurant list only. "Où manger ?" candidate rows and each past visit's badge in the restaurant detail history keep today's inline pill treatment, re-colored and re-iconed per R6–R7 but not restyled into a card.

### Key Decisions

- **Cuisine icons are emoji, not custom SVG icons** (session-settled: user-directed — chosen over building and maintaining a dedicated icon per cuisine, since the cuisine vocabulary is open and emoji cover new free-text entries with no added design work). Governs R8.
- **The cuisine filter collapses to one wrapped row by default, not a horizontal scroll** (session-settled: user-directed — refined after visual review of a horizontal-scroll sketch, to reclaim vertical space while keeping every cuisine one tap away). Governs R1, R2.
- **Status & verdict stay one always-visible group, separate from the collapsible cuisine group** (session-settled: user-directed, confirmed via visual sketch comparison). Governs R3, R4.
- **The verdict palette keeps the shipped teal ("Go back") and brick red ("Never again") endpoints, retinting only the two middle verdicts** (session-settled: user-directed — chosen over a full traffic-light palette after comparing four palette sketches, to avoid a green "Once was enough" reading as positive and to minimize token churn). Governs R5, R6, R7.
- **List cards get a bold, cuisine-tinted background ("bloc couleur affirmé") rather than a subtle left-stripe tint** (session-settled: user-directed — chosen over a lighter-tint and a thick-side-band alternative after comparing three card sketches, prioritizing the fastest possible cuisine recognition). Governs R9, R10.
- **The new card treatment is scoped to the main restaurant list only** (session-settled: user-directed — chosen over applying it everywhere the fused badge appears today, leaving "Où manger ?" and the visit history structurally unchanged). Governs R12.
- **Free-text cuisines get one generic fallback emoji, not a user-facing emoji picker** (session-settled: user-directed — keeps the add/edit-cuisine flow unchanged). Governs R8.

### Key Flows

- F1. Cuisine filter expand/collapse
  - **Trigger:** More cuisines are in use than fit the default row.
  - **Steps:** The bar shows the 6 most-used cuisine chips plus "+N autres"; tapping it reveals every remaining cuisine and "Uncategorized", with a "Réduire" control in their place.
  - **Outcome:** The default state stays compact regardless of how many distinct cuisines exist; every cuisine remains reachable in one tap.
  - **Covers:** R1, R2.

### Acceptance Examples

- AE1. **Covers R1, R2.** Given more than 6 cuisines are in use, when the filter bar renders, then only the 6 most-used show in one wrapped row plus "+N autres"; when that control is activated, then every remaining cuisine (and "Uncategorized" if present) appears, with "Réduire" to collapse back.
- AE2. **Covers R5, R6, R7.** Given all four verdict chips render together, then they appear left to right as Go back, Worth a detour, Once was enough, Never again, each with its own icon, and "Once was enough" does not use a green/olive hue.
- AE3. **Covers R8.** Given a restaurant's cuisine is free text not in the curated list (e.g. "Levantine"), when it appears in a filter chip or list card, then it shows the generic fallback emoji, never a missing or blank icon.
- AE4. **Covers R9, R10, R11.** Given a restaurant with 3 visits and a latest verdict of "Go back", when it appears in the main list, then its card background is tinted by its cuisine color, a solid cuisine badge with name and emoji sits in the top-right corner, and a "Go back" chip reading "3 visits" sits inside the card body, not on the header line with the name.
- AE5. **Covers R12.** Given that same restaurant appears as a candidate in "Où manger ?" or as a past visit in the restaurant detail history, then it keeps today's inline pill treatment (re-colored and re-iconed per R6–R7), not the new color-blocked card.

### Success Criteria

- Without reading any text, a user can tell a restaurant's cuisine (color + emoji) apart from its status/verdict (chip), and judge a verdict as good or bad by color and icon alone, in a single glance.
- The filter panel's default (collapsed) height no longer grows with the number of distinct cuisines in use.

### Scope Boundaries

- No dark theme: the palette stays within the existing light "Carnet culinaire" identity.
- No numeric rating: Verdict remains the existing non-numeric returnability judgment — the palette and icon changes are presentation only, not a new rating scale.
- Map markers, modals, buttons, and the sync/PWA indicators are unchanged in this pass.
- The three filter chip groups (cuisine / status / verdict) are not merged into one row; only the cuisine group gains a collapse behavior.
- No emoji picker or custom-emoji UI is added for free-text cuisines (see Key Decisions).

### Dependencies / Assumptions

- Assumes the existing cuisine-to-color mapping (`colorForCuisine` in `src/features/facets/cuisines.ts`) stays the single source of cuisine color; the new emoji mapping is additive, keyed the same way (curated name → emoji, else the fallback), not a replacement.
- Assumes the existing `VERDICT_RANK` (`src/types/models.ts`) stays the source of the fixed best-to-worst display order — no new ranking concept is introduced.
- Assumes the "most-used" ranking behind the default 6 cuisine chips (R1) is computed from the current restaurant set at render time, the same way `presentCuisines`/`cuisineOptions` already scan restaurants, not from a stored or cached ranking.
- Builds on the already-shipped design-refresh (`docs/plans/2026-08-29-1725-feat-design-refresh-plan.md`) and its tokens/components — `--color-verdict-*` in `src/index.css`, `colorForCuisine`, `StatusBadge`/`VerdictBadge` in `src/features/StatusBadge.tsx`, `FilterBar` in `src/features/facets/FilterBar.tsx`, `RestaurantList` in `src/features/RestaurantList.tsx` — rather than replacing them.

### Sources / Research

- `src/features/facets/FilterBar.tsx`, `src/features/facets/cuisines.ts`, `src/features/facets/filter.ts` — current filter bar structure, cuisine list and color mapping.
- `src/features/RestaurantList.tsx`, `src/features/StatusBadge.tsx`, `src/features/display.ts` — current list row markup and the fused status/verdict badge logic.
- `src/types/models.ts` — `Verdict`, `VERDICT_LABELS`, `VERDICT_RANK`, `RestaurantStatus`, `STATUS_LABELS`.
- `src/index.css` — the shipped "Carnet culinaire" design tokens (`--color-verdict-*`, `--color-teal*`, `--color-brand*`, the warm gray ramp).
- `docs/plans/2026-08-29-1725-feat-design-refresh-plan.md` — the design-refresh plan this work builds on.
