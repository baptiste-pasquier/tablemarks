import { describe, it, expect } from 'vitest'
import { deriveSyncState } from './syncStatus'

describe('deriveSyncState', () => {
  it('is synced when online with nothing pending', () => {
    expect(deriveSyncState({ online: true, pending: 0, problem: null })).toEqual({ status: 'synced', pending: 0, cause: null })
  })

  it('is pending when online with unpushed records', () => {
    expect(deriveSyncState({ online: true, pending: 3, problem: null })).toEqual({ status: 'pending', pending: 3, cause: null })
  })

  it('is offline when offline, still reporting the pending count', () => {
    expect(deriveSyncState({ online: false, pending: 3, problem: null })).toEqual({ status: 'offline', pending: 3, cause: null })
  })

  it('escalates to problem when online and a problem cause is set', () => {
    expect(deriveSyncState({ online: true, pending: 2, problem: 'auth' })).toMatchObject({ status: 'problem', cause: 'auth' })
  })

  it('offline takes precedence over a problem cause (offline is not a failure)', () => {
    expect(deriveSyncState({ online: false, pending: 2, problem: 'server' })).toMatchObject({ status: 'offline', cause: null })
  })

  it('problem takes precedence over pending', () => {
    expect(deriveSyncState({ online: true, pending: 5, problem: 'server' }).status).toBe('problem')
  })
})
