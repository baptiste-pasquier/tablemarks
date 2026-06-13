import { useAuth } from '../auth/useAuth'
import { useSyncStatus } from '../auth/useSyncStatus'
import type { SyncState } from '../sync/syncStatus'

function label(state: SyncState): string {
  switch (state.status) {
    case 'synced':
      return 'All synced'
    case 'pending':
      return `${state.pending} pending`
    case 'offline':
      return 'Offline'
    case 'problem':
      return state.cause === 'auth' ? 'Sign in again to keep syncing' : "Can't reach the cloud"
  }
}

const TONE: Record<SyncState['status'], string> = {
  synced: 'text-gray-500',
  pending: 'text-amber-600',
  offline: 'text-gray-400',
  problem: 'text-red-600 font-medium',
}

/**
 * The single global backup-status indicator (R7). Informational only — no manual sync control
 * (deferred). Hidden when signed out, since it reports a signed-in user's cloud backup state.
 */
export function SyncStatusIndicator() {
  const { signedIn } = useAuth()
  const state = useSyncStatus()
  if (!signedIn) return null

  return (
    <span role="status" aria-live="polite" className={`text-xs ${TONE[state.status]}`}>
      {label(state)}
    </span>
  )
}
