import { getDB } from './db'
import { mutateRestaurant } from './restaurants'
import { rollupOf } from './visitOrder'
import type { Restaurant } from '../types/models'

/**
 * Recompute and persist a restaurant's denormalized rollup from its visits, through the shared
 * `mutateRestaurant` read-modify-write (single transaction, so this can't race an independent
 * writer touching the same record — e.g. a note/cuisine blur-save). No `updated` bump — the
 * rollup is a local cache each device derives, never the sync source of truth. `emit: 'none'`:
 * callers (visit create/update/remove, and the sync engine's post-pull loop) already fire their
 * own change event around this call; emitting here too would double-fire, and inside a sync pull
 * would wrongly leak a local-change signal that re-triggers the push debounce.
 */
export async function recomputeRollup(restaurantId: string): Promise<Restaurant | undefined> {
  const db = await getDB()
  const visits = await db.getAllFromIndex('visits', 'by-restaurant', restaurantId)
  return mutateRestaurant(
    restaurantId,
    (restaurant) => (restaurant ? { ...restaurant, ...rollupOf(visits) } : undefined),
    'none',
  )
}
