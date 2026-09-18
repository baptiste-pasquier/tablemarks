import { parseMapsUrl } from './parseMapsUrl'
import { reverseGeocode, type GeoCandidate } from './geocode'
import { findNearMatch } from './dedup'
import { UnresolvableShortLink, resolveShortLink } from '../sync/pocketbase'
import { getBackendStatus } from '../sync/backendStatus'
import { allRestaurants, createRestaurant } from '../data/restaurants'
import type { Restaurant } from '../types/models'

export type CaptureResult =
  | { status: 'created'; restaurant: Restaurant }
  | { status: 'provisional'; restaurant: Restaurant }
  | { status: 'duplicate'; match: Restaurant }
  | { status: 'needs-search'; query: string }
  /**
   * A short link was pasted and no backend can resolve it (R5). A result variant rather than a
   * throw (KTD6): the caller's catch-all is the generic "could not add" message, and the caller
   * owns the copy that explains this one.
   *
   * `reason` is the difference between the two ways there is no backend, and the copy must not
   * blur them. `absent` is permanent — this deployment ships without one, so the message may say
   * so and send the user to the alternatives for good. `unavailable` means the address could not
   * be read: a deployment that does have a server, whose header is already saying it is
   * unreachable. Telling that user the app "runs without a server" contradicts what is on screen
   * a few centimetres away, and sends them away from something that will work again.
   */
  | { status: 'needs-backend'; link: string; reason: 'absent' | 'unavailable' }
  /**
   * The backend was reachable and refused the link on its merits — an unsupported host, or a
   * target that turned out not to be a Maps place. Distinct from `provisional` because retrying
   * cannot help: saving one anyway leaves a placeholder named by the raw URL that never resolves.
   */
  | { status: 'link-unresolvable'; link: string }

interface ResolvedPlace {
  lat: number
  lng: number
  name?: string
  mapsUrl?: string
}

async function finalize(place: ResolvedPlace): Promise<CaptureResult> {
  const existing = await allRestaurants()
  const match = findNearMatch({ lat: place.lat, lng: place.lng, mapsUrl: place.mapsUrl }, existing)
  if (match) return { status: 'duplicate', match }

  const address = await reverseGeocode(place.lat, place.lng).catch(() => undefined)
  const restaurant = await createRestaurant({
    name: place.name ?? address?.split(',')[0] ?? 'New place',
    lat: place.lat,
    lng: place.lng,
    address,
    mapsUrl: place.mapsUrl,
  })
  return { status: 'created', restaurant }
}

/** Capture from pasted text: full URL parses locally, short links resolve server-side (provisional if offline, refused with no backend), plain text routes to search. */
export async function capturePaste(input: string): Promise<CaptureResult> {
  const text = input.trim()
  const parsed = parseMapsUrl(text)

  if (parsed.kind === 'none') return { status: 'needs-search', query: text }

  // A Google Maps URL with nothing this app can use in it — a legacy `goo.gl` link, a search URL.
  // Refusing it names the two ways through; sending it to name search searched for the URL text
  // and found nothing, which told the user only that their place does not exist (review #6).
  if (parsed.kind === 'unsupported') return { status: 'link-unresolvable', link: text }

  if (parsed.kind === 'short') {
    // Presence is read before the attempt, never from its catch. A *configured* backend that is
    // merely down must still fall through to the provisional record below — a transient outage is
    // exactly what that record exists for. Both `absent` and `unavailable` refuse instead: neither
    // has an address to call, so a provisional record would sit there forever unresolved (the
    // pending resolver only runs when a backend is configured, see `sync/bootstrap.ts`).
    const presence = getBackendStatus().presence.status
    if (presence !== 'configured') {
      return { status: 'needs-backend', link: text, reason: presence }
    }

    try {
      const resolved = await resolveShortLink(text)
      return finalize({ lat: resolved.lat, lng: resolved.lng, name: resolved.name, mapsUrl: text })
    } catch (err) {
      // A verdict on this URL, not a failure to reach the server: nothing about it will change, so
      // say so now rather than saving a record that is retried forever and resolves never.
      if (err instanceof UnresolvableShortLink) return { status: 'link-unresolvable', link: text }
      // Offline, or the server did not answer: save a provisional record; it resolves when
      // connectivity returns.
      const restaurant = await createRestaurant({ name: text, mapsUrl: text, pending: true })
      return { status: 'provisional', restaurant }
    }
  }

  return finalize({ lat: parsed.lat, lng: parsed.lng, name: parsed.name, mapsUrl: text })
}

/** Capture from a chosen geocoding-search candidate. */
export async function captureSearchPick(candidate: GeoCandidate): Promise<CaptureResult> {
  return finalize({
    lat: candidate.lat,
    lng: candidate.lng,
    name: candidate.name,
    mapsUrl: undefined,
  })
}
