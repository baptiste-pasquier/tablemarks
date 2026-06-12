export interface ParsedMapsUrl {
  /** coords: lat/lng extracted client-side. short: a maps.app.goo.gl link needing server resolve. none: not a usable Maps URL. */
  kind: 'coords' | 'short' | 'none'
  lat?: number
  lng?: number
  name?: string
}

const COORD = /@(-?\d+\.\d+),(-?\d+\.\d+)/
const PLACE = /\/maps\/place\/([^/@]+)/
const SHORT = /(?:maps\.app\.goo\.gl|goo\.gl\/maps)/

function placeName(text: string): string | undefined {
  const m = text.match(PLACE)
  if (!m) return undefined
  return decodeURIComponent(m[1].replace(/\+/g, ' '))
}

/** Parse a pasted Google Maps URL. Full URLs yield coordinates with no network; short links are flagged for server resolution. */
export function parseMapsUrl(input: string): ParsedMapsUrl {
  const text = input.trim()
  const coord = text.match(COORD)
  if (coord) {
    return { kind: 'coords', lat: parseFloat(coord[1]), lng: parseFloat(coord[2]), name: placeName(text) }
  }
  if (SHORT.test(text)) return { kind: 'short' }
  return { kind: 'none' }
}
