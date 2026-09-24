import { describe, it, expect } from 'vitest'
import {
  colorForCuisine,
  cuisineAvatarBackground,
  cuisinePillTokens,
  emojiForCuisine,
  toneForCuisine,
  CURATED_CUISINES,
  CUSTOM_TONES,
  UNCATEGORIZED_COLOR,
  UNCATEGORIZED_EMOJI,
  GENERIC_CUISINE_EMOJI,
} from './cuisines'

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

describe('cuisineAvatarBackground', () => {
  it('is a shade deeper than the pill background, in the same hue and chroma scale', () => {
    expect(cuisineAvatarBackground('Thai')).toBe('oklch(0.93 0.07 281)')
    expect(cuisineAvatarBackground('Café')).toBe('oklch(0.93 0.035 60)')
    expect(cuisineAvatarBackground(null)).toBe('oklch(0.93 0 0)')
  })
})

describe('emojiForCuisine', () => {
  it('returns the curated emoji for a curated cuisine (case-insensitive)', () => {
    expect(emojiForCuisine('French')).toBe('🥖')
    expect(emojiForCuisine('french')).toBe('🥖')
  })

  it('returns the Uncategorized emoji for empty/undefined, distinct from the generic fallback', () => {
    expect(emojiForCuisine(undefined)).toBe(UNCATEGORIZED_EMOJI)
    expect(emojiForCuisine('')).toBe(UNCATEGORIZED_EMOJI)
    expect(emojiForCuisine('   ')).toBe(UNCATEGORIZED_EMOJI)
    expect(UNCATEGORIZED_EMOJI).not.toBe(GENERIC_CUISINE_EMOJI)
  })

  it('returns the generic fallback emoji for a free-text cuisine not in the curated map', () => {
    expect(emojiForCuisine('Ethiopian')).toBe(GENERIC_CUISINE_EMOJI)
  })

  it('maps each curated cuisine to its own specific assigned emoji', () => {
    const expected: Record<string, string> = {
      Burger: '🍔',
      French: '🥖',
      Italian: '🍝',
      Indian: '🍛',
      Japanese: '🍣',
      Chinese: '🥡',
      Thai: '🍜',
      Mexican: '🌮',
      Pizza: '🍕',
      Korean: '🍲',
      Vietnamese: '🥢',
      Café: '☕️',
    }
    expect(Object.keys(expected).sort()).toEqual(CURATED_CUISINES.map((c) => c.name).sort())
    for (const c of CURATED_CUISINES) {
      expect(emojiForCuisine(c.name)).toBe(expected[c.name])
    }
  })

  it('falls back to the generic emoji instead of leaking an Object.prototype member', () => {
    expect(emojiForCuisine('constructor')).toBe(GENERIC_CUISINE_EMOJI)
    expect(emojiForCuisine('__proto__')).toBe(GENERIC_CUISINE_EMOJI)
    expect(emojiForCuisine('hasOwnProperty')).toBe(GENERIC_CUISINE_EMOJI)
  })
})

/**
 * The palette's promise is a *measured* floor, not a chosen one: every tone -- the twelve curated
 * hues and the twenty-two fallbacks alike -- must clear WCAG AA on both rendered forms. Without
 * this, a thirteenth cuisine or a tweak to a recipe's lightness silently drops a badge below
 * legibility, since nothing else in the suite reads a color as a color.
 *
 * It measures what the module returns, never a copy of the recipes: a test holding its own
 * lightness/chroma numbers would keep passing after someone changed the real ones.
 */
describe('cuisine palette contrast floors', () => {
  /** OKLCH -> linear sRGB, clipped to gamut the way a browser clips before painting. */
  function linearRgb(color: string): number[] {
    const [lightness, chroma, hue] = color.match(/[\d.]+/g)!.map(Number)
    const h = (hue * Math.PI) / 180
    const a = chroma * Math.cos(h)
    const b = chroma * Math.sin(h)
    const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3
    const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3
    const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3
    return [
      4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
      -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
      -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
    ].map((c) => Math.min(1, Math.max(0, c)))
  }

  function luminance(color: string): number {
    const [r, g, b] = linearRgb(color)
    return 0.2126 * r + 0.7152 * g + 0.0722 * b
  }

  function contrast(foreground: string, background: string): number {
    const [hi, lo] = [luminance(foreground), luminance(background)].sort((x, y) => y - x)
    return (hi + 0.05) / (lo + 0.05)
  }

  /**
   * Curated cuisines answer to their own name; the fallback wheel is only reachable through the
   * hash, so probe names are drawn until every tone in `CUSTOM_TONES` has been seen. Failing to
   * reach them all is itself a failure -- it would mean a tone nothing can ever be assigned.
   */
  function everyPaintedName(): string[] {
    const names = CURATED_CUISINES.map(({ name }) => name)
    const unseen = new Set(CUSTOM_TONES.map(({ hue, chroma }) => `${hue}:${chroma}`))
    for (let i = 0; unseen.size > 0 && i < 5000; i += 1) {
      const probe = `probe-${i}`
      const { hue, chroma } = toneForCuisine(probe)
      const key = `${hue}:${chroma}`
      if (unseen.delete(key)) names.push(probe)
    }
    expect(unseen, 'every fallback tone must be reachable by some cuisine name').toEqual(new Set())
    return names
  }

  const PAINTED = everyPaintedName()

  it.each(PAINTED)('%s: pill text clears AA on its pill background', (name) => {
    const { background, color } = cuisinePillTokens(name)
    expect(contrast(color, background)).toBeGreaterThanOrEqual(4.5)
  })

  // The list tile sets the cuisine name in the pill's text color straight on the white card.
  it.each(PAINTED)('%s: pill text clears AA on a white tile', (name) => {
    expect(contrast(cuisinePillTokens(name).color, 'oklch(1 0 0)')).toBeGreaterThanOrEqual(4.5)
  })

  it.each(PAINTED)('%s: white clears AA on the solid form', (name) => {
    expect(contrast('oklch(1 0 0)', colorForCuisine(name))).toBeGreaterThanOrEqual(4.5)
  })

  it('holds the same floors for the uncategorized tone', () => {
    expect(contrast('oklch(1 0 0)', UNCATEGORIZED_COLOR)).toBeGreaterThanOrEqual(4.5)
    const { background, color } = cuisinePillTokens(null)
    expect(contrast(color, background)).toBeGreaterThanOrEqual(4.5)
  })
})
