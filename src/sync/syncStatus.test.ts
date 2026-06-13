import { describe, it, expect } from 'vitest'
import { deriveSyncState, classifyPushError, applyPushFailure, NO_FAILURE, FAILURE_THRESHOLD } from './syncStatus'

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

describe('classifyPushError', () => {
  it('maps 401/403 to auth', () => {
    expect(classifyPushError({ status: 401 })).toBe('auth')
    expect(classifyPushError({ status: 403 })).toBe('auth')
  })
  it('maps network/5xx/unknown to server', () => {
    expect(classifyPushError({ status: 0 })).toBe('server')
    expect(classifyPushError({ status: 503 })).toBe('server')
    expect(classifyPushError(new Error('network'))).toBe('server')
  })
})

describe('applyPushFailure escalation', () => {
  it('stays below the threshold without escalating (AE4 before threshold)', () => {
    let s = NO_FAILURE
    s = applyPushFailure(s, { status: 401 })
    s = applyPushFailure(s, { status: 401 })
    expect(s.failureCount).toBe(2)
    expect(s.problem).toBeNull() // 2 < 3
  })

  it('escalates to a problem cause at the threshold (AE4)', () => {
    let s = NO_FAILURE
    for (let i = 0; i < FAILURE_THRESHOLD; i++) s = applyPushFailure(s, { status: 401 })
    expect(s.problem).toBe('auth')
  })

  it('classifies a server failure when escalating', () => {
    let s = NO_FAILURE
    for (let i = 0; i < FAILURE_THRESHOLD; i++) s = applyPushFailure(s, { status: 503 })
    expect(s.problem).toBe('server')
  })

  it('NO_FAILURE is the clean reset state used on success and on going offline', () => {
    expect(NO_FAILURE).toEqual({ failureCount: 0, problem: null })
  })
})
