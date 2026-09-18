/**
 * Subscribable sync-status store (KTD4): the one place the app reads to answer "is everything
 * backed up?" `state` distinguishes offline / synced / pending / problem, `pendingCount` is how
 * many local records still differ from what was last pushed, and `cause` names the likely
 * problem once escalated to `'problem'`. `SyncController` (`syncEngine.ts`) is this store's only
 * writer of `state`/`cause` via `setSyncState` — with one deliberate exception, the composition
 * root (`bootstrap.ts`), which reports `problem`/`server-unreachable` when it resolves a presence
 * of `unavailable` and therefore starts no controller at all. Without that second writer the
 * initial `synced` would stand unchallenged for the life of the tab, which is the app's one false
 * backup claim.
 *
 * `pendingCount` also self-corrects independently of any sync attempt: this module subscribes to
 * `onStoreChange` (`src/data/events.ts`) and recomputes on every local write. That is necessary
 * because a sync attempt that changes nothing locally (e.g. going from 1 pending to 0 purely via
 * a push, with no write-back) never fires `onStoreChange` itself — so this store needs its own
 * separate change emitter (below), mirroring the `onLocalChange`/`onStoreChange` pattern rather
 * than reusing it.
 */
import { allRestaurantsForSync } from '../data/restaurants'
import { allVisitsForSync } from '../data/visits'
import { onStoreChange } from '../data/events'
import type { FailureCause } from './backoff'

export type SyncState = 'offline' | 'synced' | 'pending' | 'problem'

export interface SyncStatus {
  state: SyncState
  pendingCount: number
  cause?: FailureCause
}

type Listener = () => void
const listeners = new Set<Listener>()

let current: SyncStatus = { state: 'synced', pendingCount: 0 }

function emit(): void {
  for (const fn of listeners) fn()
}

/** Current sync status snapshot. */
export function getSyncStatus(): SyncStatus {
  return current
}

/** Subscribe to sync status changes. Returns an unsubscribe function. */
export function onSyncStatusChange(fn: Listener): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

/** A record is pending whenever its local `syncedUpdated` marker hasn't caught up to `updated`. */
function isPending(record: { updated: string; syncedUpdated?: string }): boolean {
  return record.syncedUpdated !== record.updated
}

/**
 * Recomputes `pendingCount` from IndexedDB (restaurants + visits, tombstones included — a
 * not-yet-synced deletion is still genuinely pending). Updates the store and notifies
 * subscribers regardless of whether the count changed.
 */
export async function recomputePending(): Promise<number> {
  const [restaurants, visits] = await Promise.all([allRestaurantsForSync(), allVisitsForSync()])
  const pendingCount = restaurants.filter(isPending).length + visits.filter(isPending).length
  if (pendingCount !== current.pendingCount) {
    current = { ...current, pendingCount }
    emit()
  }
  return pendingCount
}

/**
 * Sets `state` (and `cause`, kept only for `'problem'` — cleared on any other transition).
 * Used by `SyncController` to report the outcome of each sync attempt.
 */
export function setSyncState(state: SyncState, cause?: FailureCause): void {
  const nextCause = state === 'problem' ? cause : undefined
  if (state === current.state && nextCause === current.cause) return
  current = { ...current, state, cause: nextCause }
  emit()
}

// Pending count self-corrects on every store write (user-driven or sync-pulled), independent of
// whether a sync attempt is running — see module doc comment above.
onStoreChange(() => {
  void recomputePending()
})
