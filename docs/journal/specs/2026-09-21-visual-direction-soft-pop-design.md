---
title: Visual Direction Soft Pop - Design
type: design
date: 2026-09-21
topic: visual-direction-soft-pop
status: approved
---

# Visual Direction Soft Pop - Design

## Goal

Replace the "Carnet culinaire" identity with a contemporary one, and make the cuisine
palette hold twelve curated cuisines plus open-ended user cuisines without two of them
looking alike.

The requester named three faults in the shipped look: the sepia neutrals read as dated, the
Playfair Display serif reads as a magazine rather than an app, and the radii and shadows
belong to an earlier idiom. Dark mode was considered and ruled out of scope.

## Decision

Direction **Soft Pop**: neutral grays, a single green accent `#00A97A`, Plus Jakarta Sans
throughout, no borders on cards, wide radii, soft shadows.

Two other directions were built and shown before this one was chosen:

| Direction | Accent and type | Shape | Why not |
| --- | --- | --- | --- |
| Clean Utility | indigo `#4F46E5`, Inter, cool zinc | 1px hairlines, radii 8/12 | The safest and the least memorable; density serves a desktop tool, not a phone held in one hand |
| **Soft Pop** | **green `#00A97A`, Plus Jakarta Sans** | **no borders, radii 14/18, soft shadows** | **Chosen** |
| Ink & Signal | ink `#0B0B0C` + acid `#D8F34A`, Space Grotesk | 1.5px rules, hard offset shadows, radii 4/6 | The most distinctive and the most tiring for an app opened daily |

Soft Pop wins on the primary use: deciding where to eat while standing outside, one-handed.
Generous touch targets and no hairlines to aim at serve that better than the alternatives.

## Token contract

`src/index.css` keeps every token **name**. Only values change, so the whole app retints
without a single `className` edit.

| Token | Before | After |
| --- | --- | --- |
| `--color-gray-50` … `--color-gray-950` | parchment `#fbf6ee` … `#1a1512` | neutral `#F8FAFB` … `#070B11` |
| `--color-brand` | `#d4561f` | `#00A97A` |
| `--color-brand-strong` | `#b8431a` | `#00875F` |
| `--color-brand-soft` | `#fbe7da` | `#E6F7F1` |
| `--color-teal`, `--color-teal-strong` | teal pair | removed - they existed only to feed `verdict-go-back` |
| `--color-verdict-go-back` | `var(--color-teal)` | `#00875F` |
| `--color-verdict-detour` | `#8c692b` | `#F59E0B` |
| `--color-verdict-once` | `#a85423` | `#9AA3B2` |
| `--color-verdict-never` | `#8b3a3a` | `#F43F5E` |

`verdict-go-back` is deliberately darker than `--color-brand` so the primary button and the
best verdict do not read as the same element.

Three tokens are added:

```css
--radius-card: 1.125rem;
--shadow-card: 0 1px 2px rgb(16 24 40 / 0.05), 0 8px 22px rgb(16 24 40 / 0.06);
--shadow-brand: 0 6px 16px rgb(0 169 122 / 0.28);
```

Buttons and chips keep `rounded-full`. Cards trade their border for `--shadow-card`.

## Typography

`--font-display` is deleted. One family remains, so keeping a second token that resolves to
the same face would promise a display register that does not exist. The four files using
`font-display` (`src/App.tsx`, `src/features/map/MapView.tsx`,
`src/features/RestaurantList.tsx`, `src/index.css`) move to `font-bold tracking-tight`: the
title register comes from weight and tracking.

`index.html` drops to one Google Fonts family.

## Cuisine palette

A cuisine stores a **hue**, not a hex. Three uses derive from it by formula:

| Use | Recipe | Measured worst case |
| --- | --- | --- |
| Pill background | `oklch(0.96 0.045 H)` | - |
| Pill text | `oklch(0.40 0.13 H)` | 7.19:1 against the pill background |
| Solid marker, filter dot | `oklch(0.48 0.15 H)` | 5.52:1 against white text |

Both floors were measured across all 22 hues by converting OKLCH to linear sRGB and applying
the WCAG relative-luminance formula, taking the worst hue. Both clear AA.

Several hues fall outside sRGB at these chroma values and the browser maps them back into
gamut. The floors above were computed on the clipped colors, so the contrast guarantee holds
regardless of how a browser maps. The visible consequence is that greens and cyans render
less saturated than reds and blues - a limit of sRGB, not of the system.

**Hues are spaced 32 degrees apart** so no two neighbours converge once lightened to a
pastel pill. Eight cuisines keep the hue family they have today; Indian, Burger and Mexican
move within the warm family, because three oranges and three reds were the fault being
fixed.

| Cuisine | Hue | Cuisine | Hue |
| --- | --- | --- | --- |
| Pizza | 25 | Vietnamese | 217 |
| Indian | 57 | French | 249 |
| Burger | 89 | Thai | 281 |
| Mexican | 121 | Japanese | 313 |
| Italian | 153 | Chinese | 345 |
| Korean | 185 | | |

Two entries sit outside the wheel on purpose: **Café** uses hue 60 at half chroma, so it
reads as a true brown rather than a second amber; **uncategorized** is achromatic.

Free-text cuisines hash into **22 hues instead of 8**: 11 sitting at the midpoint of each
curated pair, and the same 11 again at reduced chroma. A user cuisine therefore never lands
on a curated hue, and collisions are nearly three times rarer.

## Status against verdict

"To try" and "Pending" are **statuses**, not verdicts, and today they are two near-identical
gray pills. They become light-gray pills with dark text, in the same shape language as the
cuisine pills, while the four verdicts stay solid with white text. Shape carries the
distinction, so whether a place has been visited is legible without reading the label.

## Files

| File | Change |
| --- | --- |
| `src/features/facets/cuisines.ts` | Hue table replaces the hex table. `colorForCuisine` keeps its signature and returns the solid recipe, so its four callers are untouched. New `cuisinePillTokens()` returns the pastel pair. Fallback wheel 8 to 22 |
| `src/features/RestaurantList.tsx` | The `color-mix` cuisine tint and its border are removed: white card, `rounded-card`, `--shadow-card`. Cuisine becomes a pastel pill |
| `src/features/ui/Badge.tsx` | New `pastel` mode. The solid `color` mode loses its last caller, so `luminance()` and `textColorFor()` are deleted as dead code |
| `src/features/StatusBadge.tsx` | Statuses render as pastel gray pills |
| `src/features/ui/ToggleChip.tsx` | The active pill drops `border-brand` for `bg-brand-soft` plus `shadow-sm` |
| `src/features/ui/Button.tsx` | `--shadow-brand` on the primary variant |
| `src/features/ui/Modal.tsx`, `ModalHeader.tsx` | Radius and shadow retokenized |
| `src/features/map/markers.ts`, `MapView.tsx` | New marker hues; `.marker-tooltip` realigned; `font-display` removed |
| `src/App.tsx`, `src/features/facets/FilterBar.tsx` | `font-display` removed; header and overlay chrome retokenized |
| `src/index.css`, `index.html`, `vite.config.ts` | Tokens, one font family, `theme-color` and manifest `theme_color` to `#00A97A` |
| `public/logo.svg`, `public/logo-mark.svg`, `scripts/generate-icons.mjs` | The constellation mark, plus its single-pin reduction; a new `npm run icons` regenerates the six raster icons from the two sources |

No component crosses the 250-line limit as a result, and no user-facing string is added, so
the i18n catalogues are untouched.

## Logo and icons

The mark is redrawn, not recolored. Today's mark is a white map pin on a terracotta square:
a generic pin that says neither "restaurants" nor "Tablemarks". The new mark - **the
constellation** - is three pins on a pale street plan, one brand-colored pin in front and
two smaller ones behind in cuisine hues. It says what the others could not: not *a* place,
a **collection**, which is what the app is.

Eleven alternatives were drawn and compared at size before this one, from a plain recolor
to a gingham tablecloth. The constellation was chosen for saying "collection", and its pin
scales were then calibrated over three steps.

### Geometry

The canvas is 512 with a 114 corner radius. Coordinates are absolute; each pin is the same
base path placed by translate and scale.

| Element | Placement | Fill |
| --- | --- | --- |
| Background | full bleed | `#F4F8F6` |
| Avenues | horizontal at y=118 and y=350, vertical at x=132 and x=390, stroke 15, round caps | `#E4EEE9` |
| Park | rounded rect at (-20, 366), 176 by 180, radius 26 | `#DEEEE6` |
| Pin, back left | translate(146, 196) scale(1.15) | `oklch(0.48 0.15 25)` |
| Pin, back right | translate(366, 180) scale(1.15) | `oklch(0.48 0.15 313)` |
| Pin, front | translate(256, 250) scale(1.60) | linear gradient `#00C48D` to `#00815E`, diagonal |

The base pin is centered on its own origin, its head 62 across and its tip 97 below, with a
white counter-circle of radius 23 at (0, -2). Back pins carry a drop shadow of `#04372A` at
26 percent, dy 8, blur 9; the front pin dy 12, blur 15, 32 percent.

Every element stays inside the maskable safe circle - radius 205 from the center - so
Android's mask cannot clip a pin. That constraint is what kept the pins at 1.60 and 1.15
rather than larger.

### Two sources, not one

Three overlapping pins on a street plan cannot resolve at 16 or 32 pixels. Rather than
compromise the icon for the favicon, the repo carries **two** SVG sources and the generator
picks by target size:

| Source | Feeds | Content |
| --- | --- | --- |
| `public/logo.svg` | `apple-touch-icon-180x180.png`, `pwa-192x192.png`, `pwa-512x512.png`, `maskable-icon-512x512.png` | The full constellation |
| `public/logo-mark.svg` | `favicon.ico`, `pwa-64x64.png` | The front pin alone, same gradient and background, scaled to fill |

Both read as the same icon because the front pin dominates the full version.

### Generation

`scripts/generate-icons.mjs` using `sharp` (new devDependency) becomes the source of truth
for all six raster files, exposed as `npm run icons`. It is what stops a future color change
from leaving orphaned icons behind, which is the state the repo is in today.
`@vite-pwa/assets-generator` covers the same ground and pairs with the PWA plugin already
installed; `sharp` was chosen because it adds one dependency rather than a second build
pipeline, and because the two-source rule above needs a script either way.

`theme_color` stays `#00A97A`. It colors the browser and OS chrome, which follows the app's
accent, not the icon's pale background.

## Documentation

| Artifact | Why |
| --- | --- |
| `docs/journal/decisions/0005-visual-direction-soft-pop.md` | The Carnet culinaire identity was decided in a plan, never in an ADR. This records the direction change and the two rejected alternatives |
| `docs/reference/design-tokens.md` | The palette now carries invariants - the 32-degree spacing, the three recipes, the contrast floors - that a future contributor would otherwise break by picking a hex for a thirteenth cuisine. Indexed in `docs/README.md` |
| `docs/how-to/development.md` | Gains the `npm run icons` script |
| `AGENTS.md` | The routing table gains a design-tokens row. Its 8 KB budget requires removing a line or naming why none had to go |

`README.md` describes no visual, and `docs/explanation/architecture.md` covers only the
local-first and sync design. Neither needs an edit.

## Verification

`npm test`, `npm run type-check`, `npx eslint .`, `npx prettier . --check`,
`npm run check:docs`.

Two test files are expected to fail until rewritten, and their failure is the signal the
change landed:

- `src/features/RestaurantList.test.tsx` asserts the exact `color-mix` card tint on two
  cases. Both become assertions on the pastel pill.
- `src/features/ui/ToggleChip.test.tsx` asserts `border-brand` on the active pill.

`src/features/ui/Badge.test.tsx` loses its luminance cases along with the code they cover.
Every other style assertion names a token (`bg-brand`, `bg-verdict-go-back`,
`rounded-full`) rather than a value, so it stays green.

Class assertions do not prove the result looks right. The app is run and every surface
reviewed by eye before the work is called done: list, map, detail modal, decide panel, add
place, account menu, filter and sort bars, at both the mobile and desktop breakpoints.

## Order of execution

Each step leaves the app working.

1. Tokens: `src/index.css`, `index.html`, `vite.config.ts`. The app retints whole, with no
   component touched.
2. The two SVG sources, `scripts/generate-icons.mjs`, and the six regenerated rasters,
   checked on a phone home screen and in a browser tab rather than only in a file viewer.
3. `src/features/facets/cuisines.ts`: hue system, the 22-hue fallback wheel, and its tests.
4. `Badge` pastel mode, then `StatusBadge`.
5. `RestaurantList`: the tint comes out, its two tests are rewritten.
6. The remaining primitives and screens.
7. ADR, `docs/reference/design-tokens.md`, and the two routing-table edits.

## Scope boundaries

- **No dark mode.** Considered and declined. The token names are the seam it would use later.
- **No layout change.** The mobile list and map toggle, the desktop sidebar and the overlay
  geometry all stay as they are. This is a restyle.
- **No new user-facing copy**, so no i18n work.
- **The cuisine vocabulary stays open.** Users keep adding their own; the fallback wheel is
  what serves them.
