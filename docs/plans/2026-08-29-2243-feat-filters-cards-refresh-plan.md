---
title: Filters & Cards Refresh - Plan
type: feat
date: 2026-08-29
topic: filters-cards-refresh
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: ce-brainstorm
execution: code
---

# Filters & Cards Refresh - Plan

## Goal Capsule

- **Objective:** Someone scanning the filter bar or the restaurant list can tell a place's cuisine and its status/verdict apart at a glance — without reading text, and without the filter panel crowding out the list below it.
- **Means:** Make the cuisine filter collapse to one row by default, add an emoji to every cuisine, fix the verdict order with icons and a retinted palette, and rebuild each list row as a cuisine-tinted card — all on top of the already-shipped "Carnet culinaire" identity, without changing that identity's tokens elsewhere.
- **Product authority:** This Product Contract is authoritative on product/visual behavior; the Planning Contract below is authoritative on mechanism (exact colors, tokens, component structure). Solo personal project — the requester is the sole user and decision-maker.
- **Execution profile:** Standard software feature work; no autonomous/long-running optimization loop.
- **Stop conditions:** None beyond satisfying the Definition of Done below.
- **Open blockers:** None. Ready for implementation.

---

## Product Contract

**Product Contract preservation:** unchanged. Planning added the Planning Contract, Implementation Units, Verification Contract, and Definition of Done below; no Requirement, Key Decision, or scope boundary text was altered.

### Summary

A follow-up visual pass on the filter bar and restaurant list, on top of the shipped "Carnet culinaire" identity: the cuisine filter collapses to one row by default, cuisine and status/verdict stay in two clearly separated groups, every cuisine shows an emoji, verdicts keep their best-to-worst order with an icon and a retinted palette, and each list row becomes a cuisine-tinted card with the cuisine as an emoji+name badge and the status/verdict plus visit count as a chip inside the card.

### Requirements

**Filtre — cuisine**

- R1. The cuisine filter group shows, by default, one wrapped row of the 6 most-used cuisines (ranked by how many current restaurants use each), with no horizontal scroll, plus a "+N autres" control when more cuisines exist.
- R2. Activating "+N autres" reveals every remaining ranked cuisine in the same group; a "Réduire" control collapses back to the default row. "Uncategorized" already renders in the default row regardless of expand state (see R1). This expand/collapse state does not persist across a reload, matching how filters already reset today.
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
  - **Steps:** The bar shows the 6 most-used cuisine chips, "Uncategorized" (if present), and "+N autres"; tapping it reveals every remaining ranked cuisine, with a "Réduire" control in their place.
  - **Outcome:** The default state stays compact regardless of how many distinct cuisines exist; every cuisine remains reachable in one tap.
  - **Covers:** R1, R2.

### Acceptance Examples

- AE1. **Covers R1, R2.** Given more than 6 cuisines are in use, when the filter bar renders, then only the 6 most-used show in one wrapped row plus "+N autres" — "Uncategorized" (if present) always shows in that default row too; when "+N autres" is activated, then every remaining ranked cuisine appears, with "Réduire" to collapse back.
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
- `docs/solutions/design-patterns/normalize-filter-selection-keys-at-the-boundary.md` — the existing convention for lowercased Set keys in `FacetFilter`/`FilterBar`; any new cuisine ranking or lookup added by this plan reuses that convention rather than re-normalizing at each read site.
- `src/features/RestaurantList.test.tsx`, `src/features/facets/FilterBar.test.tsx`, `src/features/facets/cuisines.test.ts`, `src/features/visits/RestaurantDetail.test.tsx`, `src/features/decide/DecidePanel.test.tsx` — existing test patterns and exact-text queries (e.g. `screen.getByText('Go back')`) the new work must keep passing unchanged.

---

## Planning Contract

### Key Technical Decisions

- KTD1. **Retint only `--color-verdict-detour` and `--color-verdict-once`.** New values: `--color-verdict-detour: #9c7530`, `--color-verdict-once: #a85423`. `--color-verdict-go-back` (`#1f6f68`) and `--color-verdict-never` (`#8b3a3a`) are unchanged (session-settled: user-directed — chosen over a full traffic-light palette and two other alternatives, after comparing four palette sketches, to avoid a green "Once was enough" reading as positive and to minimize token churn). Governs R7.
- KTD2. **Verdict icons render as a separate element from the label text, never concatenated into one string.** Fixed set: `go_back` ↩️, `worth_a_detour` 🧭, `once_was_enough` 🤷, `never_again` 🚫. The icon is an `aria-hidden` sibling preceding the label text span; neutral states ("To try", "Resolving…") get no icon (session-settled: user-approved — confirmed at plan synthesis specifically to keep existing exact-text queries, e.g. `screen.getByText('Go back')`, passing unchanged). Governs R6.
- KTD3. **Add a cuisine-to-emoji lookup alongside the existing cuisine-to-color lookup.** A `CUISINE_EMOJI` table pairs each of the 12 `CURATED_CUISINES` entries with one emoji (Burger 🍔, French 🥖, Italian 🍝, Indian 🍛, Japanese 🍣, Chinese 🥡, Thai 🍜, Mexican 🌮, Pizza 🍕, Korean 🍲, Vietnamese 🥢, Café ☕️); any other cuisine gets one generic fallback emoji (🍴), and the "Uncategorized" sentinel gets its own distinct emoji (🍽️) rather than the generic fallback. Exposed as `emojiForCuisine(cuisine)`, mirroring `colorForCuisine`'s normalize-then-lookup shape. Governs R8.
- KTD4. **Rank present cuisines by restaurant count (descending, alphabetical tie-break) for the default filter row; pin active cuisines into it, growing the row when needed.** The default row shows the top 6 by that ranking. A cuisine outside the top 6 that is currently active in the filter is pinned into the default row anyway; when 6 or fewer cuisines are active, pinning bumps the least-used non-active entry, so an active filter is never hidden behind "+N autres". When more than 6 cuisines are simultaneously active (the filter is multi-select), the default row grows past 6 to fit every active cuisine — the "never hidden" guarantee holds regardless of how many cuisines are active (session-settled: user-directed for the top-6/wrapped-row default, chosen over a horizontal-scroll alternative after visual review; user-directed for growing the row past 6 rather than capping the guarantee at 6 active cuisines, confirmed during document review). Deselecting a pinned, off-top-6 cuisine reflows the row immediately on the next render — no hold-until-next-toggle or transition (session-settled: user-directed, confirmed during document review). "Uncategorized" always renders in the default row, outside the ranked pool — unchanged from its current unconditional-append behavior. Governs R1, R2.
- KTD5. **A restaurant's card shows a visit count only when visited.** "N visits" renders alongside the status/verdict chip only when status is "visited" (visit count ≥ 1); a to-try or pending/provisional card shows its chip with no count. Governs R11.
- KTD6. **The cuisine row's disclosure control is a dedicated button, not a reused `Chip`.** "+N autres"/"Réduire" carries `aria-expanded` and `aria-controls` pointing at the cuisine chip group, since `Chip` is built for `aria-pressed` toggle semantics, not disclosure; focus stays on that same button across the toggle rather than unmounting/remounting (session-settled: user-approved, confirmed during document review). Governs R1, R2.
- KTD7. **Cuisine emoji and verdict icons render as aria-hidden siblings everywhere they appear, not only in `Badge`.** `Chip` (`FilterBar.tsx`) is extended to accept an optional aria-hidden icon element rendered before its label text — the same pattern KTD2 defines for `Badge` — so the cuisine emoji and verdict icon additions in `Chip` (U3) and the cuisine badge's emoji in the list card (U4) never concatenate into the accessible name (session-settled: user-approved, confirmed during document review; extends KTD2's established pattern rather than introducing a new one). Governs R6, R8.
- KTD8. **Card and cuisine-badge text color is derived from the computed relative luminance of `colorForCuisine(...)`.** Pick white or near-black text per a WCAG-style luminance threshold, rather than one fixed text color, since curated and hashed cuisine colors span a wide luminance range (session-settled: user-approved, confirmed during document review). Governs R9, R10.

### Sequencing

U1 and U2 have no dependencies and can proceed in any order. U3 and U4 both depend on U1 and U2, and can then proceed in any order relative to each other.

---

## Implementation Units

### U1. Verdict palette retint and icons

- **Goal:** Retint the two ambiguous verdict tokens and give every verdict a distinguishing icon, without disturbing existing label text.
- **Requirements:** R6, R7 (KTD1, KTD2)
- **Dependencies:** none
- **Files:** `src/index.css`, `src/features/StatusBadge.tsx`, `src/features/RestaurantList.test.tsx`, `src/features/visits/RestaurantDetail.test.tsx`, `src/features/decide/DecidePanel.test.tsx`, `src/features/facets/FilterBar.test.tsx`
- **Approach:**
  1. Retint `--color-verdict-detour` and `--color-verdict-once` in `src/index.css` to the KTD1 values; leave `--color-verdict-go-back` and `--color-verdict-never` unchanged.
  2. Add a `VERDICT_ICON` map in `src/features/StatusBadge.tsx`, parallel to the existing `VERDICT_BADGE_CLASS` map (`StatusBadge.tsx:4-9`).
  3. Render the icon as an `aria-hidden` sibling span before the label text span inside `Badge`/`VerdictBadge`, only for verdict-mode badges — neutral states ("À essayer"/"To try", "Resolving…", generic "Visited") stay icon-less, per KTD2.
- **Patterns to follow:** the existing `VERDICT_BADGE_CLASS` record shape (`StatusBadge.tsx:4-9`) and the `Badge` component it feeds (`StatusBadge.tsx:11-19`).
- **Test scenarios:**
  - Happy path: each of the four verdict badges renders its assigned icon plus its unchanged label text, still queryable via exact-text lookup (e.g. `screen.getByText('Go back')`).
  - Happy path: verdict chips render in the fixed order (Go back, Worth a detour, Once was enough, Never again), each with its icon — a regression assertion on the ordering the code already produces.
  - Edge case: neutral states ("To try", "Resolving…") render with no verdict icon.
  - Integration: `RestaurantList.test.tsx`, `RestaurantDetail.test.tsx`, and `DecidePanel.test.tsx`'s existing exact-text verdict/status queries still pass unchanged, confirming the icon is a separate node from the label.
- **Verification:** `npm test`; manual check in the running app that "Once was enough" no longer reads as green/positive.

### U2. Cuisine emoji lookup

- **Goal:** Give every cuisine — curated or free-text — a representative emoji alongside its existing color.
- **Requirements:** R8 (KTD3)
- **Dependencies:** none
- **Files:** `src/features/facets/cuisines.ts`, `src/features/facets/cuisines.test.ts`
- **Approach:**
  1. Add the `CUISINE_EMOJI` table and the fallback/uncategorized emoji constants from KTD3, next to `CURATED_CUISINES` and `UNCATEGORIZED_COLOR`.
  2. Export `emojiForCuisine(cuisine: string | null | undefined): string`, mirroring `colorForCuisine`'s normalize-then-lookup shape (`cuisines.ts:47-51`).
- **Patterns to follow:** `colorForCuisine`'s case-insensitive lookup and the `CURATED_BY_KEY` map (`cuisines.ts:20`, `47-51`).
- **Test scenarios:**
  - Happy path: `emojiForCuisine('French')` and `emojiForCuisine('french')` both return the curated French emoji (case-insensitive, mirroring the existing `colorForCuisine` test at `cuisines.test.ts:5-9`).
  - Happy path: `emojiForCuisine(undefined)` / `''` / `'   '` return the Uncategorized emoji, distinct from the generic fallback.
  - Edge case: a free-text cuisine not in the curated map (e.g. `'Ethiopian'`) returns the generic fallback emoji, not the Uncategorized one.
- **Verification:** `npm test` for `cuisines.test.ts`.

### U3. Filter bar: collapsible cuisine row and separated groups

- **Goal:** Reclaim vertical space in the filter bar by collapsing the cuisine row by default, and make cuisine visually distinct from status/verdict.
- **Requirements:** R1, R2, R3, R4, R5, R6, R8 (KTD4, KTD6, KTD7)
- **Dependencies:** U1, U2
- **Files:** `src/features/facets/FilterBar.tsx`, `src/features/facets/FilterBar.test.tsx`
- **Approach:**
  1. Split the current single chip block into two labeled groups with a divider between them: "Cuisine" and "Statut & verdict" (R3, R4).
  2. Add a ranking step over `presentCuisines`' output — restaurant count descending, alphabetical tie-break — to compute the default (top 6, every pinned active cuisine beyond 6 growing the row, per KTD4) versus the overflow.
  3. Add local `expanded` boolean state; render a dedicated disclosure button ("+N autres" / "Réduire") — not the `Chip` component — carrying `aria-expanded` and `aria-controls` pointing at the cuisine chip group, with focus staying on that button across the toggle (KTD6). "Uncategorized" always renders in the default row.
  4. Extend `Chip` to accept an optional aria-hidden icon element rendered before its label text (KTD7). Pass the cuisine emoji (`emojiForCuisine`, U2) to each cuisine chip, and the verdict icon (`VERDICT_ICON`, U1) to each verdict chip — never concatenated into the label string.
- **Technical design (directional):**
  ```
  ranked = presentCuisines(restaurants) sorted by count desc, name asc
  default = pin(active ∩ ranked) into first 6 slots, growing past 6 if |active ∩ ranked| > 6
  overflow = ranked - default
  ```
- **Patterns to follow:** the existing `Chip` component and `presentCuisines` (`FilterBar.tsx:12-40`, `42-50`); KTD2's aria-hidden icon-sibling pattern, extended per KTD7; the lowercased-Set-key convention in `docs/solutions/design-patterns/normalize-filter-selection-keys-at-the-boundary.md` for any new cuisine-name lookup this unit adds.
- **Test scenarios:**
  - Happy path: with more than 6 cuisines present, the default render shows the 6 most-used plus "Uncategorized" (if present) plus "+N autres"; activating it reveals every remaining ranked cuisine, with "Réduire" to collapse back. Covers AE1.
  - Edge case: a cuisine outside the top 6 that is currently active in the filter still renders in the default (collapsed) row.
  - Edge case: with more than 6 cuisines simultaneously active, the default row grows past 6 to show all of them (KTD4).
  - Edge case: deselecting a pinned, off-top-6 active cuisine reflows the default row immediately on the next render (KTD4).
  - Happy path: the cuisine group and the "Statut & verdict" group render under separate labels with a divider between them.
  - Happy path: verdict chips render in the fixed order with their icons (shares coverage with U1's ordering scenario).
  - Happy path: each cuisine chip shows its emoji next to its name, as a separate aria-hidden element from the label text — exact-name queries (e.g. `getByRole('button', {name: 'Thai'})`) still resolve.
  - Happy path: the "+N autres"/"Réduire" button carries `aria-expanded` matching its state.
  - Edge case: with 6 or fewer cuisines present, no "+N autres" control renders.
- **Verification:** `npm test` for `FilterBar.test.tsx`; manual check of the default vs. expanded state, the active-pin/grow/reflow behavior, and keyboard/screen-reader operation of the disclosure button in the running app.

### U4. Restaurant list: cuisine-tinted cards

- **Goal:** Replace the flat divided list row with a cuisine-tinted card, moving the cuisine badge to the top-right and the status/verdict chip plus visit count into the card body.
- **Requirements:** R8, R9, R10, R11 (KTD5, KTD7, KTD8)
- **Dependencies:** U1, U2
- **Files:** `src/features/RestaurantList.tsx`, `src/features/RestaurantList.test.tsx`
- **Approach:**
  1. Replace the flat `<li>` row with a margined, rounded card whose background is tinted by `colorForCuisine(r.cuisine)` (R9).
  2. Render the cuisine's name and an aria-hidden emoji (`emojiForCuisine`, U2, per KTD7) as a solid-colored badge in the card's top-right corner, in the position `StatusBadge` occupies today (R10).
  3. Move `StatusBadge` into the card body below the name, alongside a visit-count label shown only when visited (KTD5) — pending and to-try rows show no count (R11).
  4. Pick card and badge text color from the computed relative luminance of `colorForCuisine(r.cuisine)` (KTD8), not one fixed color.
- **Patterns to follow:** the existing row markup and `colorForCuisine`/`StatusBadge` calls (`RestaurantList.tsx:35-45`); the `r()` test factory and text-content-assertion style already used in `RestaurantList.test.tsx`; KTD2's aria-hidden icon-sibling pattern, extended per KTD7.
- **Test scenarios:**
  - Happy path: a visited restaurant's card background is tinted by its cuisine color, its cuisine badge (name + emoji) sits in the top-right, and its status/verdict chip plus "N visits" sit in the card body, not beside the name. Covers AE4.
  - Happy path: a to-try restaurant's card shows the neutral "To try" chip with no visit count.
  - Edge case: a pending/provisional restaurant's card shows "Resolving…" with no visit count, regardless of its stored visit count.
  - Edge case: a restaurant with no cuisine renders the existing "uncategorized" tint and emoji, not a blank badge.
  - Edge case: card/badge text renders white against a low-luminance cuisine color and near-black against a high-luminance one (KTD8).
- **Verification:** `npm test` for `RestaurantList.test.tsx`; manual check that the four verdict-tinted badges and cuisine-tinted card backgrounds are visually distinct, and that badge/card text stays legible across the full curated + hashed cuisine color set, in the running app.

---

## Verification Contract

| Check | Command | Applies to |
|---|---|---|
| Type check | `npm run lint` (`tsc --noEmit`) | All units |
| Unit/component tests | `npm test` (`vitest run`) | U1, U2, U3, U4 |
| Production build | `npm run build` | All units |
| Manual visual check | `npm run dev`; compare filter collapse/expand, cuisine emoji, verdict palette, and card backgrounds against the confirmed sketches | U1, U3, U4 |

No visual-regression/screenshot tooling exists in this repo (matching the prior design-refresh plan); manual browser checks are the verification method for the visual changes.

---

## Definition of Done

- All four units implemented and their test scenarios passing.
- `npm run lint`, `npm test`, and `npm run build` all succeed with no new failures.
- The cuisine filter row is collapsed to one line by default regardless of how many cuisines are in use, with every cuisine reachable via "+N autres".
- Every verdict renders with its icon and the retinted palette; "Once was enough" no longer reads as green/positive.
- The "+N autres"/"Réduire" disclosure control is keyboard- and screen-reader-operable (KTD6); every added icon/emoji renders as a non-redundant, aria-hidden element (KTD7); card and badge text stays legible against every cuisine color (KTD8).
- Every restaurant card in the main list shows a cuisine-tinted background, a top-right cuisine badge with emoji, and a status/verdict chip — with a visit count shown only when the restaurant has been visited (KTD5).
- Any dead-end code from approaches tried and abandoned during implementation is removed, not left in the diff.
