import { allRestaurantsForSync } from './restaurants'
import { allVisitsForSync } from './visits'
import type { SyncFields } from '../types/models'

/**
 * A record is pending push to the cloud unless it has been explicitly marked synced. Absent
 * (`undefined`) reads as pending — legacy records, imports, and never-stamped rows all default to
 * pending and re-push idempotently under last-write-wins.
 */
export function isPendingPush(record: Pick<SyncFields, 'needsPush'>): boolean {
  return record.needsPush !== false
}

/**
 * Count of records not yet confirmed pushed — restaurants and visits, including tombstones (an
 * unpushed delete is unsynced). Derived from the local store alone, so it is correct offline and
 * survives reloads.
 */
export async function pendingCount(): Promise<number> {
  const [restaurants, visits] = await Promise.all([allRestaurantsForSync(), allVisitsForSync()])
  return restaurants.filter(isPendingPush).length + visits.filter(isPendingPush).length
}
