import { allRestaurantsForSync, putRestaurantRaw } from '../../data/restaurants'
import { allVisitsForSync, putVisitRaw } from '../../data/visits'
import { recomputeRollup } from '../../data/rollup'
import { emitStoreChange } from '../../data/events'
import { reconcile } from '../reconcile'
import { validateEnvelope, type ImportRecords, type ValidationResult } from './schema'

/**
 * Parse untrusted file text into validated, current-shape records, or a structured error.
 * Never throws and never touches the store — validate-then-commit: the caller only writes
 * once this returns `ok: true`.
 */
export function parseImport(text: string): ValidationResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return { ok: false, error: 'File is not valid JSON.' }
  }
  return validateEnvelope(parsed)
}

export interface ImportCounts {
  /** Records written that did not exist locally. */
  added: number
  /** Records written that overwrote an older local version (last-write-wins). */
  updated: number
  /** Records that produced no write (equal, or the local copy won). */
  unchanged: number
}

/**
 * Merge validated records into the store, non-destructively and idempotently, by feeding them
 * through the same reconcile/LWW path sign-in uses (file = remote side, store = local). Writes
 * remote winners via the raw helpers, recomputes rollups for restaurants whose visits changed,
 * and emits a single store-change. Uses store-change (pull) semantics — import is not a user edit
 * to push; cloud convergence happens on the next sync cycle.
 */
export async function applyImport(records: ImportRecords): Promise<ImportCounts> {
  const localR = await allRestaurantsForSync()
  const localRIds = new Set(localR.map((r) => r.id))
  const r = reconcile(localR, records.restaurants)

  const localV = await allVisitsForSync()
  const localVIds = new Set(localV.map((v) => v.id))
  const v = reconcile(localV, records.visits)

  for (const rec of r.toWriteLocal) await putRestaurantRaw(rec)

  const affected = new Set<string>()
  for (const rec of v.toWriteLocal) {
    await putVisitRaw(rec)
    affected.add(rec.restaurantId)
  }
  for (const restaurantId of affected) await recomputeRollup(restaurantId)

  if (r.toWriteLocal.length > 0 || v.toWriteLocal.length > 0) emitStoreChange()

  const writes = [...r.toWriteLocal, ...v.toWriteLocal]
  const knownIds = (id: string) => localRIds.has(id) || localVIds.has(id)
  const added = writes.filter((rec) => !knownIds(rec.id)).length
  const total = records.restaurants.length + records.visits.length
  return { added, updated: writes.length - added, unchanged: total - writes.length }
}
