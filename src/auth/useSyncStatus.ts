import { useSyncExternalStore } from 'react'
import { auth } from './auth'
import type { SyncState } from '../sync/syncStatus'

/** Live backup/sync indicator state, read-only from the SyncController via the auth singleton. */
export function useSyncStatus(): SyncState {
  return useSyncExternalStore(
    (cb) => auth.onSyncStateChange(cb),
    () => auth.syncState,
  )
}
