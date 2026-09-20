import { describe, it, expect } from 'vitest'
import { useTranslation } from 'react-i18next'
import i18n from '../../i18n/config'
import { label, detail, pillToneClassName, badgeColorClassName } from './syncStatusPresentation'
import type { SyncStatus } from '../../sync/syncStatus'

const t: ReturnType<typeof useTranslation>['t'] = i18n.t.bind(i18n)

describe('syncStatusPresentation (U2)', () => {
  it('labels and details each state (R2)', () => {
    const cases: [SyncStatus, RegExp, RegExp][] = [
      [{ state: 'synced', pendingCount: 0 }, /all synced/i, /backed up/i],
      [{ state: 'pending', pendingCount: 3 }, /3 pending/i, /3/],
      [{ state: 'offline', pendingCount: 0 }, /^offline$/i, /offline/i],
      [
        { state: 'problem', pendingCount: 0, cause: 'sign-in-needed' },
        /sign in again/i,
        /sign in again/i,
      ],
      [
        { state: 'problem', pendingCount: 0, cause: 'server-unreachable' },
        /can't reach the server/i,
        /can't reach/i,
      ],
    ]
    for (const [status, labelPattern, detailPattern] of cases) {
      expect(label(status, t)).toMatch(labelPattern)
      expect(detail(status, t)).toMatch(detailPattern)
    }
  })

  it('combines offline with a pending count when both apply', () => {
    expect(label({ state: 'offline', pendingCount: 2 }, t)).toMatch(/2/)
  })

  it('maps each state to a distinct color, with "synced" now emerald rather than gray (R2)', () => {
    const states: SyncStatus['state'][] = ['synced', 'pending', 'offline', 'problem']
    const badgeColors = states.map(badgeColorClassName)
    const pillColors = states.map(pillToneClassName)

    expect(new Set(badgeColors).size).toBe(states.length)
    expect(new Set(pillColors).size).toBe(states.length)
    expect(badgeColorClassName('synced')).toContain('emerald')
    expect(badgeColorClassName('synced')).not.toContain('gray')
    expect(pillToneClassName('synced')).toContain('emerald')
    expect(pillToneClassName('synced')).not.toContain('gray')
  })

  it('keeps the badge dot color and the tinted pill color in agreement per state', () => {
    const states: SyncStatus['state'][] = ['synced', 'pending', 'offline', 'problem']
    const colorName = (cls: string) => /emerald|brand|gray|red/.exec(cls)?.[0]
    for (const state of states) {
      expect(colorName(badgeColorClassName(state))).toBe(colorName(pillToneClassName(state)))
    }
  })
})
