import { allRestaurants, updateRestaurant, type RestaurantPatch } from '../data/restaurants'
import { resolveShortLink } from '../sync/pocketbase'
import { nextRetryDelayMs } from '../sync/backoff'
import { reverseGeocode } from './geocode'

let inFlight = false

/**
 * Per-record retry-backoff state, keyed by restaurant id. In-memory only: a page reload
 * naturally resets the window, and provisional records already retry on every startup, so
 * nothing needs to persist. Entries are removed once a record resolves.
 */
const retryState = new Map<string, { attempt: number; nextAttemptAt: number }>()

/**
 * Retry provisional records — those saved from a short link that couldn't resolve yet (offline,
 * or a transient hook failure). For each, re-resolve the link, fill coordinates + a reverse-geocoded
 * address, and clear `pending`. Records that still fail stay provisional and are retried on a later
 * trigger (startup / reconnect), gated by a capped exponential backoff (`nextRetryDelayMs`) per record
 * so a permanently-bad link isn't re-attempted on every reconnect. Returns the number resolved.
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
      const state = retryState.get(r.id)
      if (state && Date.now() < state.nextAttemptAt) continue
      try {
        const { lat, lng, name } = await resolveShortLink(url)
        const address = await reverseGeocode(lat, lng).catch(() => undefined)
        const patch: RestaurantPatch = { lat, lng, pending: false }
        if (address) patch.address = address
        // Replace the raw-link placeholder name only if it was never given a real one.
        if (name && r.name === url) patch.name = name
        await updateRestaurant(r.id, patch)
        retryState.delete(r.id)
        resolved++
      } catch {
        // Still unresolvable — leave provisional; a later startup/reconnect retries, gated by backoff.
        const attempt = (state?.attempt ?? 0) + 1
        retryState.set(r.id, { attempt, nextAttemptAt: Date.now() + nextRetryDelayMs(attempt) })
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
