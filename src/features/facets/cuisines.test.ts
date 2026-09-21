import { describe, it, expect } from 'vitest'
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

describe('cuisineOptions', () => {
  it('unions curated with in-use cuisines, de-duplicates, and drops blanks', () => {
    const options = cuisineOptions([
      { cuisine: 'Ethiopian' },
      { cuisine: 'French' }, // already curated -> no dupe
      { cuisine: '  ' },
      { cuisine: null },
      {},
    ])
    expect(options).toContain('Ethiopian')
    expect(options.filter((o) => o === 'French')).toHaveLength(1)
    expect(options).not.toContain('')
    expect(options).toEqual([...options].sort((a, b) => a.localeCompare(b)))
  })
})
