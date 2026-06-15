import type { SyncState } from '../sync/syncEngine'

interface Props {
  state: SyncState | null
}

function toLabel(state: SyncState): string {
  switch (state.status) {
    case 'synced': return 'All synced'
    case 'pending': return `${state.pending} pending`
    case 'offline': return 'Offline'
    case 'problem':
      return state.cause === 'auth' ? 'Sign in again to keep syncing' : "Can't reach the cloud"
  }
}

function toClass(state: SyncState): string {
  switch (state.status) {
    case 'synced': return 'text-green-600'
    case 'pending': return 'text-amber-600'
    case 'offline': return 'text-gray-400'
    case 'problem': return 'text-red-600'
  }
}

export function SyncStatusIndicator({ state }: Props) {
  if (!state) return null
  return (
    <span className={`text-xs ${toClass(state)}`} aria-live="polite">
      {toLabel(state)}
    </span>
  )
}
