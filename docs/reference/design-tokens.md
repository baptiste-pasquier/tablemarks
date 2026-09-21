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

| Token                                  | Value                 | Used for                                                                                     |
| -------------------------------------- | --------------------- | -------------------------------------------------------------------------------------------- |
| `--color-brand`                        | `#00a97a`             | Primary actions, the active chip, the front pin of the mark                                  |
| `--color-brand-strong`                 | `#00875f`             | Hover and active states of a primary action                                                  |
| `--color-brand-soft`                   | `#e6f7f1`             | The fill of an active toggle chip                                                            |
| `--color-gray-50` … `--color-gray-950` | `#f8fafb` … `#070b11` | Every neutral surface and text color                                                         |
| `--color-canvas`                       | `#f5f7f9`             | The page behind the cards, a half-step below `--color-gray-50` so white cards read as raised |

## Verdicts and statuses

A verdict renders solid. A status renders as a pastel pill with dark text. Shape carries the
distinction; color alone does not.

These four are picked values, not derived ones, so each carries its own measured pairing. Text
color is chosen per fill rather than fixed: white clears AA only on the dark green.

| Token                     | Value     | Text               | Contrast |
| ------------------------- | --------- | ------------------ | -------- |
| `--color-verdict-go-back` | `#00875f` | white              | 4.53:1   |
| `--color-verdict-detour`  | `#f59e0b` | `--color-gray-900` | 8.32:1   |
| `--color-verdict-once`    | `#9aa3b2` | `--color-gray-900` | 7.02:1   |
| `--color-verdict-never`   | `#f43f5e` | `--color-gray-900` | 4.87:1   |

Changing one of these values means re-measuring its pairing: badge text is 11px, so the floor is
AA's 4.5:1 for normal text, and nothing in the suite checks these four the way
`cuisines.test.ts` checks the derived palette.

Every cuisine color is an `oklch()` value, so the palette needs a browser that parses it
(Baseline since mid-2023). An older engine drops the declaration and renders the badge
unstyled rather than mis-tinted.

## Shape

| Token            | Value                                                             |
| ---------------- | ----------------------------------------------------------------- |
| `--radius-card`  | `1.125rem`                                                        |
| `--shadow-card`  | `0 1px 2px rgb(16 24 40 / 0.05), 0 8px 22px rgb(16 24 40 / 0.06)` |
| `--shadow-brand` | `0 6px 16px rgb(0 169 122 / 0.28)`                                |

Cards carry a shadow and no border. Buttons and chips are `rounded-full`.

## The cuisine palette

A cuisine carries a hue and a chroma multiplier, never a hex. `src/features/facets/cuisines.ts`
is the only module that renders one into a color.

| Form                     | Recipe                  | Contrast floor               |
| ------------------------ | ----------------------- | ---------------------------- |
| Pill background          | `oklch(0.96 0.045×c H)` | —                            |
| Pill text                | `oklch(0.40 0.13×c H)`  | 7.19:1 on its own background |
| Solid marker, filter dot | `oklch(0.48 0.15×c H)`  | 5.52:1 against white text    |

Both floors hold for every hue, including hues a browser maps back into sRGB.

### Rules

- **Curated hues sit 32 degrees apart.** A thirteenth curated cuisine does not get a spare
  angle — it gets a re-spaced wheel, or it goes in the fallback set.
- **Café is the one entry off the wheel**: hue 60 at chroma 0.5, so it reads brown rather than
  a second amber.
- **A free-text cuisine hashes into `CUSTOM_TONES`**, 22 tones whose hues sit at the midpoints
  of the curated pairs. No fallback hue equals a curated hue.
- **Uncategorized is achromatic**, not a gray hex.

| Cuisine | Hue | Cuisine    | Hue             |
| ------- | --- | ---------- | --------------- |
| Pizza   | 25  | Vietnamese | 217             |
| Indian  | 57  | French     | 249             |
| Burger  | 89  | Thai       | 281             |
| Mexican | 121 | Japanese   | 313             |
| Italian | 153 | Chinese    | 345             |
| Korean  | 185 | Café       | 60 (chroma 0.5) |

## Icons

`public/logo.svg` feeds every raster at 180 px and above; `public/logo-mark.svg`, the single-pin
reduction, feeds `favicon.ico` and `pwa-64x64.png`. `npm run icons` regenerates all six. Both
sources use hex, not `oklch()`: sharp rasterises through librsvg, which does not implement it.

Every pin in `public/logo.svg` must sit inside a circle of radius 205 centred at (256,256) on the
512 canvas — the maskable safe zone. The current mark sits on that boundary with no margin, so a
change to any pin's `translate` or `scale` must be re-measured against it.
