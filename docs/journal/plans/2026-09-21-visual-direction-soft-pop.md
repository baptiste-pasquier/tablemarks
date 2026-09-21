---
title: Visual Direction Soft Pop - Plan
type: feat
date: 2026-09-21
topic: visual-direction-soft-pop
status: ready
---

# Visual Direction Soft Pop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the "Carnet culinaire" identity with Soft Pop - neutral grays, a green accent, Plus Jakarta Sans, borderless cards - and rebuild the cuisine palette as a hue system that keeps twelve curated cuisines and open-ended user cuisines visually distinct.

**Architecture:** Every token name in `src/index.css` is preserved and only its value changes, so the whole app retints without a `className` edit. The cuisine palette stops storing a hex per cuisine and stores a hue, from which three uses (pastel pill, solid marker, filter dot) derive by formula. Components change only where the shape language changes: cards lose their borders and their cuisine tint, statuses become pastel pills, and the logo is redrawn.

**Tech Stack:** React 19, TypeScript, Tailwind v4 (`@theme`), Vitest + Testing Library, Leaflet, vite-plugin-pwa, sharp (new).

**Spec:** `docs/journal/specs/2026-09-21-visual-direction-soft-pop-design.md`

## Global Constraints

- Token **names** in `src/index.css` never change - only values. `--font-display`, `--color-teal` and `--color-teal-strong` are the only tokens removed.
- Brand: `--color-brand: #00A97A`, `--color-brand-strong: #00875F`, `--color-brand-soft: #E6F7F1`.
- Cuisine recipes: pill background `oklch(0.96 0.045 H)`, pill text `oklch(0.40 0.13 H)`, solid `oklch(0.48 0.15 H)`. Café alone uses hue 60 at chroma multiplier 0.5.
- Curated hues, 32 degrees apart: Pizza 25, Indian 57, Burger 89, Mexican 121, Italian 153, Korean 185, Vietnamese 217, French 249, Thai 281, Japanese 313, Chinese 345. Café is hue 60, chroma 0.5. Uncategorized is achromatic.
- Never concatenate Tailwind classes by hand - always `cn()` from `src/lib/cn.ts` (AGENTS.md).
- Check `src/features/ui/` before writing classes for a button, badge, chip or header; extend a primitive's variant API rather than making a one-off (AGENTS.md).
- Size limits: 300 lines per module, 250 per component, 60 per function.
- No new user-facing string. If one is unavoidable, it goes in both `en` and `fr` catalogues or the build fails.
- Verification per task: `npm test`, and at the end of the plan also `npm run type-check`, `npx eslint .`, `npx prettier . --check`, `npm run check:docs`.
- Commit after every task. Never amend a previous task's commit.

---

## File Structure

| File | Responsibility after this plan |
| --- | --- |
| `src/index.css` | The only place a color, radius, shadow or font is defined |
| `src/features/facets/cuisines.ts` | Cuisine to hue, and hue to the three rendered forms. The single cuisine-color source |
| `src/features/ui/Badge.tsx` | Two badge modes: `tone` (solid, white text) and `pastel` (explicit background/text pair) |
| `src/features/StatusBadge.tsx` | Chooses solid for a verdict, pastel gray for a status |
| `src/features/RestaurantList.tsx` | White borderless card; cuisine rendered as a pastel pill, not a card tint |
| `src/features/ui/ToggleChip.tsx` | Borderless chips: white with a shadow, brand-soft when active |
| `public/logo.svg` | The constellation mark, for 180 px and up |
| `public/logo-mark.svg` | The front pin alone, for the favicon and 64 px |
| `scripts/generate-icons.mjs` | The source of truth for all six raster icons |
| `docs/reference/design-tokens.md` | The palette contract a future contributor must not break |
| `docs/journal/decisions/0005-visual-direction-soft-pop.md` | Why the direction changed |

---

### Task 1: Tokens and typography

Retints the entire app without touching component logic. Nothing here is unit-testable - the safety net is that the whole existing suite must stay green, because every style assertion in it names a token rather than a value.

**Files:**
- Modify: `src/index.css` (the `@theme` block, lines 1-92)
- Modify: `index.html`
- Modify: `vite.config.ts` (manifest `theme_color`)
- Modify: `src/App.tsx:364`, `src/features/RestaurantList.tsx:32`, `src/features/RestaurantList.tsx:65`, `src/features/map/MapView.tsx:531`

**Interfaces:**
- Consumes: nothing.
- Produces: the CSS custom properties every later task uses - `--color-brand`, `--color-brand-strong`, `--color-brand-soft`, `--color-gray-50` through `--color-gray-950`, `--color-verdict-go-back`, `--color-verdict-detour`, `--color-verdict-once`, `--color-verdict-never`, `--color-verdict-neutral`, plus the new `--radius-card`, `--shadow-card`, `--shadow-brand`. Tailwind exposes these as `bg-brand`, `text-gray-700`, `rounded-card`, `shadow-card`, `shadow-brand`.

- [ ] **Step 1: Capture the green baseline**

Run: `npm test`
Expected: PASS. Note the number of passing tests - Task 1 must not change it.

- [ ] **Step 2: Replace the font and color tokens in `src/index.css`**

Replace lines 4-17 (the font and brand/verdict block) with:

```css
  --font-sans: 'Plus Jakarta Sans', ui-sans-serif, system-ui, sans-serif;

  --color-brand: #00a97a;
  --color-brand-soft: #e6f7f1;
  --color-brand-strong: #00875f;

  --color-verdict-go-back: #00875f;
  --color-verdict-detour: #f59e0b;
  --color-verdict-once: #9aa3b2;
  --color-verdict-never: #f43f5e;
  --color-verdict-neutral: #9aa3b2;
```

`--font-display`, `--color-teal` and `--color-teal-strong` are deleted outright. `--color-verdict-go-back` no longer references a teal token, which is why those two can go.

- [ ] **Step 3: Replace the neutral ramp in `src/index.css`**

Replace the `--color-gray-*` block (lines 79-91, the comment above it included) with:

```css
  /* Soft Pop ramp - neutral grays with no warm cast, replacing the sepia parchment scale. */
  --color-gray-50: #f8fafb;
  --color-gray-100: #f1f4f7;
  --color-gray-200: #e4e8ee;
  --color-gray-300: #d0d6df;
  --color-gray-400: #a8b0bc;
  --color-gray-500: #78808f;
  --color-gray-600: #5a6472;
  --color-gray-700: #3f4855;
  --color-gray-800: #29303b;
  --color-gray-900: #111820;
  --color-gray-950: #070b11;
```

- [ ] **Step 4: Add the radius and shadow tokens**

Append inside the same `@theme` block, after the gray ramp:

```css
  /* Soft Pop shape language: cards carry a shadow instead of a border. */
  --radius-card: 1.125rem;
  --shadow-card:
    0 1px 2px rgb(16 24 40 / 0.05), 0 8px 22px rgb(16 24 40 / 0.06);
  --shadow-brand: 0 6px 16px rgb(0 169 122 / 0.28);
```

- [ ] **Step 5: Update the page background**

In the `body` rule of `src/index.css`, change `background: #fdfaf6;` to `background: #f5f7f9;`.

- [ ] **Step 6: Swap the font link and theme color in `index.html`**

Replace the `<meta name="theme-color">` value with `#00a97a`, and replace the Google Fonts `<link href=...>` with:

```html
      href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap"
```

- [ ] **Step 7: Update the PWA manifest color**

In `vite.config.ts`, change `theme_color: '#d4561f',` to `theme_color: '#00a97a',`.

- [ ] **Step 8: Remove the four `font-display` call sites**

There is no display family any more, so the title register comes from weight and tracking.

- `src/App.tsx:364` — `font-display text-2xl font-semibold tracking-tight` becomes `text-2xl font-bold tracking-tight`
- `src/features/RestaurantList.tsx:32` — `font-display text-lg font-semibold` becomes `text-lg font-bold tracking-tight`
- `src/features/RestaurantList.tsx:65` — `font-display text-base font-semibold` becomes `text-base font-bold tracking-tight`
- `src/features/map/MapView.tsx:531` — `block font-display font-semibold` becomes `block font-bold tracking-tight`

- [ ] **Step 9: Verify nothing references a deleted token**

Run: `grep -rn "font-display\|color-teal\|teal-strong" src index.html`
Expected: no output.

- [ ] **Step 10: Run the full suite**

Run: `npm test`
Expected: PASS, same count as Step 1. If a test fails here it has asserted a *value* rather than a token name - report it rather than editing the assertion, because that is a finding the spec did not predict.

- [ ] **Step 11: Look at it**

Run: `npm run dev`, open the printed URL, and check the list, the map, the detail modal and the decide panel. Everything should be green-on-neutral with no sepia left and no serif anywhere.

- [ ] **Step 12: Commit**

```bash
git add src/index.css index.html vite.config.ts src/App.tsx src/features/RestaurantList.tsx src/features/map/MapView.tsx
git commit -m "feat(ui): retint the app to the Soft Pop token set"
```

---

### Task 2: The cuisine hue system

The core of the change. A cuisine stops carrying a hex and carries a hue; the three rendered forms derive from it.

**Files:**
- Modify: `src/features/facets/cuisines.ts` (full rewrite of the color half; the emoji and `cuisineOptions` halves are untouched)
- Test: `src/features/facets/cuisines.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `export interface CuisineTone { hue: number; chroma: number }`
  - `export function toneForCuisine(cuisine: string | null | undefined): CuisineTone`
  - `export function colorForCuisine(cuisine: string | null | undefined): string` — unchanged signature, now returns an `oklch(...)` string. Its four existing callers (`RestaurantList.tsx`, `FilterBar.tsx`, `RestaurantDetail.tsx`, `map/markers.ts`) need no edit.
  - `export function cuisinePillTokens(cuisine: string | null | undefined): { background: string; color: string }` — new, consumed by Tasks 3 and 5.
  - `export const CURATED_CUISINES: ReadonlyArray<{ name: string; hue: number; chroma: number }>` — the `color` property is replaced by `hue` + `chroma`.
  - `export const UNCATEGORIZED_COLOR: string` — name kept, value now achromatic.
  - `export const CUSTOM_TONES: readonly CuisineTone[]` — exported so the disjointness invariant is testable.

- [ ] **Step 1: Write the failing tests**

Replace the whole `describe('colorForCuisine', ...)` block in `src/features/facets/cuisines.test.ts` with the block below, and add the new `describe`s after it. Leave the `emojiForCuisine` and `cuisineOptions` blocks exactly as they are.

Update the import at the top of the file to:

```ts
import {
  colorForCuisine,
  cuisinePillTokens,
  cuisineOptions,
  emojiForCuisine,
  toneForCuisine,
  CURATED_CUISINES,
  CUSTOM_TONES,
  UNCATEGORIZED_COLOR,
  UNCATEGORIZED_EMOJI,
  GENERIC_CUISINE_EMOJI,
} from './cuisines'
```

```ts
describe('colorForCuisine', () => {
  it('derives the solid form from the cuisine hue, case-insensitively', () => {
    expect(colorForCuisine('French')).toBe('oklch(0.48 0.15 249)')
    expect(colorForCuisine('french')).toBe(colorForCuisine('French'))
  })

  it('returns the neutral color for empty/undefined', () => {
    expect(colorForCuisine(undefined)).toBe(UNCATEGORIZED_COLOR)
    expect(colorForCuisine('')).toBe(UNCATEGORIZED_COLOR)
    expect(colorForCuisine('   ')).toBe(UNCATEGORIZED_COLOR)
  })

  it('assigns a stable, non-neutral color to a custom cuisine', () => {
    const a = colorForCuisine('Ethiopian')
    expect(a).toBe(colorForCuisine('Ethiopian'))
    expect(a).not.toBe(UNCATEGORIZED_COLOR)
  })

  it('never maps a real cuisine onto the neutral color', () => {
    for (const c of [...CURATED_CUISINES.map((x) => x.name), 'Ethiopian', 'Peruvian', 'Ramen']) {
      expect(colorForCuisine(c)).not.toBe(UNCATEGORIZED_COLOR)
    }
  })
})

describe('the cuisine hue wheel', () => {
  it('spaces the eleven wheel cuisines 32 degrees apart, Café excepted', () => {
    const wheel = CURATED_CUISINES.filter((c) => c.chroma === 1).map((c) => c.hue)
    expect(wheel).toEqual([25, 57, 89, 121, 153, 185, 217, 249, 281, 313, 345])
    for (let i = 1; i < wheel.length; i++) {
      expect(wheel[i] - wheel[i - 1]).toBe(32)
    }
  })

  it('gives Café the Burger hue at half chroma, so it reads brown rather than a second amber', () => {
    const cafe = CURATED_CUISINES.find((c) => c.name === 'Café')!
    expect(cafe).toEqual({ name: 'Café', hue: 60, chroma: 0.5 })
  })

  it('offers 22 fallback tones and never reuses a curated hue for a free-text cuisine', () => {
    expect(CUSTOM_TONES).toHaveLength(22)
    const curated = new Set(CURATED_CUISINES.map((c) => c.hue))
    for (const tone of CUSTOM_TONES) {
      expect(curated.has(tone.hue)).toBe(false)
    }
  })

  it('resolves a free-text cuisine to one of the fallback tones, deterministically', () => {
    const tone = toneForCuisine('Ethiopian')
    expect(CUSTOM_TONES).toContainEqual(tone)
    expect(toneForCuisine('ethiopian')).toEqual(tone)
  })
})

describe('cuisinePillTokens', () => {
  it('pairs a very light background with a dark text of the same hue', () => {
    expect(cuisinePillTokens('Thai')).toEqual({
      background: 'oklch(0.96 0.045 281)',
      color: 'oklch(0.4 0.13 281)',
    })
  })

  it('scales both halves by the tone chroma, so Café stays brown', () => {
    expect(cuisinePillTokens('Café')).toEqual({
      background: 'oklch(0.96 0.0225 60)',
      color: 'oklch(0.4 0.065 60)',
    })
  })

  it('renders an uncategorized cuisine achromatically', () => {
    expect(cuisinePillTokens(undefined)).toEqual({
      background: 'oklch(0.96 0 0)',
      color: 'oklch(0.4 0 0)',
    })
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/features/facets/cuisines.test.ts`
Expected: FAIL — `cuisinePillTokens is not a function`, `toneForCuisine is not a function`, `CUSTOM_TONES is not exported`.

- [ ] **Step 3: Rewrite the color half of `src/features/facets/cuisines.ts`**

Replace everything from the top of the file down to and including `colorForCuisine` (lines 1-74) with:

```ts
/**
 * A cuisine's color identity is a hue, not a hex. Three rendered forms derive from it by
 * formula, so a cuisine nobody curated - one a user typed - gets the same contrast guarantees
 * as a curated one. Recipes and their measured contrast floors: docs/reference/design-tokens.md.
 */
export interface CuisineTone {
  /** OKLCH hue angle in degrees. */
  hue: number
  /** Chroma multiplier applied to every recipe. 1 on the wheel; 0.5 makes Café a true brown. */
  chroma: number
}

const PILL_BACKGROUND = { lightness: 0.96, chroma: 0.045 }
const PILL_TEXT = { lightness: 0.4, chroma: 0.13 }
const SOLID = { lightness: 0.48, chroma: 0.15 }

function render(recipe: { lightness: number; chroma: number }, tone: CuisineTone): string {
  return `oklch(${recipe.lightness} ${recipe.chroma * tone.chroma} ${tone.hue})`
}

/** Achromatic tone for places with no cuisine. */
export const UNCATEGORIZED_TONE: CuisineTone = { hue: 0, chroma: 0 }

/** Neutral solid color for places with no cuisine. */
export const UNCATEGORIZED_COLOR = render(SOLID, UNCATEGORIZED_TONE)

/** Emoji for places with no cuisine — distinct from the generic free-text fallback. */
export const UNCATEGORIZED_EMOJI = '🍽️'

/** Generic emoji for a free-text cuisine with no curated match. */
export const GENERIC_CUISINE_EMOJI = '🍴'

/**
 * Curated cuisines. The eleven wheel entries sit 32 degrees apart so no two converge once
 * lightened into a pastel pill — the fault this replaced was three near-identical oranges and
 * three near-identical reds. Café is the one entry off the wheel: Burger's hue at half chroma.
 * The vocabulary stays open — users add their own, and those hash into CUSTOM_TONES.
 */
export const CURATED_CUISINES: ReadonlyArray<{ name: string; hue: number; chroma: number }> = [
  { name: 'Pizza', hue: 25, chroma: 1 },
  { name: 'Indian', hue: 57, chroma: 1 },
  { name: 'Burger', hue: 89, chroma: 1 },
  { name: 'Mexican', hue: 121, chroma: 1 },
  { name: 'Italian', hue: 153, chroma: 1 },
  { name: 'Korean', hue: 185, chroma: 1 },
  { name: 'Vietnamese', hue: 217, chroma: 1 },
  { name: 'French', hue: 249, chroma: 1 },
  { name: 'Thai', hue: 281, chroma: 1 },
  { name: 'Japanese', hue: 313, chroma: 1 },
  { name: 'Chinese', hue: 345, chroma: 1 },
  { name: 'Café', hue: 60, chroma: 0.5 },
]

const CURATED_BY_KEY = new Map<string, CuisineTone>(
  CURATED_CUISINES.map((c) => [c.name.toLowerCase(), { hue: c.hue, chroma: c.chroma }]),
)

// Fallback wheel for free-text cuisines, assigned by name hash. Each hue sits at the midpoint
// of a curated pair, so a user cuisine never lands on a curated hue; the same eleven repeat at
// half chroma to reach 22 distinct tones. Collisions past that are acceptable: the color is a
// scannability hint, not an identifier, and the emoji carries the meaning.
const FALLBACK_HUES = [9, 41, 73, 105, 137, 169, 201, 233, 265, 297, 329]

export const CUSTOM_TONES: readonly CuisineTone[] = [
  ...FALLBACK_HUES.map((hue) => ({ hue, chroma: 1 })),
  ...FALLBACK_HUES.map((hue) => ({ hue, chroma: 0.5 })),
]

/** Curated cuisine -> representative emoji, keyed the same way as `CURATED_BY_KEY`. */
const CUISINE_EMOJI = new Map([
  ['burger', '🍔'],
  ['french', '🥖'],
  ['italian', '🍝'],
  ['indian', '🍛'],
  ['japanese', '🍣'],
  ['chinese', '🥡'],
  ['thai', '🍜'],
  ['mexican', '🌮'],
  ['pizza', '🍕'],
  ['korean', '🍲'],
  ['vietnamese', '🥢'],
  ['café', '☕️'],
])

function hashString(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

function normalize(cuisine: string | null | undefined): string | null {
  const c = cuisine?.trim()
  return c ? c : null
}

/** The one cuisine-to-tone source. Every rendered cuisine color goes through here. */
export function toneForCuisine(cuisine: string | null | undefined): CuisineTone {
  const key = normalize(cuisine)
  if (!key) return UNCATEGORIZED_TONE
  const lower = key.toLowerCase()
  return CURATED_BY_KEY.get(lower) ?? CUSTOM_TONES[hashString(lower) % CUSTOM_TONES.length]
}

/** Solid form — map markers and filter dots. Dark enough that white text on it stays legible. */
export function colorForCuisine(cuisine: string | null | undefined): string {
  return render(SOLID, toneForCuisine(cuisine))
}

/** Pastel form — the cuisine badge and chip. The pair is contrast-safe at any hue. */
export function cuisinePillTokens(cuisine: string | null | undefined): {
  background: string
  color: string
} {
  const tone = toneForCuisine(cuisine)
  return { background: render(PILL_BACKGROUND, tone), color: render(PILL_TEXT, tone) }
}
```

Leave `emojiForCuisine`, `cuisineDisplayName` and `cuisineOptions` below untouched.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/features/facets/cuisines.test.ts`
Expected: PASS.

If `cuisinePillTokens('Café')` fails on a floating-point tail (`0.022500000000000003`), fix it in `render` by rounding: `Math.round(recipe.chroma * tone.chroma * 10000) / 10000`. Do not weaken the test to `toBeCloseTo` — the function returns a string that ends up in the DOM, so its exact form is the contract.

- [ ] **Step 5: Run the whole suite**

Run: `npm test`
Expected: PASS. The four `colorForCuisine` callers pass values straight to a `style` prop, so they need no edit — but `src/features/RestaurantList.test.tsx` asserts the old `color-mix` tint and **is expected to fail here**. Leave it failing; Task 5 rewrites it. Note which tests fail so Task 5 can confirm it fixed exactly those.

- [ ] **Step 6: Commit**

```bash
git add src/features/facets/cuisines.ts src/features/facets/cuisines.test.ts
git commit -m "feat(cuisines): derive cuisine colors from a 32-degree hue wheel"
```

---

### Task 3: Badge pastel mode

**Files:**
- Modify: `src/features/ui/Badge.tsx`
- Test: `src/features/ui/Badge.test.tsx`

**Interfaces:**
- Consumes: `cuisinePillTokens` from Task 2 (used by callers, not by Badge itself).
- Produces: `<Badge pastel={{ background: string; color: string }} />` as a third mode beside `tone` and `tint`. The `color` prop is **removed**, and with it `luminance()` and `textColorFor()`.

- [ ] **Step 1: Write the failing test**

In `src/features/ui/Badge.test.tsx`, delete these three tests outright — they cover the `color` mode and the luminance rule, both of which this task removes:
- `renders color mode with the given inline background at the same sizing`
- `picks white text for a low-luminance color, matching the luminance rule used across the app`
- `picks near-black text for a high-luminance color, matching the luminance rule used across the app`

Add in their place:

```ts
  it('renders pastel mode with the given background/text pair at the same sizing', () => {
    render(
      <Badge
        text="Thai"
        pastel={{ background: 'oklch(0.96 0.045 281)', color: 'oklch(0.4 0.13 281)' }}
        icon="🍜"
      />,
    )

    const label = screen.getByText('Thai')
    const badge = label.parentElement as HTMLElement
    expect(badge).toHaveClass('rounded-full', 'px-2', 'py-0.5', 'text-[11px]', 'font-semibold')
    expect(badge).not.toHaveClass('text-white')
    expect(badge.getAttribute('style')).toContain('oklch(0.96 0.045 281)')
    expect(badge.getAttribute('style')).toContain('oklch(0.4 0.13 281)')
    expect(within(badge).getByText('🍜')).toHaveAttribute('aria-hidden', 'true')
  })
```

The assertion reads the raw `style` attribute rather than using `toHaveStyle`. jsdom's CSS parser may not recognise `oklch()` and can silently drop the declaration, which would make `toHaveStyle` fail against a correct component. Confirm this by running the test both ways in Step 2 if it fails unexpectedly.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/features/ui/Badge.test.tsx`
Expected: FAIL — `pastel` is not a recognised prop, so no inline style is emitted.

- [ ] **Step 3: Rewrite `src/features/ui/Badge.tsx`**

Replace the whole file with:

```tsx
import { cn } from '../../lib/cn'

type BadgeProps = {
  text: string
  icon?: string
  /**
   * Tinted-pill mode (light background/dark text + a leading color dot, e.g. the account
   * dropdown's sync-status chip) instead of the default solid-background/white-text mode. In
   * this mode `tone` supplies the *full* background+text pairing (already tinted) rather than
   * a solid surface color, and `dotClassName` supplies the leading dot's fill.
   */
  tint?: boolean
  dotClassName?: string
} & (
  | { tone: string; pastel?: never }
  /**
   * Pastel mode: an explicit background/text pair, contrast-guaranteed by whoever computed it
   * (`cuisinePillTokens` for a cuisine, a fixed gray pair for a status). Replaces the former
   * `color` mode, which took one solid color and picked its text color by luminance — a
   * guess the hue system makes unnecessary.
   */
  | { pastel: { background: string; color: string }; tone?: never }
)

/**
 * Shared badge primitive: exactly one of `tone` (a Tailwind class, for the closed status/verdict
 * set — fixed white text) or `pastel` (an explicit pair, for per-cuisine values) picks the
 * surface; both share the same size/padding/font so a future style change touches this file
 * instead of every call site.
 */
export function Badge({ text, icon, tone, pastel, tint, dotClassName }: BadgeProps) {
  const style = pastel ? { background: pastel.background, color: pastel.color } : undefined
  const colorClass = tint ? (tone ?? '') : tone ? `${tone} text-white` : ''

  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-full font-semibold',
        tint ? 'px-2.5 py-1 text-xs shadow-sm transition' : 'px-2 py-0.5 text-[11px]',
        colorClass,
      )}
      style={style}
    >
      {tint && dotClassName && <span aria-hidden="true" className={cn('h-2 w-2 rounded-full', dotClassName)} />}
      {icon && <span aria-hidden="true">{icon}</span>}
      <span>{text}</span>
    </span>
  )
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/features/ui/Badge.test.tsx`
Expected: PASS.

- [ ] **Step 5: Confirm the dead code is gone and nothing still passes `color`**

Run: `grep -rn "luminance\|textColorFor\|<Badge[^>]*color=" src`
Expected: no output. If `RestaurantList.tsx` still passes `color=`, that is expected — it is fixed in Task 5, and `npm test` will surface it as a type error at Step 6.

- [ ] **Step 6: Run type-check and the suite**

Run: `npm run type-check`
Expected: one error, in `src/features/RestaurantList.tsx`, because it still passes the removed `color` prop. That is the correct intermediate state; Task 5 clears it.

Run: `npm test`
Expected: `Badge.test.tsx` PASS; `RestaurantList.test.tsx` still failing from Task 2.

- [ ] **Step 7: Commit**

```bash
git add src/features/ui/Badge.tsx src/features/ui/Badge.test.tsx
git commit -m "feat(ui): replace Badge's luminance-guessed color mode with an explicit pastel pair"
```

---

### Task 4: Statuses as pastel pills

Shape, not color, separates a status from a verdict. "To try" and "Resolving…" become light-gray pills with dark text; the four verdicts stay solid with white text, so whether a place has been visited is legible without reading the label.

**Files:**
- Modify: `src/features/StatusBadge.tsx`
- Test: `src/features/StatusBadge.test.tsx` (create if absent — check first; `src/features/RestaurantList.test.tsx` and `src/features/visits/RestaurantDetail.test.tsx` cover it today)

**Interfaces:**
- Consumes: `Badge`'s `pastel` prop from Task 3.
- Produces: no new export. `VerdictBadge` and `StatusBadge` keep their signatures.

- [ ] **Step 1: Check where StatusBadge is currently covered**

Run: `ls src/features/StatusBadge.test.tsx 2>/dev/null; grep -rln "StatusBadge" src --include="*.test.tsx"`
If no dedicated test file exists, create `src/features/StatusBadge.test.tsx` in Step 2. If one exists, add the test to it.

- [ ] **Step 2: Write the failing test**

```tsx
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { StatusBadge } from './StatusBadge'
import { translateStatus, translateVerdict } from '../types/models'

const base = { pending: false, visitCount: 0, latestVerdict: null } as const

describe('StatusBadge', () => {
  it('renders a status as a pastel gray pill, not a solid one', () => {
    render(<StatusBadge restaurant={base} />)
    const badge = screen.getByText(translateStatus('to_try')).parentElement as HTMLElement
    expect(badge).not.toHaveClass('text-white')
    expect(badge.getAttribute('style')).toContain('var(--color-gray-100)')
  })

  it('renders a verdict as a solid pill with white text, so shape tells them apart', () => {
    render(<StatusBadge restaurant={{ ...base, visitCount: 2, latestVerdict: 'go_back' }} />)
    const badge = screen.getByText(translateVerdict('go_back')).parentElement as HTMLElement
    expect(badge).toHaveClass('bg-verdict-go-back', 'text-white')
    expect(badge.getAttribute('style')).toBeNull()
  })
})
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run src/features/StatusBadge.test.tsx`
Expected: FAIL — the status badge currently renders `bg-verdict-neutral text-white` with no inline style.

- [ ] **Step 4: Update `src/features/StatusBadge.tsx`**

Add the constant above `VerdictBadge`:

```tsx
/**
 * Statuses are not verdicts: "to try" and "resolving" say nothing about the place, so they get
 * the pastel pill shape the cuisine badges use, while the four verdicts stay solid. The shape
 * carries the distinction, which is what makes "has this been visited" readable at a glance.
 */
const STATUS_PILL = { background: 'var(--color-gray-100)', color: 'var(--color-gray-700)' }
```

Then replace the three neutral branches in `StatusBadge`:

```tsx
  if (state.kind === 'pending') return <Badge text={translatePending()} pastel={STATUS_PILL} />
  if (state.kind === 'to_try') return <Badge text={translateStatus('to_try')} pastel={STATUS_PILL} />
  if (state.verdict) return <VerdictBadge verdict={state.verdict} />
  return <Badge text={translateStatus('visited')} pastel={STATUS_PILL} />
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/features/StatusBadge.test.tsx`
Expected: PASS.

- [ ] **Step 6: Retire `--color-verdict-neutral` if it is now unused**

Run: `grep -rn "verdict-neutral" src`
If the only remaining hits are in test files, update those tests to use `bg-verdict-once` instead, then delete the `--color-verdict-neutral` line from `src/index.css`. If a component still uses it, leave the token in place and say so in the commit message.

- [ ] **Step 7: Run the suite**

Run: `npm test`
Expected: PASS except `RestaurantList.test.tsx`, still failing from Task 2.

- [ ] **Step 8: Commit**

```bash
git add src/features/StatusBadge.tsx src/features/StatusBadge.test.tsx src/index.css
git commit -m "feat(ui): give statuses a pastel pill so shape separates them from verdicts"
```

---

### Task 5: Borderless cards, cuisine as a pastel pill

Clears the failure Tasks 2 and 3 left behind.

**Files:**
- Modify: `src/features/RestaurantList.tsx`
- Test: `src/features/RestaurantList.test.tsx`

**Interfaces:**
- Consumes: `cuisinePillTokens` (Task 2), `Badge`'s `pastel` prop (Task 3), `--radius-card` and `--shadow-card` (Task 1).
- Produces: nothing other tasks depend on.

- [ ] **Step 1: Rewrite the two failing assertions**

In `src/features/RestaurantList.test.tsx`, replace:

```ts
    const card = screen.getByRole('button', { name: /Baan Thaï/ })
    expect(card).toHaveStyle({ background: 'color-mix(in srgb, #7c3aed 16%, #fdfaf6)' })
```

with:

```ts
    const card = screen.getByRole('button', { name: /Baan Thaï/ })
    expect(card).toHaveClass('bg-white', 'rounded-card', 'shadow-card')
    expect(card.getAttribute('style')).toBeNull()
```

Then, in the same test, after `const cuisineBadge = ...`, add:

```ts
    // Thai is hue 281 on the wheel; the tint now lives on the badge, not on the card.
    expect(cuisineBadge.getAttribute('style')).toContain('oklch(0.96 0.045 281)')
```

Find the other failing assertion — the one in `renders the uncategorized tint and emoji for a restaurant with no cuisine, not a blank badge`, which asserts `color-mix(in srgb, #9ca3af 16%, #fdfaf6)`. Replace it with:

```ts
    const card = screen.getByRole('button', { name: /No cuisine place/ })
    expect(card).toHaveClass('bg-white')
    const badge = screen.getByText('Uncategorized').parentElement as HTMLElement
    expect(badge.getAttribute('style')).toContain('oklch(0.96 0 0)')
```

Rename that test to `renders the uncategorized pill and emoji for a restaurant with no cuisine, not a blank badge` — "tint" no longer describes what it checks.

- [ ] **Step 2: Run the test to verify it fails for the new reason**

Run: `npx vitest run src/features/RestaurantList.test.tsx`
Expected: FAIL on the class assertion (`bg-white` absent) rather than on the old `color-mix` value. If it still fails on `color-mix`, Step 1 was applied to the wrong assertion.

- [ ] **Step 3: Update `src/features/RestaurantList.tsx`**

Delete the `CARD_TINT_BASE` constant and its comment (lines 10-11). Change the import on line 4 to:

```ts
import { cuisineDisplayName, cuisinePillTokens, emojiForCuisine } from './facets/cuisines'
```

Delete the `const cuisineColor = colorForCuisine(r.cuisine)` line. Replace the card `<button>`'s `className` and `style` with a className only:

```tsx
              className="block w-full rounded-card bg-white p-3 text-left shadow-card transition hover:shadow-lg"
```

Replace the cuisine `<Badge>` with:

```tsx
                <Badge
                  text={cuisineDisplayName(r.cuisine, t('common.uncategorized'))}
                  icon={emojiForCuisine(r.cuisine)}
                  pastel={cuisinePillTokens(r.cuisine)}
                />
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/features/RestaurantList.test.tsx`
Expected: PASS.

- [ ] **Step 5: Run type-check and the whole suite**

Run: `npm run type-check`
Expected: clean — this clears the error Task 3 left.

Run: `npm test`
Expected: PASS, all of it, for the first time since Task 1.

- [ ] **Step 6: Look at it**

Run: `npm run dev` and scroll a list of at least six places with different cuisines. The list should read calmer than before: white cards, color concentrated in the badges.

- [ ] **Step 7: Commit**

```bash
git add src/features/RestaurantList.tsx src/features/RestaurantList.test.tsx
git commit -m "feat(list): drop the cuisine card tint for a white card and a pastel cuisine pill"
```

---

### Task 6: Borderless toggle chips

**Files:**
- Modify: `src/features/ui/ToggleChip.tsx`
- Test: `src/features/ui/ToggleChip.test.tsx`

**Interfaces:**
- Consumes: `--color-brand-soft` (Task 1).
- Produces: nothing other tasks depend on. `ToggleChip`'s props are unchanged.

- [ ] **Step 1: Update the two pill tests**

In `src/features/ui/ToggleChip.test.tsx`, in `applies the active pill classes (border-brand, bg-brand-soft, shadow-sm) matching FilterBar`: rename it to `applies the active pill classes (bg-brand-soft, shadow-sm) — borderless in Soft Pop`, remove `'border'` and `'border-brand'` from the `toHaveClass` list, and add after it:

```ts
      expect(button).not.toHaveClass('border', 'border-brand')
```

In `applies the inactive pill classes (border-gray-300, hover states) matching FilterBar`: rename it to `applies the inactive pill classes (white, shadow, hover states) matching FilterBar` and replace its `toHaveClass` list with:

```ts
      expect(button).toHaveClass('bg-white', 'text-gray-600', 'shadow-sm', 'hover:bg-gray-50')
      expect(button).not.toHaveClass('border', 'border-gray-300')
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/features/ui/ToggleChip.test.tsx`
Expected: FAIL — the pill still carries `border` and `border-gray-300`.

- [ ] **Step 3: Update `chipClass` in `src/features/ui/ToggleChip.tsx`**

Replace the `return` at the end of `chipClass` (the `shape === 'pill'` branch) with:

```ts
  // Soft Pop is borderless: a chip separates from the page by its shadow, and an active chip by
  // its brand-soft fill. The former `border`/`border-brand` pair is gone, not merely recolored.
  return `inline-flex min-h-10 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs transition ${
    active
      ? 'bg-brand-soft font-semibold text-brand-strong shadow-sm'
      : 'bg-white text-gray-600 shadow-sm hover:bg-gray-50'
  }`
```

Also update the `shape="pill"` paragraph of the component docblock: it says the pill is "rounded, bordered". Change "the full standalone rounded, bordered pill" to "the full standalone rounded, shadowed pill".

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/features/ui/ToggleChip.test.tsx`
Expected: PASS.

- [ ] **Step 5: Run the suite**

Run: `npm test`
Expected: PASS. `FilterBar.test.tsx` and `SortBar.test.tsx` assert behavior, not chrome, so they should be unaffected — if one fails, it asserted a border class and needs the same treatment.

- [ ] **Step 6: Commit**

```bash
git add src/features/ui/ToggleChip.tsx src/features/ui/ToggleChip.test.tsx
git commit -m "feat(ui): make toggle chips borderless"
```

---

### Task 7: Button and modal shape

**Files:**
- Modify: `src/features/ui/Button.tsx`
- Modify: `src/features/ui/Modal.tsx:82`
- Modify: `src/App.test.tsx:744`, `src/App.test.tsx:880` (selector strings only)
- Test: `src/features/ui/Button.test.tsx`

**Interfaces:**
- Consumes: `--shadow-brand`, `--radius-card` (Task 1).
- Produces: nothing other tasks depend on.

- [ ] **Step 1: Write the failing test**

In `src/features/ui/Button.test.tsx`, find the first test asserting `toHaveClass('bg-brand')` on a primary button and add to it:

```ts
    expect(screen.getByRole('button', { name: 'Go' })).toHaveClass(
      'rounded-full',
      'shadow-brand',
    )
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/features/ui/Button.test.tsx`
Expected: FAIL — primary is `rounded-xl shadow-sm`.

- [ ] **Step 3: Update the primary variant**

In `src/features/ui/Button.tsx`, replace the `primary` entry of `VARIANT_STYLES` with:

```ts
  primary:
    'rounded-full bg-brand px-4 py-2.5 text-sm font-semibold text-white shadow-brand transition hover:bg-brand-strong active:bg-brand-strong active:shadow-none disabled:opacity-50',
```

`active:shadow-none` is kept — `src/features/portability/PortabilityPanel.test.tsx` asserts it.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/features/ui/Button.test.tsx`
Expected: PASS.

- [ ] **Step 5: Find every `rounded-t-2xl` and `rounded-2xl` on a panel**

Run: `grep -rn "rounded-t-2xl\|md:rounded-2xl" src`
Expected hits: `src/features/ui/Modal.tsx:82`, and the two selector strings in `src/App.test.tsx` (lines 744 and 880). There may be more — handle every hit.

- [ ] **Step 6: Retokenize the modal shell and its test selectors**

In `src/features/ui/Modal.tsx:82`, change `rounded-t-2xl` to `rounded-t-card` and `md:rounded-2xl` to `md:rounded-card`.

In `src/App.test.tsx`, change both `[class*="rounded-t-2xl"]` selectors to `[class*="rounded-t-card"]`. These are **queries, not assertions** — leaving them would make the tests silently fail to find the panel.

Leave `src/App.test.tsx:530` alone: it asserts the overlay does *not* carry `md:rounded-2xl`, and that stays true.

- [ ] **Step 7: Run the suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 8: Look at it**

Run: `npm run dev`, open a place to get the detail modal, and open the decide panel. Corners should be softer and the primary buttons should carry a green glow rather than a flat gray shadow.

- [ ] **Step 9: Commit**

```bash
git add src/features/ui/Button.tsx src/features/ui/Button.test.tsx src/features/ui/Modal.tsx src/App.test.tsx
git commit -m "feat(ui): soften button and modal shape onto the Soft Pop tokens"
```

---

### Task 8: The constellation logo and icon generation

**Files:**
- Modify: `public/logo.svg`
- Create: `public/logo-mark.svg`
- Create: `scripts/generate-icons.mjs`
- Modify: `package.json` (one script, one devDependency)
- Regenerate: `public/favicon.ico`, `public/apple-touch-icon-180x180.png`, `public/pwa-64x64.png`, `public/pwa-192x192.png`, `public/pwa-512x512.png`, `public/maskable-icon-512x512.png`

**Interfaces:**
- Consumes: nothing.
- Produces: `npm run icons`.

The two cuisine hues are written as hex, not `oklch()`: sharp rasterises through librsvg, which does not implement `oklch()`. `#A12F2F` is `oklch(0.48 0.15 25)` and `#7A3E98` is `oklch(0.48 0.15 313)`, both converted to sRGB and verified in gamut.

- [ ] **Step 1: Install sharp**

Run: `npm install --save-dev sharp`

- [ ] **Step 2: Write `public/logo.svg`**

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <clipPath id="sq"><rect width="512" height="512" rx="114"/></clipPath>
    <linearGradient id="deep" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#00C48D"/>
      <stop offset="1" stop-color="#00815E"/>
    </linearGradient>
    <filter id="shSm" x="-50%" y="-50%" width="200%" height="200%">
      <feDropShadow dx="0" dy="8" stdDeviation="9" flood-color="#04372A" flood-opacity=".26"/>
    </filter>
    <filter id="shLg" x="-50%" y="-50%" width="200%" height="200%">
      <feDropShadow dx="0" dy="12" stdDeviation="15" flood-color="#04372A" flood-opacity=".32"/>
    </filter>
    <g id="pin">
      <path d="M0-62c-34 0-62 27-62 60 0 45 54 92 60 97a4 4 0 0 0 4 0c6-5 60-52 60-97 0-33-28-60-62-60z"/>
      <circle cx="0" cy="-2" r="23" fill="#ffffff"/>
    </g>
  </defs>
  <g clip-path="url(#sq)">
    <rect width="512" height="512" fill="#F4F8F6"/>
    <g stroke="#E4EEE9" stroke-width="15" stroke-linecap="round">
      <path d="M-10 118h532"/>
      <path d="M-10 350h532"/>
      <path d="M132-10v532"/>
      <path d="M390-10v532"/>
    </g>
    <rect x="-20" y="366" width="176" height="180" rx="26" fill="#DEEEE6"/>
  </g>
  <g filter="url(#shSm)" transform="translate(146 196) scale(1.15)">
    <use href="#pin" fill="#A12F2F"/>
  </g>
  <g filter="url(#shSm)" transform="translate(366 180) scale(1.15)">
    <use href="#pin" fill="#7A3E98"/>
  </g>
  <g filter="url(#shLg)" transform="translate(256 250) scale(1.6)">
    <use href="#pin" fill="url(#deep)"/>
  </g>
</svg>
```

- [ ] **Step 3: Write `public/logo-mark.svg`**

The front pin alone, filling the square, for sizes where three overlapping pins cannot resolve.

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <clipPath id="sq"><rect width="512" height="512" rx="114"/></clipPath>
    <linearGradient id="deep" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#00C48D"/>
      <stop offset="1" stop-color="#00815E"/>
    </linearGradient>
  </defs>
  <g clip-path="url(#sq)"><rect width="512" height="512" fill="#F4F8F6"/></g>
  <g transform="translate(256 232) scale(2.3)">
    <path fill="url(#deep)" d="M0-62c-34 0-62 27-62 60 0 45 54 92 60 97a4 4 0 0 0 4 0c6-5 60-52 60-97 0-33-28-60-62-60z"/>
    <circle cx="0" cy="-2" r="23" fill="#ffffff"/>
  </g>
</svg>
```

- [ ] **Step 4: Verify both SVGs render before wiring the script**

Run: `open public/logo.svg public/logo-mark.svg`
Expected: two icons. If `logo.svg` shows no shadows, librsvg dropped `feDropShadow` — render it through sharp in Step 6 and judge from the PNG, since that is the output that ships. If the shadows are missing from the PNG too, replace each `feDropShadow` with a `<feGaussianBlur>` + `<feOffset>` + `<feMerge>` chain rather than shipping a flat icon.

- [ ] **Step 5: Write `scripts/generate-icons.mjs`**

```js
// Regenerates every raster icon from the two SVG sources. Run with `npm run icons`.
//
// Two sources, not one: three overlapping pins cannot resolve at 16 or 32 px, so small targets
// take the single-pin reduction instead of a muddy shrink of the full mark. Both read as the
// same icon because the front pin dominates the full version.
import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import sharp from 'sharp'

const PUBLIC = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public')

/** target file -> [source svg, pixel size]. The favicon is written as PNG bytes in an .ico container. */
const TARGETS = [
  ['pwa-512x512.png', 'logo.svg', 512],
  ['maskable-icon-512x512.png', 'logo.svg', 512],
  ['pwa-192x192.png', 'logo.svg', 192],
  ['apple-touch-icon-180x180.png', 'logo.svg', 180],
  ['pwa-64x64.png', 'logo-mark.svg', 64],
]

async function render(source, size) {
  const svg = await readFile(path.join(PUBLIC, source))
  return sharp(svg, { density: 384 }).resize(size, size).png({ compressionLevel: 9 }).toBuffer()
}

/** Minimal single-image .ico container around a 32x32 PNG — enough for every current browser. */
function icoFromPng(png, size) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(1, 4)
  const entry = Buffer.alloc(16)
  entry.writeUInt8(size === 256 ? 0 : size, 0)
  entry.writeUInt8(size === 256 ? 0 : size, 1)
  entry.writeUInt16LE(1, 4)
  entry.writeUInt16LE(32, 6)
  entry.writeUInt32LE(png.length, 8)
  entry.writeUInt32LE(header.length + entry.length, 12)
  return Buffer.concat([header, entry, png])
}

for (const [target, source, size] of TARGETS) {
  await writeFile(path.join(PUBLIC, target), await render(source, size))
  console.log(`${target.padEnd(30)} <- ${source} @ ${size}px`)
}

const favicon = await render('logo-mark.svg', 32)
await writeFile(path.join(PUBLIC, 'favicon.ico'), icoFromPng(favicon, 32))
console.log(`${'favicon.ico'.padEnd(30)} <- logo-mark.svg @ 32px`)
```

- [ ] **Step 6: Add the npm script**

In `package.json`, add to `"scripts"`, after `"preview"`:

```json
    "icons": "node scripts/generate-icons.mjs",
```

- [ ] **Step 7: Generate and inspect**

Run: `npm run icons`
Expected: six lines of output, one per file.

Run: `open public/pwa-512x512.png public/pwa-64x64.png public/favicon.ico`
Expected: the constellation at 512, the single pin at 64, the single pin in the favicon. Confirm the shadows survived; if not, go back to Step 4.

- [ ] **Step 8: Check the maskable icon is really maskable**

Open `public/maskable-icon-512x512.png` and confirm no pin is cut by a circle inscribed in the square (radius 205 of 256 from the center). The geometry was chosen to satisfy this, so a failure here means a transform was mistyped.

- [ ] **Step 9: Build, then look at the app's tab and install prompt**

Run: `npm run build && npm run preview`
Open the printed URL and check the browser tab icon, then the install prompt's icon.

- [ ] **Step 10: Commit**

```bash
git add public/logo.svg public/logo-mark.svg public/favicon.ico public/apple-touch-icon-180x180.png public/pwa-64x64.png public/pwa-192x192.png public/pwa-512x512.png public/maskable-icon-512x512.png scripts/generate-icons.mjs package.json package-lock.json
git commit -m "feat(brand): redraw the mark as the constellation and generate icons from source"
```

---

### Task 9: Documentation

**Files:**
- Create: `docs/reference/design-tokens.md`
- Create: `docs/journal/decisions/0005-visual-direction-soft-pop.md`
- Modify: `docs/README.md` (the `reference/` index list)
- Modify: `docs/how-to/development.md` (the scripts section)
- Modify: `AGENTS.md` (the routing table)

**Interfaces:**
- Consumes: everything built above.
- Produces: the contract that stops a future contributor from picking a hex for a thirteenth cuisine.

- [ ] **Step 1: Write `docs/reference/design-tokens.md`**

Reference is a contract, not a story — tables, no narration, or `npm run check:docs` fails it.

```markdown
---
title: Design tokens
type: reference
audience: [human, agent]
status: stable
stale_after: 2027-04-01
---

# Design tokens

Every color, radius, shadow and font is defined in `src/index.css` inside `@theme`. Nothing
below is defined anywhere else, and no component hardcodes a value one of these names covers.

## Brand and neutrals

| Token | Value | Used for |
| --- | --- | --- |
| `--color-brand` | `#00a97a` | Primary actions, the active chip, the front pin of the mark |
| `--color-brand-strong` | `#00875f` | Hover and active states of a primary action |
| `--color-brand-soft` | `#e6f7f1` | The fill of an active toggle chip |
| `--color-gray-50` … `--color-gray-950` | `#f8fafb` … `#070b11` | Every neutral surface and text color |

## Verdicts and statuses

A verdict renders solid with white text. A status renders as a pastel pill with dark text.
Shape carries the distinction; color alone does not.

| Token | Value |
| --- | --- |
| `--color-verdict-go-back` | `#00875f` |
| `--color-verdict-detour` | `#f59e0b` |
| `--color-verdict-once` | `#9aa3b2` |
| `--color-verdict-never` | `#f43f5e` |

## Shape

| Token | Value |
| --- | --- |
| `--radius-card` | `1.125rem` |
| `--shadow-card` | `0 1px 2px rgb(16 24 40 / 0.05), 0 8px 22px rgb(16 24 40 / 0.06)` |
| `--shadow-brand` | `0 6px 16px rgb(0 169 122 / 0.28)` |

Cards carry a shadow and no border. Buttons and chips are `rounded-full`.

## The cuisine palette

A cuisine carries a hue and a chroma multiplier, never a hex. `src/features/facets/cuisines.ts`
is the only module that renders one into a color.

| Form | Recipe | Contrast floor |
| --- | --- | --- |
| Pill background | `oklch(0.96 0.045×c H)` | — |
| Pill text | `oklch(0.40 0.13×c H)` | 7.19:1 on its own background |
| Solid marker, filter dot | `oklch(0.48 0.15×c H)` | 5.52:1 against white text |

Both floors hold for every hue, including hues a browser maps back into sRGB.

### Rules

- **Curated hues sit 32 degrees apart.** A thirteenth curated cuisine does not get a spare
  angle — it gets a re-spaced wheel, or it goes in the fallback set.
- **Café is the one entry off the wheel**: hue 60 at chroma 0.5, so it reads brown rather than
  a second amber.
- **A free-text cuisine hashes into `CUSTOM_TONES`**, 22 tones whose hues sit at the midpoints
  of the curated pairs. No fallback hue equals a curated hue.
- **Uncategorized is achromatic**, not a gray hex.

| Cuisine | Hue | Cuisine | Hue |
| --- | --- | --- | --- |
| Pizza | 25 | Vietnamese | 217 |
| Indian | 57 | French | 249 |
| Burger | 89 | Thai | 281 |
| Mexican | 121 | Japanese | 313 |
| Italian | 153 | Chinese | 345 |
| Korean | 185 | Café | 60 (chroma 0.5) |

## Icons

`public/logo.svg` feeds every raster at 180 px and above; `public/logo-mark.svg`, the single-pin
reduction, feeds `favicon.ico` and `pwa-64x64.png`. `npm run icons` regenerates all six. Both
sources use hex, not `oklch()`: sharp rasterises through librsvg, which does not implement it.
```

- [ ] **Step 2: Index the new reference doc**

In `docs/README.md`, under the `reference/` heading, add a second bullet below the
`data-model.md` line. Copy that line's exact format — a bullet, the filename as a markdown link
to `reference/design-tokens.md` with the filename in backticks as the link text, an em dash, then
the description: *the color, shape and cuisine-palette contract*.

Written out as a link here, it would point at a file that does not exist until Step 1 runs, and
the doc gate resolves links inside fenced blocks too — which is why this step is prose.

- [ ] **Step 3: Run the doc gate**

Run: `npm run check:docs`
Expected: `docs/ structure OK`. A failure naming `design-tokens.md` means either frontmatter is incomplete, the index entry is missing, or a sentence narrates rather than states.

- [ ] **Step 4: Write the ADR**

`docs/journal/decisions/0005-visual-direction-soft-pop.md`, MADR 4.0.0 per `docs/journal/decisions/README.md`:

```markdown
---
status: "accepted"
date: 2026-09-21
decision-makers: [Baptiste Pasquier]
---

# Replace the Carnet culinaire identity with Soft Pop

## Context and Problem Statement

Tablemarks shipped a deliberate visual identity in August 2026 — "Carnet culinaire": warm
parchment neutrals, terracotta and deep teal, Playfair Display over Work Sans. It was decided
inside an implementation plan, never in an ADR, so nothing recorded what it committed to.

Three faults were named against it: the sepia neutrals read as dated, the serif reads as a
magazine rather than an app, and the radii and shadows belong to an earlier idiom. Separately,
the cuisine palette had a defect of its own — twelve fixed hexes holding three near-identical
oranges and three near-identical reds, plus only eight fallback colors for the open-ended
cuisines users type themselves.

## Decision Drivers

* The primary use is deciding where to eat while standing outside, one-handed
* The cuisine vocabulary is open, so the palette must serve colors nobody curated
* A solo project: no brand guideline to honour, and no migration to stage

## Considered Options

* Clean Utility — indigo on cool zinc, Inter, 1px hairlines
* Soft Pop — a green accent on neutral grays, Plus Jakarta Sans, borderless cards, soft shadows
* Ink & Signal — near-black and acid yellow, Space Grotesk, hard offset shadows

## Decision Outcome

Chosen: **Soft Pop**, because generous touch targets and no hairlines to aim at serve a phone
held in one hand better than the alternatives. Clean Utility was the safest and the least
memorable; Ink & Signal was the most distinctive and the most tiring for an app opened daily.

The cuisine palette was rebuilt at the same time, since a new accent color would have had to be
reconciled with twelve fixed hexes regardless. A cuisine now carries a hue, and the pill, marker
and dot forms derive from it — which extends the contrast guarantee to cuisines nobody curated.

### Consequences

* Good: retinting the app is an edit to `src/index.css` alone, because every token name survived
* Good: a free-text cuisine gets the same contrast floor as a curated one, measured not assumed
* Bad: greens and cyans render less saturated than reds and blues, because sRGB cannot hold the
  nominal chroma at those hues
* Bad: the eleven-hue wheel has no spare angle, so a thirteenth curated cuisine forces a re-space

## More Information

Design and measurements: `docs/journal/specs/2026-09-21-visual-direction-soft-pop-design.md`.
The token contract: `docs/reference/design-tokens.md`. The mark was redrawn in the same pass —
three pins on a pale street plan, chosen over eleven alternatives for saying "a collection"
rather than "a place".
```

- [ ] **Step 5: Document the new script**

In `docs/how-to/development.md`, add `npm run icons` to the scripts table or list, described as: regenerates the six raster icons from `public/logo.svg` and `public/logo-mark.svg`.

- [ ] **Step 6: Add the routing-table row to `AGENTS.md`**

In the "You changed X → update Y" table, add:

```markdown
| a color, a radius, a shadow, or the cuisine palette | `docs/reference/design-tokens.md`                        |
```

`AGENTS.md` has an 8 KB budget and the rule is that adding a line means removing one. Check the file size after the edit with `wc -c AGENTS.md`. If it exceeds 8192 bytes, remove a line that the new `docs/reference/design-tokens.md` now covers, and name the removal in the commit message. If it still fits, say in the commit message that nothing had to go.

- [ ] **Step 7: Run the doc gate and the full verification set**

Run: `npm run check:docs`
Expected: `docs/ structure OK`.

Run: `npm test && npm run type-check && npx eslint . && npx prettier . --check`
Expected: all clean.

- [ ] **Step 8: Final visual pass**

Run: `npm run dev` and walk every surface at both breakpoints — the list, the map, the detail modal, the decide panel, add-a-place, the account menu, the filter bar and the sort bar, on mobile width and desktop width. This is the step that catches what class assertions cannot.

- [ ] **Step 9: Commit**

```bash
git add docs/reference/design-tokens.md docs/journal/decisions/0005-visual-direction-soft-pop.md docs/README.md docs/how-to/development.md AGENTS.md
git commit -m "docs: record the Soft Pop direction and its token contract"
```

---

## Self-review notes

Checked against the spec:

- Every spec section maps to a task. Tokens and typography → Task 1. Cuisine palette → Task 2. Status against verdict → Task 4. The files table → Tasks 1 and 3-7. Logo and icons → Task 8. Documentation → Task 9. Verification → distributed, with the full set run in Task 9 Step 7.
- The spec's "two test files are expected to fail" prediction is honoured: `RestaurantList.test.tsx` is broken by Task 2 and repaired by Task 5, `ToggleChip.test.tsx` by Task 6. `Badge.test.tsx` loses three tests in Task 3 with the code they covered.
- Two things this plan found that the spec did not state: `src/App.test.tsx` uses `rounded-t-2xl` as a **selector** at lines 744 and 880, so Task 7 must edit it; and `cuisines.test.ts` reads `CURATED_CUISINES[].color`, which Task 2 replaces with `hue`/`chroma`.
- Naming is consistent across tasks: `toneForCuisine`, `cuisinePillTokens`, `colorForCuisine`, `CuisineTone`, `CUSTOM_TONES`, `STATUS_PILL`, `--radius-card`, `--shadow-card`, `--shadow-brand`.
- Open risk, flagged at both call sites: jsdom may not parse `oklch()` in an inline style. Every assertion on one reads the raw `style` attribute rather than using `toHaveStyle`.
