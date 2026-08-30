import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import i18n from '../../i18n/config'
import { useAuth } from '../../auth/useAuth'
import { useSyncStatus } from '../../sync/useSyncStatus'
import type { SyncStatus } from '../../sync/syncStatus'

/** Short label for the header-level indicator (R1). */
function label(status: SyncStatus): string {
  switch (status.state) {
    case 'synced':
      return i18n.t('sync.allSynced')
    case 'pending':
      return i18n.t('sync.pendingCount', { count: status.pendingCount })
    case 'offline':
      return status.pendingCount > 0
        ? i18n.t('sync.offlinePending', { count: status.pendingCount })
        : i18n.t('sync.offline')
    case 'problem':
      return status.cause === 'sign-in-needed' ? i18n.t('sync.problemSignIn') : i18n.t('sync.problemUnreachable')
  }
}

/** Plain-text elaboration shown in the tap-to-expand detail view. Never wired to any action. */
function detail(status: SyncStatus): string {
  switch (status.state) {
    case 'synced':
      return i18n.t('sync.detailSynced')
    case 'pending':
      return i18n.t('sync.detailPending', { count: status.pendingCount })
    case 'offline':
      return i18n.t('sync.detailOffline')
    case 'problem':
      return status.cause === 'sign-in-needed'
        ? i18n.t('sync.detailProblemSignIn')
        : i18n.t('sync.detailProblemUnreachable')
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
  const { t } = useTranslation()
  const { signedIn } = useAuth()
  const status = useSyncStatus()
  const [expanded, setExpanded] = useState(false)

  if (!signedIn) return null

  return (
    <div role="region" aria-live="polite" aria-label={t('sync.ariaLabel')} className="text-sm">
      <button type="button" onClick={() => setExpanded((v) => !v)} className={labelClassName(status.state)}>
        {label(status)}
      </button>
      {expanded && (
        <p className="mt-1 max-w-xs rounded-lg bg-gray-50 p-2 text-xs text-gray-500 shadow-sm">
          {detail(status)}
        </p>
      )}
    </div>
  )
}
