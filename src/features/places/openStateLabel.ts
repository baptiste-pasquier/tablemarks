import type { TFunction } from 'i18next'
import { formatClock, type OpenState } from '../../lib/openingHours'

export function openStateLabel(state: OpenState, t: TFunction): string {
  switch (state.kind) {
    case 'open':
      return state.closesAt === null
        ? t('openState.openAllDay')
        : t('openState.openUntil', { time: formatClock(state.closesAt) })
    case 'opens-soon':
      return t('openState.opensAt', { time: formatClock(state.opensAt) })
    case 'closed':
      return t('openState.closedOpensAt', { time: formatClock(state.opensAt) })
    case 'closed-today':
      return t('openState.closedToday')
  }
}
