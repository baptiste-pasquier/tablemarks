import { describe, it, expect } from 'vitest'
import {
  colorForCuisine,
  cuisineAvatarBackground,
  cuisinePillTokens,
  emojiForCuisine,
  toneForCuisine,
  CURATED_TONES,
  CUSTOM_TONES,
  UNCATEGORIZED_COLOR,
  UNCATEGORIZED_EMOJI,
  GENERIC_CUISINE_EMOJI,
} from './cuisines'
import { CUISINE_CATALOG, FAMILY_HUES } from './cuisineCatalog'

describe('colorForCuisine', () => {
  it('derives the solid form from the category tone, whatever name it is stored under', () => {
    expect(colorForCuisine('french')).toBe('oklch(0.48 0.15 245)')
    expect(colorForCuisine('French')).toBe(colorForCuisine('french'))
    expect(colorForCuisine('Français')).toBe(colorForCuisine('french'))
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
    for (const c of [...CUISINE_CATALOG.map((e) => e.key), 'Ethiopian', 'Peruvian', 'Ramen']) {
      expect(colorForCuisine(c)).not.toBe(UNCATEGORIZED_COLOR)
    }
  })
})

describe('the hue families', () => {
  it('tones each member from its family base: 0, -12, +12, then the same muted', () => {
    expect(toneForCuisine('japanese')).toEqual({ hue: 290, chroma: 1 })
    expect(toneForCuisine('chinese')).toEqual({ hue: 278, chroma: 1 })
    expect(toneForCuisine('korean')).toEqual({ hue: 302, chroma: 1 })
    expect(toneForCuisine('thai')).toEqual({ hue: 290, chroma: 0.5 })
    expect(toneForCuisine('vietnamese')).toEqual({ hue: 278, chroma: 0.5 })
    expect(toneForCuisine('indian')).toEqual({ hue: 302, chroma: 0.5 })
    expect(toneForCuisine('coffee_shop')).toEqual({ hue: 70, chroma: 0.5 })
    expect(toneForCuisine('bar')).toEqual({ hue: 335, chroma: 1 })
  })

  it('gives every curated category a tone within 12 degrees of its family base', () => {
    expect(CURATED_TONES.size).toBe(CUISINE_CATALOG.length)
    for (const entry of CUISINE_CATALOG) {
      const tone = CURATED_TONES.get(entry.key)!
      expect(Math.abs(tone.hue - FAMILY_HUES[entry.family])).toBeLessThanOrEqual(12)
    }
  })

  it('never gives two curated categories of different families the same tone', () => {
    const owner = new Map<string, string>()
    for (const entry of CUISINE_CATALOG) {
      const { hue, chroma } = CURATED_TONES.get(entry.key)!
      const id = `${hue}:${chroma}`
      expect(owner.get(id) ?? entry.family).toBe(entry.family)
      owner.set(id, entry.family)
    }
  })

  it('offers 16 fallback tones, each at least 10 degrees from every curated hue', () => {
    expect(CUSTOM_TONES).toHaveLength(16)
    for (const tone of CUSTOM_TONES) {
      for (const [key, curated] of CURATED_TONES) {
        const d = Math.abs(tone.hue - curated.hue)
        const gap = Math.min(d, 360 - d)
        expect(gap, `fallback hue ${tone.hue} vs ${key}`).toBeGreaterThanOrEqual(10)
      }
    }
  })

  it('resolves a free-text category to one fallback tone, whatever its case or accents', () => {
    const tone = toneForCuisine('Éthiopien')
    expect(CUSTOM_TONES).toContainEqual(tone)
    expect(toneForCuisine('ethiopien')).toEqual(tone)
  })
})

describe('cuisinePillTokens', () => {
  it('pairs a very light background with a dark text of the same hue', () => {
    expect(cuisinePillTokens('japanese')).toEqual({
      background: 'oklch(0.96 0.045 290)',
      color: 'oklch(0.4 0.13 290)',
    })
  })

  it('scales both halves by the tone chroma, so Café stays brown', () => {
    expect(cuisinePillTokens('coffee_shop')).toEqual({
      background: 'oklch(0.96 0.0225 70)',
      color: 'oklch(0.4 0.065 70)',
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
    expect(cuisineAvatarBackground('japanese')).toBe('oklch(0.93 0.07 290)')
    expect(cuisineAvatarBackground('coffee_shop')).toBe('oklch(0.93 0.035 70)')
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

  it('takes each curated emoji from the catalog, whatever name the category is stored under', () => {
    for (const entry of CUISINE_CATALOG) expect(emojiForCuisine(entry.key)).toBe(entry.emoji)
    expect(emojiForCuisine('Boulangerie')).toBe('🥐')
    expect(emojiForCuisine('Café')).toBe('☕️')
  })

  it('falls back to the generic emoji instead of leaking an Object.prototype member', () => {
    expect(emojiForCuisine('constructor')).toBe(GENERIC_CUISINE_EMOJI)
    expect(emojiForCuisine('__proto__')).toBe(GENERIC_CUISINE_EMOJI)
    expect(emojiForCuisine('hasOwnProperty')).toBe(GENERIC_CUISINE_EMOJI)
  })
})

/**
 * The palette's promise is a *measured* floor, not a chosen one: every tone -- the twenty-four
 * curated tones and the sixteen fallbacks alike -- must clear WCAG AA on both rendered forms.
 * Without this, a twenty-fifth category or a tweak to a recipe's lightness silently drops a badge
 * below legibility, since nothing else in the suite reads a color as a color.
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
    const names: string[] = CUISINE_CATALOG.map(({ key }) => key)
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
