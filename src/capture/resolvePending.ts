import { allRestaurants, updateRestaurant, type RestaurantPatch } from '../data/restaurants'
import { UnresolvableShortLink, pb, resolveShortLink } from '../sync/pocketbase'
import { nextRetryDelayMs } from '../sync/backoff'
import { isOnline, onOnlineChange } from '../sync/onlineStatus'
import { reverseGeocode } from './geocode'

let inFlight = false

/**
 * Per-record retry-backoff state, keyed by restaurant id. In-memory only: a page reload
 * naturally resets the window, and provisional records already retry on every startup, so
 * nothing needs to persist. Entries are removed once a record resolves.
 */
const retryState = new Map<string, { attempt: number; nextAttemptAt: number }>()

/**
 * Records the resolver has refused on their merits. Not a backoff — a backoff says "later"; this
 * says "never, until something outside this tab changes". Cleared by a reload, like `retryState`.
 */
const giveUp = new Set<string>()

/**
 * Retry provisional records — those saved from a short link that couldn't resolve yet (offline,
 * or a transient hook failure). For each, re-resolve the link, fill coordinates + a reverse-geocoded
 * address, and clear `pending`. Records that still fail stay provisional and are retried on a later
 * trigger (startup / reconnect), gated by a capped exponential backoff (`nextRetryDelayMs`) per record
 * so a permanently-bad link isn't re-attempted on every reconnect. Returns the number resolved.
 */
export async function resolvePendingRestaurants(): Promise<number> {
  if (inFlight || !isOnline()) return 0
  inFlight = true
  try {
    const pending = (await allRestaurants()).filter((r) => r.pending && r.mapsUrl)
    let resolved = 0
    for (const r of pending) {
      const url = r.mapsUrl
      if (!url) continue
      if (giveUp.has(r.id)) continue
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
      } catch (err) {
        if (err instanceof UnresolvableShortLink) {
          // The resolver ruled on this URL. Retrying it on every reconnect and sign-in for the
          // life of the tab spends requests to be told the same thing. In-memory only, like the
          // rest of this map, so a reload asks once more — persisting a verdict would be a
          // data-model change, and the record stays visibly provisional either way.
          giveUp.add(r.id)
          continue
        }
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

/**
 * Run the resolver now, on every reconnect, and whenever the sign-in state changes. Returns an
 * unsubscribe fn.
 *
 * Sign-in is a trigger because the resolver hook requires authentication
 * (`pocketbase/pb_hooks/resolveShortLink.pb.js`): a link pasted while signed out is refused and
 * saved provisional, and without this the record would sit unresolved until the next reload even
 * though signing in is exactly what unblocks it.
 */
export function startPendingResolver(): () => void {
  const run = () => {
    if (isOnline()) void resolvePendingRestaurants().catch(() => {})
  }
  run()
  const stopOnline = onOnlineChange(run)
  // `false` — do not fire on subscribe; `run()` above already covers the initial pass.
  const stopAuth = pb.authStore.onChange(() => {
    // Clear the backoff first, unlike the reconnect trigger. Reconnecting says the network is back,
    // which tells us nothing about a link that may simply be bad — so those records keep waiting
    // out their delay. A sign-in change removes the one failure cause the resolver cannot retry its
    // way out of, so the delay it earned no longer applies; without this the user waits out a 5s
    // window after signing in and the trigger buys nothing.
    retryState.clear()
    giveUp.clear()
    run()
  }, false)
  return () => {
    stopOnline()
    stopAuth()
  }
}
