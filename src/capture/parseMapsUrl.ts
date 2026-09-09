export interface ParsedMapsUrl {
  /** coords: lat/lng extracted client-side. short: a maps.app.goo.gl link needing server resolve. none: not a usable Maps URL — including a legacy goo.gl/maps link, which the resolver does not accept. */
  kind: 'coords' | 'short' | 'none'
  lat?: number
  lng?: number
  name?: string
}

const COORD = /@(-?\d+\.\d+),(-?\d+\.\d+)/
const PLACE = /\/maps\/place\/([^/@]+)/
/**
 * Only what Google Maps produces today. `goo.gl/maps` — the pre-2019 form — is deliberately absent:
 * the server-side resolver does not accept that host (it is the general-purpose Google redirector,
 * and allowlisting it would make the route a redirect-follower for anything Google ever shortened),
 * so classifying one as `short` only sent it on a round trip that ends in a refusal.
 *
 * Such a link now reads as `none` and routes to name search, which works. Legacy `goo.gl/maps`
 * links that are still active do resolve in a browser, so pasting the page's full URL instead is
 * the other way through.
 */
const SHORT = /maps\.app\.goo\.gl/

function placeName(text: string): string | undefined {
  const m = text.match(PLACE)
  if (!m) return undefined
  const raw = m[1].replace(/\+/g, ' ')
  try {
    return decodeURIComponent(raw)
  } catch {
    // Malformed percent-encoding — fall back to the raw segment rather than throwing.
    return raw
  }
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
