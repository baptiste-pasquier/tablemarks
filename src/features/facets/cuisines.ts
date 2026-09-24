/**
 * A cuisine's color identity is a hue, not a hex. Four rendered forms derive from it by
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

/** Avatar form — the square behind a list tile's cuisine emoji. */
export function cuisineAvatarBackground(cuisine: string | null | undefined): string {
  return render(AVATAR_BACKGROUND, toneForCuisine(cuisine))
}

/** The one cuisine-to-emoji source, mirroring `colorForCuisine`'s normalize-then-lookup shape. */
export function emojiForCuisine(cuisine: string | null | undefined): string {
  const key = normalize(cuisine)
  if (!key) return UNCATEGORIZED_EMOJI
  return CUISINE_EMOJI.get(key.toLowerCase()) ?? GENERIC_CUISINE_EMOJI
}

/** Picker options: curated cuisines unioned with any already in use, de-duped case-insensitively, sorted. */
export function cuisineOptions(restaurants: ReadonlyArray<{ cuisine?: string | null }>): string[] {
  // Keyed by lowercase so 'french' and 'French' collapse to one option, keeping the
  // curated casing (or the first-seen custom casing) as the display label.
  const byKey = new Map<string, string>()
  for (const c of CURATED_CUISINES) byKey.set(c.name.toLowerCase(), c.name)
  for (const r of restaurants) {
    const c = normalize(r.cuisine)
    if (c && !byKey.has(c.toLowerCase())) byKey.set(c.toLowerCase(), c)
  }
  return [...byKey.values()].sort((a, b) => a.localeCompare(b))
}
