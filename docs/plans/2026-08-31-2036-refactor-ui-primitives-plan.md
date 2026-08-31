---
title: UI Primitives Factoring - Plan
type: refactor
date: 2026-08-31
topic: ui-primitives
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: ce-brainstorm
execution: code
---

# UI Primitives Factoring - Plan

**Product Contract preservation:** restructured, no scope change — R8's file list corrected from 2 to 4 sites (`App.tsx:192`, `App.tsx:226` added) after planning research found the same base formula used without the `+1rem` offset elsewhere in `App.tsx`; the requirement's intent (one shared definition replacing the duplicated formula) is unchanged.

## Goal Capsule

- **Objective:** Inline Tailwind class duplication across `App.tsx`, `SortBar.tsx`, `FilterBar.tsx`, and several panels is eliminated behind a small set of reusable, tested UI primitives, so a future style change touches one file instead of five-plus call sites.
- **Means:** Extract `Button`, `Badge`, `ToggleChip`, `Eyebrow`, a `cn` class-merging helper, and a shared safe-area-floating utility from the existing duplicated markup, following the `Modal.tsx`/`ModalHeader.tsx` pattern already established in `src/features/ui/` (KTD1-KTD7).
- **Product authority:** Product Contract below governs scope and visual behavior; Planning Contract governs technical mechanism within that scope.
- **Execution profile:** standard code change — no migration, no external service, no rollout sequencing beyond normal PR review.
- **Stop conditions:** none currently open. If migrating a call site changes its rendered layout beyond the reconciliations named in KD1, stop and flag before continuing to the next unit.
- **Tail ownership:** implementer runs `npm run test` and `npm run lint`; PR review confirms no visual regression outside KD1's named reconciliations.
- **Open blockers:** none.

---

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
- R8. The `var(--spacing-toggle-bar)+env(safe-area-inset-bottom)` base formula — duplicated across `App.tsx:192`, `App.tsx:226` (both without the extra `+1rem` offset), `App.tsx:247`'s FAB, and `features/pwa/ReloadPrompt.tsx:46` (both with the `+1rem` offset) — is replaced by one shared definition covering all four sites (mechanism, and how the optional `+1rem` offset is expressed, left to planning). `App.tsx:259`'s unrelated `calc(0.375rem+env(safe-area-inset-bottom))` uses a different base token and is out of scope.

### Key Decisions

- **KD1. Uniformize discovered visual inconsistencies rather than preserve pixel-parity.** Extraction is also a small cleanup pass: `RestaurantDetail.tsx`'s brand-tinted secondary-button hover (`hover:bg-brand-soft` instead of the neutral `hover:bg-gray-100` used elsewhere), `SortBar.tsx`'s direction-toggle button (no `active:` state and a border-color hover instead of the `hover:bg-gray-100`/`active:bg-gray-200` pattern the other secondary sites share), `PortabilityPanel.tsx`'s export button (missing the `active:` states the other call sites have) and its confirm-import button (`py-1.5`/`mt-2` instead of the `py-2.5`/`mt-3` used elsewhere), and `AddPlace.tsx`'s primary button (`py-2` instead of the `py-2.5` used everywhere else) all converge on one canonical style — including one shared way of expressing the `disabled` state, which `AddPlace.tsx`, both `PortabilityPanel.tsx` buttons, and `RestaurantDetail.tsx`'s secondary pill currently opt into ad hoc via `disabled:opacity-50` — instead of being preserved as one-off variants. (session-settled: user-approved — chosen over preserving each site's exact current rendering: pixel parity would complicate the shared component API for no real benefit.) Governs R1, R2.
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

**Deferred to Follow-Up Work:**

- Per-cuisine "color dot" swatches — `FilterBar.tsx`'s chip color dot, `RestaurantDetail.tsx`'s cuisine swatch, and `RestaurantList.tsx`'s `color-mix()` card tint — share the same "can't be a static Tailwind class" shape as `Badge`'s color mode (found during planning research), but are a visually distinct element (a dot/tint, not a badge). Not pulled into this plan's diff.

### Dependencies / Assumptions

- Assumes the existing design tokens in `index.css` (`--color-brand*`, `--color-verdict-*`, `--spacing-toggle-bar`) are sufficient for every extracted primitive; no new tokens are anticipated.
- Assumes the `Modal.tsx` / `ModalHeader.tsx` convention (variant behavior expressed as a `Record<Variant, {...}>` map, not a general-purpose variant library) is the model the new primitives should replicate.

### Sources / Research

Verified locations for each duplicated pattern (grep-confirmed against the current tree):

- Primary "brand" button (R1): `src/App.tsx:200`, `src/features/decide/DecidePanel.tsx:82`, `src/features/visits/RestaurantDetail.tsx:254`, `src/features/portability/PortabilityPanel.tsx:141` (export button — missing `active:` states, has `disabled:opacity-50`), `src/features/portability/PortabilityPanel.tsx:178` (confirm-import button — `py-1.5`/`mt-2` instead of `py-2.5`/`mt-3`, has `active:` states and `disabled:opacity-50`), `src/features/capture/AddPlace.tsx:120` (`py-2` instead of `py-2.5`, has `disabled:opacity-50`).
- Secondary pill button (R2): `src/App.tsx:164,173,183`, `src/features/facets/SortBar.tsx:80` (no `active:` state, border-color hover instead — see KD1), `src/features/visits/RestaurantDetail.tsx:32` (brand-tinted hover and ad hoc `disabled:opacity-50` — see KD1).
- Badge (R3, R4): `src/features/StatusBadge.tsx:11` (shared `Badge`), `src/features/RestaurantList.tsx:77` (cuisine tag, currently hand-rolled with inline `style`).
- Toggle chip (R5): `src/features/facets/SortBar.tsx:20-27,57-75` (`segmentClass`), `src/features/facets/FilterBar.tsx:17-48` (`Chip`).
- Eyebrow (R6): `src/features/settings/SettingsPanel.tsx:18`, `src/features/facets/SortBar.tsx:56`, `src/features/facets/FilterBar.tsx:131`. `FilterBar.tsx:50-52`'s `GroupLabel` is the excluded `text-[10px]` variant (KD6).
- Safe-area formula (R8): `src/App.tsx:192,226` (base formula, no offset), `src/App.tsx:247` and `src/features/pwa/ReloadPrompt.tsx:46` (base formula `+1rem`). `src/App.tsx:259` uses an unrelated formula and is out of scope.
- Existing shared-primitive precedent: `src/features/ui/Modal.tsx`, `src/features/ui/ModalHeader.tsx` (plus their colocated `.test.tsx` files) — Vitest + Testing Library, `useTranslation` mocked with a lightweight passthrough, assertions via `getByRole`/`toHaveClass` rather than snapshots (`ModalHeader.test.tsx`).
- Repo conventions confirmed by planning research: no exported component `Props` types (inline destructured prop types only), no barrel file in `src/features/ui/` (components imported by direct relative path), no ESLint/Prettier/class-order tooling (`lint` is `tsc --noEmit`).
- Related learning: `docs/solutions/design-patterns/normalize-filter-selection-keys-at-the-boundary.md` — `FilterBar.tsx`'s active/toggle state must read and write the same lowercased key the filter predicate uses; the toggle-chip extraction (U4) must not reintroduce a raw-string comparison at a new layer.

---

## Planning Contract

### Key Technical Decisions

- **KTD1. Single `Button` component, `variant` prop.** `Button` takes `variant: 'primary' | 'secondary'` rather than being split into separate exported components, matching the `Record<Variant, {...}>` shape `ModalHeader.tsx` already uses for its own variants. Governs R1, R2.
- **KTD2. Disabled styling lives inside `Button`, for both variants.** `Button` applies one shared disabled treatment whenever the native `disabled` prop is set, regardless of `variant`, rather than each call site opting in with its own class — this absorbs `AddPlace.tsx`'s and `PortabilityPanel.tsx`'s ad hoc `disabled:opacity-50` on the primary variant, and `RestaurantDetail.tsx`'s secondary pill's existing ad hoc `disabled:opacity-50` on the secondary variant. (session-settled: user-approved — chosen over preserving each site's exact current rendering: pixel parity would complicate the shared component API for no real benefit.) Governs R1, R2.
- **KTD3. `Badge` takes exactly one of `tone` (a Tailwind class) or `color` (a raw CSS color string), never both.** `tone` covers the closed status/verdict set and keeps `Badge`'s current fixed white text. `color` covers per-cuisine values and computes its own contrasting text color internally, using the same luminance-based black/white choice `RestaurantList.tsx` already makes (`textColorFor`) — moved into `Badge` rather than left as a separate caller-supplied prop, since it's a direct function of the color `Badge` already receives. (session-settled: user-approved — chosen over two separate components: avoids two places to keep visually in sync.) Governs R3, R4.
- **KTD4. Toggle-chip exposes a `shape: 'segment' | 'pill'` prop.** `shape="segment"` renders only the button's own active/hover/disabled treatment, with no self-border or self-rounding — the connecting group chrome (the shared rounded pill wrapper and the divider between `SortBar`'s two segments) stays bespoke markup in `SortBar.tsx`, since that wrapper isn't duplicated anywhere else. `shape="pill"` renders the full standalone rounded, bordered pill `FilterBar.tsx` uses today. (session-settled: user-approved — chosen over two separate components: shares the active/hover/disabled logic in one place.) Governs R5.
- **KTD5. `FilterBar`'s lowercase-key normalization stays at the call site, not inside the toggle-chip.** The toggle-chip only receives `active`/`onClick`; `FilterBar.tsx` keeps computing both from the same lowercased key the filter predicate uses, exactly as today (`docs/solutions/design-patterns/normalize-filter-selection-keys-at-the-boundary.md`), so the extraction cannot silently reintroduce a raw-string comparison at a new layer. Governs R5.
- **KTD6. Safe-area formula becomes one CSS custom property in `src/index.css`**, following the existing plain-custom-property convention already used for `--spacing-toggle-bar` and the `--color-*` tokens — not a new Tailwind `@utility` class. The two sites without the `+1rem` offset and the two with it apply the same base property, adding `+ 1rem` only where needed. Governs R8.
- **KTD7. `cn` is a minimal variadic joiner**: accepts strings and falsy values (`false`/`null`/`undefined`/`''`), filters falsy, joins the rest with a single space. No array/object argument forms and no Tailwind-aware conflict resolution — that's `tailwind-merge`'s job, and it's out of scope per KD2. (session-settled: user-approved — chosen over adding `clsx`: the extra dependency isn't justified by the current need.) Governs R7.

### Assumptions

- `Badge`'s `tone`/`color` split (KTD3) is enforced at the TypeScript type level (a discriminated union), not with a runtime check — this repo has no runtime prop-validation convention to extend.
- The safe-area custom property's exact name and whether the `+1rem` variant is a second derived property or an inline `+ 1rem` at the call site (KTD6) is an implementation-time naming choice, not a product-visible one.

---

## Implementation Units

### U1. `cn` class-merging helper

- **Goal:** Provide a hand-written class-merging utility so every new primitive can express conditional classes without template-literal concatenation.
- **Requirements:** R7 (KTD7)
- **Dependencies:** none
- **Files:**
  - `src/lib/cn.ts` (create)
  - `src/lib/cn.test.ts` (create)
- **Approach:** Implement per KTD7 — variadic string/falsy joiner, no dependency added.
- **Patterns to follow:** existing `src/lib/` module + colocated test pairing (e.g. `src/lib/sortPreference.ts`).
- **Test scenarios:**
  - Two truthy strings join with a single space.
  - Falsy arguments (`false`, `null`, `undefined`, `''`) are filtered out, not joined as literal text.
  - Calling with no arguments returns an empty string.
- **Verification:** `npm run test` passes for `cn.test.ts`; `U2`-`U5` each import it.

### U2. `Button` primitive and call-site migration

- **Goal:** One shared `Button` replaces the primary "brand" and secondary pill markup duplicated across five files, converging the visual inconsistencies named in KD1 onto one canonical style.
- **Requirements:** R1, R2 (KTD1, KTD2)
- **Dependencies:** U1
- **Files:**
  - `src/features/ui/Button.tsx` (create)
  - `src/features/ui/Button.test.tsx` (create)
  - `src/App.tsx` (modify — 1 primary site, 3 secondary sites)
  - `src/features/capture/AddPlace.tsx` (modify — 1 primary site)
  - `src/features/decide/DecidePanel.tsx` (modify — 1 primary site)
  - `src/features/visits/RestaurantDetail.tsx` (modify — 1 primary site, 1 secondary site)
  - `src/features/portability/PortabilityPanel.tsx` (modify — 2 primary sites)
  - `src/features/facets/SortBar.tsx` (modify — direction-toggle secondary site only)
- **Approach:**
  1. Build `Button` per KTD1/KTD2: `variant` prop selects the base class set, native `disabled` gets the shared treatment, a caller `className` merges via `cn` for layout-only classes (`w-full`, `mt-3`) that stay at the call site.
  2. Migrate each listed call site to `Button`, removing its local class string. One of `App.tsx`'s three secondary sites (the Settings trigger, `App.tsx:183`) is icon-only (`p-1.5`, no `px-3`/text sizing) — since `cn` does not de-duplicate conflicting Tailwind classes (KTD7), give `Button` an icon-only sizing option rather than relying on a caller `className` to override the text-pill padding.
  3. Leave `App.tsx`'s FAB (`App.tsx:247`, round icon-only) and the bottom nav toggle bar alone — visually distinct from both `Button` variants.
- **Technical design (directional):** `Button({variant, className, ...rest}: {variant: 'primary' | 'secondary'} & ButtonHTMLAttributes<'button'>)`, selecting from a `Record<'primary' | 'secondary', string>` base-class map in the shape of `ModalHeader.tsx`'s `VARIANT_STYLES`, merged with `cn(base, className)`.
- **Patterns to follow:** `src/features/ui/ModalHeader.tsx`'s `Record<Variant, {...}>` map.
- **Test scenarios:**
  - Renders its children and forwards `onClick`.
  - `variant="primary"` applies the brand-background class; `variant="secondary"` applies the pill/border class.
  - `disabled` applies the shared disabled treatment.
  - The canonical hover and active classes (the neutral `hover:bg-gray-100`-equivalent for secondary, the `active:` state for primary) are present on both variants regardless of call site — this is the assertion that proves KD1's reconciliation actually landed.
  - A caller-supplied `className` (e.g. `"w-full"`) appears alongside the variant's base classes.
- **Verification:** none of the six migrated files retains a copy of the old class string; existing test suites touching these files pass unchanged; `npm run test` passes for the new `Button.test.tsx`.

### U3. `Badge` primitive and cuisine-tag migration

- **Goal:** `Badge` is extracted from `StatusBadge.tsx` as its own two-mode component and reused by `RestaurantList.tsx`'s cuisine tag, reconciling their sizing per KD1.
- **Requirements:** R3, R4 (KTD3)
- **Dependencies:** U1
- **Files:**
  - `src/features/ui/Badge.tsx` (create — moved out of `src/features/StatusBadge.tsx`)
  - `src/features/ui/Badge.test.tsx` (create)
  - `src/features/StatusBadge.tsx` (modify — import `Badge` instead of defining it locally)
  - `src/features/RestaurantList.tsx` (modify — cuisine tag renders through `Badge`)
- **Approach:**
  1. Move the existing `Badge` function into `src/features/ui/Badge.tsx`, adding the `tone`/`color` split from KTD3 in place of its current single `className` prop. Move `RestaurantList.tsx`'s `textColorFor` luminance helper into `Badge` too, so `color` mode computes its own contrasting text instead of hardcoding white.
  2. Update `StatusBadge.tsx`'s three call sites to pass `tone`.
  3. Update `RestaurantList.tsx`'s cuisine tag to render `Badge` with `color={cuisineColor}` instead of its own `<span style=...>`, reconciling its padding/weight down to `Badge`'s existing sizing (KD1) and dropping its now-redundant local `textColorFor` call. `RestaurantList.tsx`'s cuisine-colored card background (`color-mix(...)`) is a distinct usage and stays untouched (see Scope Boundaries).
- **Technical design (directional):** `Badge({text, icon?, ...} & ({tone: string; color?: never} | {color: string; tone?: never}))` — the union makes "exactly one of `tone`/`color`" a compile-time guarantee, not a runtime check (see Assumptions). `color` mode picks the same black/white text via the luminance threshold `RestaurantList.tsx`'s `textColorFor` already uses.
- **Patterns to follow:** current `Badge` (`src/features/StatusBadge.tsx:11-16`); `RestaurantList.tsx`'s existing `textColorFor` luminance function, moved rather than reimplemented.
- **Test scenarios:**
  - `tone` mode renders the given Tailwind class at the shared badge sizing, with fixed white text.
  - `color` mode renders the given inline background color at the same sizing, with black or white text chosen by the same luminance rule `RestaurantList.tsx` uses today.
  - `VerdictBadge`/`StatusBadge` (existing consumers) keep their current rendered output after the move.
  - The cuisine tag renders the same emoji/label/text-contrast result as today, at `Badge`'s sizing.
- **Verification:** existing tests covering `StatusBadge` and `RestaurantList` pass unchanged; new `Badge.test.tsx` covers both modes.

### U4. `ToggleChip` primitive and SortBar/FilterBar migration

- **Goal:** A shared toggle-chip replaces `SortBar`'s `segmentClass` logic and `FilterBar`'s local `Chip`, preserving `FilterBar`'s key-normalization contract.
- **Requirements:** R5 (KTD4, KTD5)
- **Dependencies:** U1
- **Files:**
  - `src/features/ui/ToggleChip.tsx` (create)
  - `src/features/ui/ToggleChip.test.tsx` (create)
  - `src/features/facets/SortBar.tsx` (modify — replace `segmentClass` + inline buttons with `ToggleChip shape="segment"`)
  - `src/features/facets/FilterBar.tsx` (modify — replace the local `Chip` with `ToggleChip shape="pill"`)
- **Approach:**
  1. Build `ToggleChip` per KTD4.
  2. `FilterBar.tsx`'s color-dot and icon rendering stay as slot content passed into `ToggleChip`, not hardcoded into the shared component — cuisine chips are its only consumer today.
  3. `SortBar.tsx` keeps its own wrapping group container and segment divider (KTD4); only the per-button class collapses into `ToggleChip`.
  4. Preserve KTD5: `FilterBar.tsx`'s `active`/`onClick` wiring keeps computing the same lowercased key exactly as today; only the rendered markup changes.
- **Technical design (directional):** `ToggleChip({shape: 'segment' | 'pill', active, disabled?, onClick, children})`.
- **Patterns to follow:** current `segmentClass` (`SortBar.tsx:20-27`) and `Chip` (`FilterBar.tsx:17-48`) for the exact active/hover/disabled class values to preserve.
- **Test scenarios:**
  - `shape="pill"` active and inactive renders match `FilterBar`'s current classes.
  - `shape="segment"` active, inactive, and disabled renders match `SortBar`'s current classes.
  - `aria-pressed` reflects `active` in both shapes.
  - Covers the normalize-filter-selection-keys-at-the-boundary contract: `FilterBar`'s existing cuisine-toggle behavior (active state and toggle both keyed on the same lowercased value) is unchanged after the migration.
- **Verification:** `SortBar` and `FilterBar` existing test suites pass with unchanged behavior; new `ToggleChip.test.tsx` covers both shapes.

### U5. `Eyebrow` primitive and section-title migration

- **Goal:** A shared `Eyebrow` replaces the duplicated section-title classes in three files.
- **Requirements:** R6 (KD6)
- **Dependencies:** U1
- **Files:**
  - `src/features/ui/Eyebrow.tsx` (create)
  - `src/features/ui/Eyebrow.test.tsx` (create)
  - `src/features/settings/SettingsPanel.tsx` (modify — renders `Eyebrow` as its existing `<h3>` heading)
  - `src/features/facets/SortBar.tsx` (modify — renders `Eyebrow` at its default `<span>`)
  - `src/features/facets/FilterBar.tsx` (modify — only the top-level "Filters" label, at its default `<span>`; `GroupLabel` is untouched per KD6)
- **Approach:** A simple wrapper rendering the shared eyebrow classes around `children`, with a polymorphic `as` prop (default `span`) so `SettingsPanel.tsx` can keep rendering its existing `<h3>` heading landmark instead of collapsing to a generic element. No other variant prop — KD6 keeps `GroupLabel` unmigrated.
- **Test scenarios:**
  - Renders its children with the shared eyebrow classes.
  - Default render (no `as`) produces a `<span>`; `as="h3"` produces an `<h3>` with the same classes.
  - Test expectation: none beyond the above — no other conditional logic to branch on.
- **Verification:** the three call sites render through `Eyebrow`; `FilterBar.tsx`'s `GroupLabel` is unmodified; existing tests for the three files pass.

### U6. Shared safe-area definition and call-site migration

- **Goal:** One CSS custom property replaces the repeated `calc()` formula duplicated across four sites.
- **Requirements:** R8 (KTD6)
- **Dependencies:** none
- **Files:**
  - `src/index.css` (modify — add the shared custom property near `--spacing-toggle-bar`)
  - `src/App.tsx` (modify — `App.tsx:192`, `226`, `247`)
  - `src/features/pwa/ReloadPrompt.tsx` (modify — `ReloadPrompt.tsx:46`)
- **Approach:** Define the base property once; the two sites needing the extra offset add `+ 1rem` rather than duplicating the full `env(safe-area-inset-bottom)` term. `App.tsx:259`'s unrelated formula is untouched.
- **Test scenarios:**
  - Test expectation: none — pure CSS token consolidation with no behavioral branch; verify visually (see Verification).
- **Verification:** the four sites resolve to the same rendered bottom/padding-bottom value as before the change (manual visual comparison — this repo has no automated check for computed CSS custom properties).

---

## Verification Contract

| Command | Applicability |
|---|---|
| `npm run test` (`vitest run`) | Full suite, including new `.test.tsx` files for every primitive — must pass with no regressions. |
| `npm run lint` (`tsc --noEmit`) | Must pass — also the only check that would catch a `Badge` call site supplying both `tone` and `color`. |
| Manual visual comparison | For each touched screen (restaurant list, filters, sort bar, add-place, decide, portability, restaurant detail, settings, FAB/reload-prompt positioning), confirm only the KD1 reconciliations changed appearance. |

---

## Definition of Done

- `npm run test` and `npm run lint` both pass.
- No leftover copy of any of the six originally-duplicated class strings remains in the touched files.
- Every new primitive (`Button`, `Badge`, `ToggleChip`, `Eyebrow`, `cn`) has a colocated test file.
- Manual visual comparison confirms no unintended regression outside the KD1 reconciliations.
- Any dead code from an abandoned approach is removed before merge.
