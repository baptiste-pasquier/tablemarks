import { getDB } from './db'
import { mutateRestaurant } from './restaurants'
import type { Restaurant, Verdict, Visit } from '../types/models'

export interface Rollup {
  latestVerdict: Verdict | null
  latestVisitDate: string | null
  visitCount: number
}

/** Pure rollup: latest-by-date visit's verdict + count, over non-deleted visits. */
export function rollupOf(visits: Visit[]): Rollup {
  const live = visits.filter((v) => !v.deleted)
  if (live.length === 0) {
    return { latestVerdict: null, latestVisitDate: null, visitCount: 0 }
  }
  const latest = live.reduce((a, b) => (b.date > a.date ? b : a))
  return {
    latestVerdict: latest.verdict,
    latestVisitDate: latest.date,
    visitCount: live.length,
  }
}

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
