import { useState } from 'react'
import { isOsmDismissed, dismissOsm } from './osmDismissals'
import { suggestCategory } from '../facets/osmCategory'
import { lookupOsm, matchNear, type GeoCandidate } from '../../capture/geocode'
import { updateRestaurant, type RestaurantPatch } from '../../data/restaurants'
import { hasResolvedCoordinates, type Restaurant } from '../../types/models'

export type EnrichState =
  | { kind: 'idle' }
  | { kind: 'busy' }
  | { kind: 'proposal'; candidate: GeoCandidate }
  | { kind: 'not-found' }
  /** OSM could not be asked (network, Nominatim). */
  | { kind: 'failed' }
  /** Refresh found the object deleted from OSM; the old snapshot stays. */
  | { kind: 'gone' }
  /** The local write was rejected. */
  | { kind: 'save-failed' }

/** "Complete from OpenStreetMap" and "Refresh" for one place. Every outcome reaches the user. */
export function useOsmEnrichment(restaurant: Restaurant) {
  const [state, setState] = useState<EnrichState>({ kind: 'idle' })
  const [dismissed, setDismissed] = useState(() => isOsmDismissed(restaurant.id))
  const canComplete = !restaurant.osm && hasResolvedCoordinates(restaurant) && !dismissed

  async function write(patch: RestaurantPatch) {
    try {
      await updateRestaurant(restaurant.id, patch)
      setState({ kind: 'idle' })
    } catch {
      setState({ kind: 'save-failed' })
    }
  }

  async function complete() {
    if (!hasResolvedCoordinates(restaurant)) return
    setState({ kind: 'busy' })
    try {
      const candidate = await matchNear(restaurant.name, restaurant.lat, restaurant.lng)
      setState(candidate ? { kind: 'proposal', candidate } : { kind: 'not-found' })
    } catch {
      setState({ kind: 'failed' })
    }
  }

  // Busy is set before the write starts (not just inside `write`), so a second click while the
  // request is in flight can't fire: the proposal card (Confirm/Reject) only renders in the
  // 'proposal' state, and this synchronously replaces it before any await.
  async function confirm() {
    if (state.kind !== 'proposal' || !state.candidate.osm) return
    const { candidate } = state
    const patch: RestaurantPatch = { osm: candidate.osm }
    // Only an uncategorized place takes OSM's category: the category is the user's.
    const suggestion = suggestCategory(candidate)
    if (!restaurant.cuisine && suggestion) patch.cuisine = suggestion
    setState({ kind: 'busy' })
    await write(patch)
  }

  function reject() {
    dismissOsm(restaurant.id)
    setDismissed(true)
    setState({ kind: 'idle' })
  }

  async function refresh() {
    const osm = restaurant.osm
    if (!osm) return
    setState({ kind: 'busy' })
    let fresh: GeoCandidate | null
    try {
      fresh = await lookupOsm(osm.type, osm.id)
    } catch {
      setState({ kind: 'failed' })
      return
    }
    if (!fresh?.osm) setState({ kind: 'gone' })
    else await write({ osm: fresh.osm })
  }

  return { state, canComplete, complete, confirm, reject, refresh }
}
