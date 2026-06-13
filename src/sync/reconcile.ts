import type { SyncFields } from '../types/models'

/** Last-write-wins winner of two versions of one record. Newer `updated` wins; tie keeps local. */
export function pickWinner<T extends SyncFields>(local: T | undefined, remote: T | undefined): T | undefined {
  if (!local) return remote
  if (!remote) return local
  return remote.updated > local.updated ? remote : local
}

export interface ReconcileResult<T> {
  /** The unioned record set after LWW. */
  merged: T[]
  /** Remote winners that must be written into the local store. */
  toWriteLocal: T[]
  /** Local winners that must be pushed to the remote. */
  toPush: T[]
}

/**
 * Union two record sets by stable id under last-write-wins. Tombstones participate
 * like any record, so a newer delete propagates instead of resurrecting.
 */
export function reconcile<T extends SyncFields>(local: T[], remote: T[]): ReconcileResult<T> {
  const pairs = new Map<string, { local?: T; remote?: T }>()
  for (const r of local) pairs.set(r.id, { ...pairs.get(r.id), local: r })
  for (const r of remote) pairs.set(r.id, { ...pairs.get(r.id), remote: r })

  const merged: T[] = []
  const toWriteLocal: T[] = []
  const toPush: T[] = []

  for (const { local: l, remote: rem } of pairs.values()) {
    const winner = pickWinner(l, rem)!
    merged.push(winner)
    if (l?.updated === rem?.updated) continue // both present and equal → no-op
    if (winner === rem) toWriteLocal.push(winner)
    else toPush.push(winner)
  }

  return { merged, toWriteLocal, toPush }
}
