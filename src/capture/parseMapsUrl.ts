/**
 * A union rather than one shape with optional fields, so `lat`/`lng` exist only on the variant
 * that has them. The optional-field form let the caller reach them with `!` on any variant, and
 * adding `unsupported` fell straight through to that line and produced a saved place with
 * undefined coordinates — with no type error and no failing test (review #6).
 */
export type ParsedMapsUrl =
  /** lat/lng extracted client-side, no network needed. */
  | { kind: 'coords'; lat: number; lng: number; name?: string }
  /** A maps.app.goo.gl link the server-side resolver can follow. */
  | { kind: 'short' }
  /** A Google Maps or goo.gl URL this app cannot turn into a place. */
  | { kind: 'unsupported' }
  /** Not a Maps URL at all — route it to name search. */
  | { kind: 'none' }

const COORD = /@(-?\d+\.\d+),(-?\d+\.\d+)/
const PLACE = /\/maps\/place\/([^/@]+)/
/**
 * Only what Google Maps produces today. `goo.gl/maps` — the pre-2019 form — is deliberately absent:
 * the server-side resolver does not accept that host (it is the general-purpose Google redirector,
 * and allowlisting it would make the route a redirect-follower for anything Google ever shortened),
 * so classifying one as `short` only sent it on a round trip that ends in a refusal.
 *
 * Such a link reads as `unsupported`, which refuses it with an explanation. Routing it to name
 * search instead — what this did first — searches Nominatim for the text of a URL, finds nothing,
 * and leaves the user with a bare "No matching places found" (review #6). Legacy `goo.gl/maps`
 * links that are still active do resolve in a browser, so pasting the page's full URL is the way
 * through, which is what the refusal says.
 */
const SHORT = /maps\.app\.goo\.gl/
/** A Google Maps or Google-shortener URL, whatever country domain it uses. */
const MAPS_LIKE = /^https?:\/\/(?:[\w-]+\.)*(?:google\.[a-z.]+\/maps|goo\.gl\/)/i

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
  // A Maps URL we got this far without parsing is one we cannot use: a legacy `goo.gl` link, a
  // search URL, a `?q=` query. Saying so beats searching for its text and finding nothing.
  if (MAPS_LIKE.test(text)) return { kind: 'unsupported' }
  return { kind: 'none' }
}
