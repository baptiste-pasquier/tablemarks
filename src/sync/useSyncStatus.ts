import { useSyncExternalStore } from 'react'
import { getSyncStatus, onSyncStatusChange } from './syncStatus'
import type { SyncStatus } from './syncStatus'

/** Reactive view of the sync-status store (`syncStatus.ts`), mirroring `useAuth`'s shape. */
export function useSyncStatus(): SyncStatus {
  return useSyncExternalStore(onSyncStatusChange, getSyncStatus)
}
