import { getDB } from './db'

/**
 * Count of records (restaurants + visits) with needsPush=true — i.e. local state ahead of
 * the cloud. Counts only live records: tombstones with needsPush=true are counted too (a
 * soft-delete must propagate), but records that are already pushed (needsPush=false) are not.
 * Derived entirely from the local store — offline-correct and reload-proof.
 */
export async function pendingCount(): Promise<number> {
  const db = await getDB()
  const [restaurants, visits] = await Promise.all([
    db.getAll('restaurants'),
    db.getAll('visits'),
  ])
  let count = 0
  for (const r of restaurants) if (r.needsPush) count++
  for (const v of visits) if (v.needsPush) count++
  return count
}
