import { parseMapsUrl } from './parseMapsUrl'
import { matchNear, reverseGeocode, type GeoCandidate } from './geocode'
import { findNearMatch } from './dedup'
import { UnresolvableShortLink, resolveShortLink } from '../sync/pocketbase'
import { getBackendStatus } from '../sync/backendStatus'
import { allRestaurants, createRestaurant } from '../data/restaurants'
import type { Restaurant } from '../types/models'

/** A place identified but not saved yet: what the add form previews before "Add". */
export interface PlaceDraft {
  name: string
  lat: number | null
  lng: number | null
  address?: string
  mapsUrl?: string
  /** Awaiting coordinate resolution: a short link pasted while the server could not answer. */
  pending: boolean
  /** The OpenStreetMap object this place is matched to, kept unless the user refuses it. */
  match?: GeoCandidate
  /** The match request failed (network, Nominatim), as opposed to finding nothing. */
  matchFailed?: boolean
}

export type CaptureResult =
  | { status: 'preview'; draft: PlaceDraft }
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

export type CommitResult =
  | { status: 'created'; restaurant: Restaurant }
  | { status: 'duplicate'; match: Restaurant }

interface ResolvedPlace {
  lat: number
  lng: number
  name?: string
  mapsUrl?: string
}

async function preview(place: ResolvedPlace): Promise<CaptureResult> {
  const existing = await allRestaurants()
  const near = findNearMatch({ lat: place.lat, lng: place.lng, mapsUrl: place.mapsUrl }, existing)
  if (near) return { status: 'duplicate', match: near }

  let match: GeoCandidate | undefined
  let matchFailed = false
  if (place.name) {
    try {
      match = (await matchNear(place.name, place.lat, place.lng)) ?? undefined
    } catch {
      matchFailed = true
    }
  }
  const sameObject =
    match?.osm && findNearMatch({ lat: place.lat, lng: place.lng, osm: match.osm }, existing)
  if (sameObject) return { status: 'duplicate', match: sameObject }

  // OSM's address when matched; otherwise the reverse geocode the app always used.
  const address = match
    ? match.address
    : await reverseGeocode(place.lat, place.lng).catch(() => undefined)
  const draft: PlaceDraft = {
    name: place.name ?? address?.split(',')[0] ?? 'New place',
    lat: place.lat,
    lng: place.lng,
    address,
    mapsUrl: place.mapsUrl,
    pending: false,
    match,
    matchFailed,
  }
  return { status: 'preview', draft }
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
      return preview({ lat: resolved.lat, lng: resolved.lng, name: resolved.name, mapsUrl: text })
    } catch (err) {
      // A verdict on this URL, not a failure to reach the server: nothing about it will change, so
      // say so now rather than saving a record that is retried forever and resolves never.
      if (err instanceof UnresolvableShortLink) return { status: 'link-unresolvable', link: text }
      // Offline, or the server did not answer: preview a provisional record; "Add" saves it and it
      // resolves when connectivity returns. It is never matched to OSM later — that would be a
      // silent match; the user completes it from its detail.
      return {
        status: 'preview',
        draft: { name: text, lat: null, lng: null, mapsUrl: text, pending: true },
      }
    }
  }

  return preview({ lat: parsed.lat, lng: parsed.lng, name: parsed.name, mapsUrl: text })
}

/** The draft for a picked search result: its OSM object comes along when it has one. */
export function draftFromCandidate(candidate: GeoCandidate): PlaceDraft {
  return {
    name: candidate.name,
    lat: candidate.lat,
    lng: candidate.lng,
    address: candidate.address,
    pending: false,
    match: candidate.osm ? candidate : undefined,
  }
}

/** "Not this one": drop the match and the address that came with it; commit reverse-geocodes. */
export function withoutMatch(draft: PlaceDraft): PlaceDraft {
  return { ...draft, match: undefined, address: undefined, matchFailed: false }
}

/**
 * Save a previewed place with the form's category. Duplicates are checked again: a search pick
 * reaches here without a preview, and another device may have synced the place meanwhile.
 */
export async function commitCapture(draft: PlaceDraft, cuisine?: string): Promise<CommitResult> {
  if (draft.pending || draft.lat === null || draft.lng === null) {
    const restaurant = await createRestaurant({
      name: draft.name,
      mapsUrl: draft.mapsUrl,
      pending: true,
      cuisine,
    })
    return { status: 'created', restaurant }
  }
  const { lat, lng } = draft
  const osm = draft.match?.osm
  const match = findNearMatch({ lat, lng, mapsUrl: draft.mapsUrl, osm }, await allRestaurants())
  if (match) return { status: 'duplicate', match }
  const address = draft.address ?? (await reverseGeocode(lat, lng).catch(() => undefined))
  const restaurant = await createRestaurant({
    name: draft.name,
    lat,
    lng,
    address,
    mapsUrl: draft.mapsUrl,
    cuisine,
    osm,
  })
  return { status: 'created', restaurant }
}
