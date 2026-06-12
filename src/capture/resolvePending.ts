import { allRestaurants, updateRestaurant, type RestaurantPatch } from '../data/restaurants'
import { resolveShortLink } from '../sync/pocketbase'
import { reverseGeocode } from './geocode'

let inFlight = false

/**
 * Retry provisional records — those saved from a short link that couldn't resolve yet (offline,
 * or a transient hook failure). For each, re-resolve the link, fill coordinates + a reverse-geocoded
 * address, and clear `pending`. Records that still fail stay provisional and are retried on the next
 * trigger (startup / reconnect). Returns the number resolved.
 *
 * A persisted per-record retry cap is deferred (plan open question, R7); an in-flight guard prevents
 * overlapping passes, and triggers fire infrequently, so a permanently-bad link is retried rarely.
 */
export async function resolvePendingRestaurants(): Promise<number> {
  if (inFlight || !navigator.onLine) return 0
  inFlight = true
  try {
    const pending = (await allRestaurants()).filter((r) => r.pending && r.mapsUrl)
    let resolved = 0
    for (const r of pending) {
      const url = r.mapsUrl
      if (!url) continue
      try {
        const { lat, lng, name } = await resolveShortLink(url)
        const address = await reverseGeocode(lat, lng).catch(() => undefined)
        const patch: RestaurantPatch = { lat, lng, pending: false }
        if (address) patch.address = address
        // Replace the raw-link placeholder name only if it was never given a real one.
        if (name && r.name === url) patch.name = name
        await updateRestaurant(r.id, patch)
        resolved++
      } catch {
        // Still unresolvable — leave provisional; a later startup/reconnect retries.
      }
    }
    return resolved
  } finally {
    inFlight = false
  }
}

/** Run the resolver now and on every reconnect. Returns an unsubscribe fn. Independent of sign-in. */
export function startPendingResolver(): () => void {
  void resolvePendingRestaurants().catch(() => {})
  const onOnline = () => void resolvePendingRestaurants().catch(() => {})
  window.addEventListener('online', onOnline)
  return () => window.removeEventListener('online', onOnline)
}
