import { useSyncExternalStore } from 'react'
import { auth } from '../auth/auth'
import type { SyncState } from './syncEngine'

export function useSyncStatus(): SyncState | null {
  return useSyncExternalStore(
    (cb) => auth.onSyncStateChange(cb),
    () => auth.getSyncState(),
  )
}
