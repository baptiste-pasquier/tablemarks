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

/** Pill styling for the label, per state — `'problem'` reads visually distinct from R8. */
function labelClassName(state: SyncStatus['state']): string {
  const base = 'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold shadow-sm transition'
  switch (state) {
    case 'synced':
      return `${base} bg-gray-100 text-gray-600`
    case 'pending':
      return `${base} bg-brand-soft text-brand-strong`
    case 'offline':
      return `${base} bg-gray-200 text-gray-700`
    case 'problem':
      return `${base} bg-red-50 text-red-700 ring-1 ring-red-200`
  }
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
      {expanded && (
        <p className="mt-1 max-w-xs rounded-lg bg-gray-50 p-2 text-xs text-gray-500 shadow-sm">{detail(status)}</p>
      )}
    </div>
  )
}
