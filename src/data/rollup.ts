import { getDB } from './db'
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
 * Recompute and persist a restaurant's denormalized rollup from its visits.
 * Writes directly (no `updated` bump) — the rollup is a local cache each device
 * derives, never the sync source of truth.
 */
export async function recomputeRollup(restaurantId: string): Promise<Restaurant | undefined> {
  const db = await getDB()
  const restaurant = await db.get('restaurants', restaurantId)
  if (!restaurant) return undefined
  const visits = await db.getAllFromIndex('visits', 'by-restaurant', restaurantId)
  const next: Restaurant = { ...restaurant, ...rollupOf(visits) }
  await db.put('restaurants', next)
  return next
}
