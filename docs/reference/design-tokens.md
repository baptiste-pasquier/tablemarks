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
| `--color-brand-bright`                 | `#f7722a`             | The light start of the header band's gradient                                |
| `--color-brand-deep`                   | `#cf4708`             | The deep end of the header band's gradient                                   |
| `--color-canvas`                       | `#ffffff`             | The page behind everything — root, list pane                                 |
| `--color-gray-50` … `--color-gray-950` | `#f8fafb` … `#070b11` | Every neutral surface and text color                                         |

White text on `--color-brand` measures 3.56:1, under AA — no vivid orange reaches it, and a
darker one reads as the terracotta identity this replaced. Text in the brand color therefore uses
`--color-brand-strong` (5.72:1 on white).

## Destructive actions

An action that destroys data is red, never the brand color. These are Tailwind's stock reds, not
`@theme` tokens.

| Class     | Used for                                                  | Contrast                  |
| --------- | --------------------------------------------------------- | ------------------------- |
| `red-600` | `danger` fill; error and destructive text on white        | 4.76:1 against white text |
| `red-700` | `danger` hover and active; error text on a `red-50` panel | 6.42:1 against white text |
| `red-50`  | The confirm panel, with a `red-200` edge                  | —                         |

Error text on a `red-50` panel steps down to `red-700`: `red-600` there measures 4.36:1, under AA.

## The header band

The header and the two actions under it form one Paprika band: `--color-brand-bright` to
`--color-brand-deep`, through `--color-brand` at 55%, left to right. The direction is
load-bearing — the header and the action band are two boxes of the same width, and only a
horizontal gradient meets itself across them without a seam. On desktop the band is the top of
the sidebar, not a strip across the screen, and the account controls float over the map's
top-right corner instead.

The light start was chosen by eye over contrast, and its cost is measured: white on the band runs
from 2.84:1 at the left edge to 4.61:1 at the right. The title starts at 3.03:1, just over AA's 3:1
for large text; the 12px tagline, at about the same, is under AA. The actions use `on-brand` (a
white pill with `--color-brand-strong` text on `--shadow-on-brand`) and `on-brand-glass` (white
text on a 20% white wash inside a white edge), whose label measures 2.33:1 to 2.81:1 across the
width it spans. The settings button on a phone is the same glass (`band-icon`), and turns into a
white chip once it floats over the map on desktop.

The logo is itself a Paprika tile, so on the band it wears a white ring (`ring-2 ring-white/80`) to
keep an edge.

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

A verdict's leading glyph is a Lucide icon (`VERDICT_ICON` in `src/features/display.ts`), and so
is a status's (`STATUS_ICON`: sparkles for "to try", a check for "visited"), never an emoji: an
emoji carries fixed colors and turns into a smudge on a solid fill, while a line icon inherits
`currentColor`. Cuisines keep emoji — on a pastel pill the color is an asset.

A selected filter chip wears what it filters for: a verdict chip takes that verdict's own fill, a
cuisine chip the solid color its markers wear on the map, "to try" the neutral pill its badge
wears, and "visited" — which has no color of its own to borrow — the brand fill. At rest every
chip is white, and a cuisine chip shows only its emoji: the color arrives with the selection.
Four identical brand-colored pills would say nothing about which verdict is selected.

Every cuisine color is an `oklch()` value, so the palette needs a browser that parses it
(Baseline since mid-2023). An older engine drops the declaration and renders the badge
unstyled rather than mis-tinted.

## Open state

The open/closed line on cards, previews and the detail (`features/places/OpenStateText.tsx`)
uses Tailwind's palette, not a brand token: `emerald-700` text on an `emerald-500` dot for open,
`amber-700` / `amber-500` for opening within two hours, `gray-600` / `gray-400` otherwise. The
dot is decorative; the words carry the state.

## Shape

| Token               | Value                                                             |
| ------------------- | ----------------------------------------------------------------- |
| `--radius-card`     | `1.125rem`                                                        |
| `--shadow-card`     | `0 1px 2px rgb(16 24 40 / 0.1), 0 6px 16px rgb(16 24 40 / 0.14)`  |
| `--shadow-chip`     | `0 1px 2px rgb(16 24 40 / 0.12), 0 4px 10px rgb(16 24 40 / 0.14)` |
| `--shadow-brand`    | `0 6px 16px rgb(234 88 12 / 0.28)`                                |
| `--shadow-on-brand` | `0 6px 16px rgb(90 25 0 / 0.25)`                                  |

Cards carry a shadow and no border. Buttons and chips are `rounded-full`.

## The cuisine palette

A cuisine carries a hue and a chroma multiplier, never a hex. `src/features/facets/cuisines.ts`
is the only module that renders one into a color.

| Form                               | Recipe                  | Contrast floor               |
| ---------------------------------- | ----------------------- | ---------------------------- |
| Pill background                    | `oklch(0.96 0.045×c H)` | —                            |
| Pill text                          | `oklch(0.40 0.13×c H)`  | 7.19:1 on its own background |
| Solid marker, selected filter chip | `oklch(0.48 0.15×c H)`  | 5.52:1 against white text    |
| List tile avatar                   | `oklch(0.93 0.07×c H)`  | — (holds an emoji, no text)  |

Every floor holds for every hue, including hues a browser maps back into sRGB. The list tile also
sets the cuisine's name in the pill text color straight on the white card, and
`cuisines.test.ts` holds that pairing to AA as well.

### Rules

- **A category's color says its family.** Each family owns a base hue. Member `i` of a family,
  in the order of `src/features/facets/cuisineCatalog.ts`, takes the hue
  `base + [0, −12, +12][i mod 3]`, at chroma 1 for the first three and 0.5 after. Members look
  alike on purpose; the emoji tells them apart.
- **A new curated category joins a family**, it does not get a hue of its own. A seventh member
  would repeat a tone, so a family that full gets split instead.
- **A free-text category hashes into `CUSTOM_TONES`**, 16 tones on the midpoints of the gaps
  between family bands. No fallback hue sits within 10 degrees of a curated hue.
- **Uncategorized is achromatic**, not a gray hex.

| Family        | Base hue | Members, in order                                   |
| ------------- | -------- | --------------------------------------------------- |
| Americas      | 25       | Burger, Mexican                                     |
| Sweet         | 70       | Bakery, Pastry, Ice cream, Café, Brunch             |
| Africa        | 110      | African                                             |
| Vegetarian    | 140      | Vegetarian                                          |
| Mediterranean | 175      | Italian, Pizza, Greek, Lebanese, Spanish, Kebab     |
| France        | 245      | French, Crêperie                                    |
| Asia          | 290      | Japanese, Chinese, Korean, Thai, Vietnamese, Indian |
| Bar           | 335      | Bar                                                 |

Fallback hues: 47, 96, 125, 151, 210, 267, 318, 354.

## Icons

The mark is a Paprika tile (`#F7722A` to `#DD4E0A`) with a white front pin whose hole is
`--color-brand`; the maskable target is flattened onto the gradient's midpoint, `#EA601B`.
`public/logo.svg` feeds every raster at 180 px and above; `public/logo-mark.svg`, the single-pin
reduction, feeds `favicon.ico` and `pwa-64x64.png`. `npm run icons` regenerates all six. Both
sources use hex, not `oklch()`: sharp rasterises through librsvg, which does not implement it.

Every pin in `public/logo.svg` must sit inside a circle of radius 205 centred at (256,256) on the
512 canvas — the maskable safe zone. The current mark sits on that boundary with no margin, so a
change to any pin's `translate` or `scale` must be re-measured against it.

Surfaces sit on white and separate by relief, not by a tinted page behind them: the shadows above
are short and dense on purpose, because a wide soft spread lights an area instead of drawing an
edge. Cards are spaced `space-y-4`, which is part of the same job.
