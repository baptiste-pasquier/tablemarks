import { useSyncExternalStore } from 'react'
import { getBackendStatus, onBackendStatusChange } from './backendStatus'
import type { BackendStatus } from './backendStatus'

/**
 * Reactive view of the backend-availability store (`backendStatus.ts`), mirroring `useSyncStatus`'s
 * shape (which in turn mirrors `useAuth`'s).
 *
 * No `useMemo` here, and none needed: the store replaces its snapshot object only when a field
 * actually changes, so the returned value is already referentially stable across renders. That
 * stability is load-bearing — `useSyncExternalStore` requires a cached snapshot, and a fresh
 * identity per render feeding a consumer's effect dependency is the silent hang documented in
 * `docs/journal/solutions/conventions/react-leaflet-test-mock-stability.md`.
 */
export function useBackendStatus(): BackendStatus {
  return useSyncExternalStore(onBackendStatusChange, getBackendStatus)
}
