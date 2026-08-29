import { useState } from 'react'
import { useAuth } from '../../auth/useAuth'
import { useSyncStatus } from '../../sync/useSyncStatus'
import type { SyncStatus } from '../../sync/syncStatus'

/** Short label for the header-level indicator (R1). */
function label(status: SyncStatus): string {
  switch (status.state) {
    case 'synced':
      return 'All synced'
    case 'pending':
      return `${status.pendingCount} pending`
    case 'offline':
      return status.pendingCount > 0 ? `Offline — ${status.pendingCount} pending` : 'Offline'
    case 'problem':
      return status.cause === 'sign-in-needed' ? 'Sign in again to keep backing up' : "Can't reach the server"
  }
}

/** Plain-text elaboration shown in the tap-to-expand detail view. Never wired to any action. */
function detail(status: SyncStatus): string {
  switch (status.state) {
    case 'synced':
      return "Everything you've saved is backed up."
    case 'pending': {
      const noun = status.pendingCount === 1 ? 'item hasn\'t' : 'items haven\'t'
      return `${status.pendingCount} ${noun} backed up yet. They'll sync automatically.`
    }
    case 'offline':
      return "You're offline. Changes are saved on this device and will sync when you're back online."
    case 'problem':
      return status.cause === 'sign-in-needed'
        ? 'Your sign-in expired. Sign in again from the header to resume backing up.'
        : "We can't reach the server right now. We'll keep trying in the background."
  }
}

/** Text color for the label, per state — `'problem'` reads visually distinct from R8. */
function labelClassName(state: SyncStatus['state']): string {
  const base = 'font-medium'
  return state === 'problem' ? `${base} text-red-600` : `${base} text-gray-500`
}

/**
 * The one global sync-status indicator (R1, R3): all synced / N pending / offline / problem.
 * Shown only when signed in (KTD5) — a local-only user has nothing being backed up. Tapping
 * toggles a plain-text detail view; it is never a retry trigger and calls no sync function.
 */
export function SyncStatusIndicator() {
  const { signedIn } = useAuth()
  const status = useSyncStatus()
  const [expanded, setExpanded] = useState(false)

  if (!signedIn) return null

  return (
    <div role="region" aria-live="polite" aria-label="Sync status" className="text-sm">
      <button type="button" onClick={() => setExpanded((v) => !v)} className={labelClassName(status.state)}>
        {label(status)}
      </button>
      {expanded && <p className="mt-1 max-w-xs text-xs text-gray-500">{detail(status)}</p>}
    </div>
  )
}
