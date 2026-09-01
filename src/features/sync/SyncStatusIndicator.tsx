import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../auth/useAuth'
import { useSyncStatus } from '../../sync/useSyncStatus'
import { label, detail, labelClassName } from './syncStatusPresentation'

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
        {label(status, t)}
      </button>
      {expanded && (
        <p className="mt-1 max-w-xs rounded-lg bg-gray-50 p-2 text-xs text-gray-500 shadow-sm">
          {detail(status, t)}
        </p>
      )}
    </div>
  )
}
