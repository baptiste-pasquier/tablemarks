import { useTranslation } from 'react-i18next'
import type { SyncStatus, SyncState } from '../../sync/syncStatus'

type Translator = ReturnType<typeof useTranslation>['t']

/** Short label for the header-level indicator / dropdown status chip (R1, R4). */
export function label(status: SyncStatus, t: Translator): string {
  switch (status.state) {
    case 'synced':
      return t('sync.allSynced')
    case 'pending':
      return t('sync.pendingCount', { count: status.pendingCount })
    case 'offline':
      return status.pendingCount > 0
        ? t('sync.offlinePending', { count: status.pendingCount })
        : t('sync.offline')
    case 'problem':
      return status.cause === 'sign-in-needed' ? t('sync.problemSignIn') : t('sync.problemUnreachable')
  }
}

/** Plain-text elaboration shown below the status chip / in the tap-to-expand detail view. Never wired to any action. */
export function detail(status: SyncStatus, t: Translator): string {
  switch (status.state) {
    case 'synced':
      return t('sync.detailSynced')
    case 'pending':
      return t('sync.detailPending', { count: status.pendingCount })
    case 'offline':
      return t('sync.detailOffline')
    case 'problem':
      return status.cause === 'sign-in-needed'
        ? t('sync.detailProblemSignIn')
        : t('sync.detailProblemUnreachable')
  }
}

/**
 * Single per-state color map (KTD6): synced is emerald (R2's recolor, replacing the previous
 * neutral gray), pending is the brand orange, offline is gray, problem is red. `badgeColorClassName`
 * and `pillToneClassName` below are both derived from this one map so the badge dot and the tinted
 * status chip can never disagree on a state's color.
 */
const STATE_COLOR = {
  synced: 'emerald',
  pending: 'brand',
  offline: 'gray',
  problem: 'red',
} as const satisfies Record<SyncState, string>

type StatusColor = (typeof STATE_COLOR)[SyncState]

/** Solid color for a plain badge dot (KTD6) — not a tinted pill. */
const DOT_CLASS: Record<StatusColor, string> = {
  emerald: 'bg-emerald-500',
  brand: 'bg-brand',
  gray: 'bg-gray-400',
  red: 'bg-red-500',
}

/** Tinted-pill background/text pairing for the label pill / dropdown status chip. */
const PILL_CLASS: Record<StatusColor, string> = {
  emerald: 'bg-emerald-100 text-emerald-700',
  brand: 'bg-brand-soft text-brand-strong',
  gray: 'bg-gray-200 text-gray-700',
  red: 'bg-red-50 text-red-700 ring-1 ring-red-200',
}

/** Solid dot color for the given state, e.g. the avatar's corner status badge (R2). */
export function badgeColorClassName(state: SyncState): string {
  return DOT_CLASS[STATE_COLOR[state]]
}

/**
 * Tinted background/text pairing for the status chip, per state — `'problem'` reads visually
 * distinct from R8. Composed through `Badge`'s `tint` mode (e.g. the account dropdown's status
 * chip) instead of hand-rolling the pill shape.
 */
export function pillToneClassName(state: SyncState): string {
  return PILL_CLASS[STATE_COLOR[state]]
}
