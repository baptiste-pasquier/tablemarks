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

| Token                                  | Value                 | Used for                                                                     |
| -------------------------------------- | --------------------- | ---------------------------------------------------------------------------- |
| `--color-brand`                        | `#ea580c`             | Primary actions, and the fill of a selected chip                             |
| `--color-brand-strong`                 | `#b93a0c`             | Hover and active states of a primary action, link text                       |
| `--color-brand-soft`                   | `#ffede3`             | Hover wash on a brand-tinted control, and the active segment in the sort bar |
| `--color-canvas`                       | `#ffffff`             | The page behind everything — root, header, list pane                         |
| `--color-gray-50` … `--color-gray-950` | `#f8fafb` … `#070b11` | Every neutral surface and text color                                         |

White text on `--color-brand` measures 3.56:1, under AA — no vivid orange reaches it, and a
darker one reads as the terracotta identity this replaced. Text in the brand color therefore uses
`--color-brand-strong` (5.72:1 on white).

Secondary text and eyebrows are `--color-gray-600` or darker (6.00:1 on white): `gray-500`
measures 3.98:1 and `gray-400` under 2.5:1, both under AA for text this small. The margin matters
if `--color-canvas` is ever tinted: on `#f3f4f6`, `gray-600` still clears 5.45:1.

## Verdicts and statuses

A verdict renders solid with white text. A status renders as a pastel gray pill with dark text.
Shape carries the distinction; color alone does not.

These four are picked values, not derived ones, so each carries its own measured figure. They are
deep enough that one text color serves all four — bright fills with dark text measured fine and
still read badly, two strong colors competing inside one pill.

| Token                     | Value     | White text on it |
| ------------------------- | --------- | ---------------- |
| `--color-verdict-go-back` | `#00734f` | 5.89:1           |
| `--color-verdict-detour`  | `#4338ca` | 7.90:1           |
| `--color-verdict-once`    | `#546174` | 6.29:1           |
| `--color-verdict-never`   | `#be123c` | 6.29:1           |

No verdict may sit near the brand hue: a selected verdict chip and a selected cuisine chip
appear side by side, and an amber detour beside an orange brand was indistinguishable.

Changing one of these means re-measuring it: badge text is 12px, so the floor is AA's 4.5:1 for
normal text, and nothing in the suite checks these four the way `cuisines.test.ts` checks the
derived palette.

A verdict's leading glyph is a Lucide icon (`VERDICT_ICON` in `src/features/display.ts`), never an
emoji: an emoji carries fixed colors and turns into a smudge on a solid fill, while a line icon
inherits `currentColor`. Cuisines keep emoji — on a pastel pill the color is an asset.

A selected filter chip wears what it filters for: a verdict chip takes that verdict's own fill,
a status chip the neutral status pill, and a cuisine chip — having no color of its own to borrow —
the brand fill. Four identical brand-colored pills would say nothing about which verdict is selected.

Every cuisine color is an `oklch()` value, so the palette needs a browser that parses it
(Baseline since mid-2023). An older engine drops the declaration and renders the badge
unstyled rather than mis-tinted.

## Shape

| Token            | Value                                                             |
| ---------------- | ----------------------------------------------------------------- |
| `--radius-card`  | `1.125rem`                                                        |
| `--shadow-card`  | `0 1px 2px rgb(16 24 40 / 0.1), 0 6px 16px rgb(16 24 40 / 0.14)`  |
| `--shadow-chip`  | `0 1px 2px rgb(16 24 40 / 0.12), 0 4px 10px rgb(16 24 40 / 0.14)` |
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

Surfaces sit on white and separate by relief, not by a tinted page behind them: the shadows above
are short and dense on purpose, because a wide soft spread lights an area instead of drawing an
edge. Cards are spaced `space-y-4`, which is part of the same job.
