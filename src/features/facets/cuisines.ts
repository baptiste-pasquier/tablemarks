import { CUISINE_CATALOG, FAMILY_HUES, resolveCuisine, type CuisineKey } from './cuisineCatalog'

/**
 * A cuisine's color identity is a hue, not a hex. Four rendered forms derive from it by
 * formula, so a cuisine nobody curated - one a user typed - gets the same contrast guarantees
 * as a curated one. Recipes, families and their measured contrast floors:
 * docs/reference/design-tokens.md.
 */
export interface CuisineTone {
  /** OKLCH hue angle in degrees. */
  hue: number
  /** Chroma multiplier applied to every recipe. 1, or 0.5 for a muted family member. */
  chroma: number
}

const PILL_BACKGROUND = { lightness: 0.96, chroma: 0.045 }
// A shade deeper than the pill: the avatar is the only color on a white tile, so it carries more.
// It holds an emoji, never text, so it has no contrast floor of its own.
const AVATAR_BACKGROUND = { lightness: 0.93, chroma: 0.07 }
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

// A family's first three members sit on its base hue and 12 degrees either side; the next three
// repeat those hues at half chroma. Color names the family, the emoji names the member.
const MEMBER_HUE_OFFSETS = [0, -12, 12]
const MUTED_CHROMA = 0.5

function familyTones(): ReadonlyMap<CuisineKey, CuisineTone> {
  const tones = new Map<CuisineKey, CuisineTone>()
  const position = new Map<string, number>()
  for (const entry of CUISINE_CATALOG) {
    const i = position.get(entry.family) ?? 0
    position.set(entry.family, i + 1)
    tones.set(entry.key, {
      hue: FAMILY_HUES[entry.family] + MEMBER_HUE_OFFSETS[i % 3],
      chroma: i < 3 ? 1 : MUTED_CHROMA,
    })
  }
  return tones
}

/** Every curated category's tone, derived from its family and its place in the catalog. */
export const CURATED_TONES = familyTones()

// Fallback wheel for free-text categories, assigned by name hash: the midpoints of the gaps
// between family bands, so a user category never passes for a family member, at full then half
// chroma. Collisions past 16 are acceptable: the color is a scannability hint, not an identifier.
const FALLBACK_HUES = [47, 96, 125, 151, 210, 267, 318, 354]

export const CUSTOM_TONES: readonly CuisineTone[] = [
  ...FALLBACK_HUES.map((hue) => ({ hue, chroma: 1 })),
  ...FALLBACK_HUES.map((hue) => ({ hue, chroma: MUTED_CHROMA })),
]

function hashString(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

/** The one category-to-tone source. Every rendered category color goes through here. */
export function toneForCuisine(cuisine: string | null | undefined): CuisineTone {
  const resolved = resolveCuisine(cuisine)
  if (!resolved) return UNCATEGORIZED_TONE
  if (resolved.kind === 'curated') return CURATED_TONES.get(resolved.key) ?? UNCATEGORIZED_TONE
  return CUSTOM_TONES[hashString(resolved.key) % CUSTOM_TONES.length]
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

/** Avatar form — the square behind a list tile's cuisine emoji. */
export function cuisineAvatarBackground(cuisine: string | null | undefined): string {
  return render(AVATAR_BACKGROUND, toneForCuisine(cuisine))
}

/** The one category-to-emoji source, resolved the same way as `toneForCuisine`. */
export function emojiForCuisine(cuisine: string | null | undefined): string {
  const resolved = resolveCuisine(cuisine)
  if (!resolved) return UNCATEGORIZED_EMOJI
  return resolved.kind === 'curated' ? resolved.entry.emoji : GENERIC_CUISINE_EMOJI
}
