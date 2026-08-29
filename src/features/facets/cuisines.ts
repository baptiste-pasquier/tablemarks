/** Neutral color for places with no cuisine. */
export const UNCATEGORIZED_COLOR = '#9ca3af'

/** Emoji for places with no cuisine — distinct from the generic free-text fallback. */
export const UNCATEGORIZED_EMOJI = '🍽️'

/** Generic emoji for a free-text cuisine with no curated match. */
export const GENERIC_CUISINE_EMOJI = '🍴'

/** Curated cuisines with fixed colors. The vocabulary is open — users can add their own. */
export const CURATED_CUISINES: ReadonlyArray<{ name: string; color: string }> = [
  { name: 'Burger', color: '#b45309' },
  { name: 'French', color: '#2563eb' },
  { name: 'Italian', color: '#16a34a' },
  { name: 'Indian', color: '#ea580c' },
  { name: 'Japanese', color: '#db2777' },
  { name: 'Chinese', color: '#dc2626' },
  { name: 'Thai', color: '#7c3aed' },
  { name: 'Mexican', color: '#ca8a04' },
  { name: 'Pizza', color: '#e11d48' },
  { name: 'Korean', color: '#0d9488' },
  { name: 'Vietnamese', color: '#0891b2' },
  { name: 'Café', color: '#92400e' },
]

const CURATED_BY_KEY = new Map(CURATED_CUISINES.map((c) => [c.name.toLowerCase(), c.color]))

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

// Palette for custom cuisines — assigned deterministically by name hash. Collisions are
// acceptable: the color is a scannability hint, not an identifier.
const CUSTOM_PALETTE = [
  '#9333ea',
  '#65a30d',
  '#0284c7',
  '#be123c',
  '#a16207',
  '#15803d',
  '#7e22ce',
  '#c2410c',
]

function hashString(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

function normalize(cuisine: string | null | undefined): string | null {
  const c = cuisine?.trim()
  return c ? c : null
}

/** The one cuisine-to-color source, shared by markers and filter chips. Neutral for uncategorized. */
export function colorForCuisine(cuisine: string | null | undefined): string {
  const key = normalize(cuisine)
  if (!key) return UNCATEGORIZED_COLOR
  return CURATED_BY_KEY.get(key.toLowerCase()) ?? CUSTOM_PALETTE[hashString(key.toLowerCase()) % CUSTOM_PALETTE.length]
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
