import { describe, it, expect } from 'vitest'
import {
  colorForCuisine,
  cuisineOptions,
  emojiForCuisine,
  CURATED_CUISINES,
  UNCATEGORIZED_COLOR,
  UNCATEGORIZED_EMOJI,
  GENERIC_CUISINE_EMOJI,
} from './cuisines'

describe('colorForCuisine', () => {
  it('returns the fixed color for a curated cuisine (case-insensitive)', () => {
    const french = CURATED_CUISINES.find((c) => c.name === 'French')!.color
    expect(colorForCuisine('French')).toBe(french)
    expect(colorForCuisine('french')).toBe(french)
  })

  it('returns the neutral color for empty/undefined', () => {
    expect(colorForCuisine(undefined)).toBe(UNCATEGORIZED_COLOR)
    expect(colorForCuisine('')).toBe(UNCATEGORIZED_COLOR)
    expect(colorForCuisine('   ')).toBe(UNCATEGORIZED_COLOR)
  })

  it('assigns a stable, non-neutral color to a custom cuisine', () => {
    const a = colorForCuisine('Ethiopian')
    expect(a).toBe(colorForCuisine('Ethiopian')) // deterministic
    expect(a).not.toBe(UNCATEGORIZED_COLOR)
  })

  it('never maps a real cuisine onto the neutral color', () => {
    for (const c of [...CURATED_CUISINES.map((x) => x.name), 'Ethiopian', 'Peruvian', 'Ramen']) {
      expect(colorForCuisine(c)).not.toBe(UNCATEGORIZED_COLOR)
    }
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

  it('has an emoji for every curated cuisine', () => {
    for (const c of CURATED_CUISINES) {
      expect(emojiForCuisine(c.name)).not.toBe(GENERIC_CUISINE_EMOJI)
    }
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
