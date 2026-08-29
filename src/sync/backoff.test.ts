import { describe, it, expect } from 'vitest'
import { nextRetryDelayMs, classifyFailure } from './backoff'

describe('nextRetryDelayMs', () => {
  it('doubles the base delay per attempt: 5s, 10s, 20s', () => {
    expect(nextRetryDelayMs(1)).toBe(5_000)
    expect(nextRetryDelayMs(2)).toBe(10_000)
    expect(nextRetryDelayMs(3)).toBe(20_000)
  })

  it('stays capped at 20s for attempts beyond the 3rd', () => {
    expect(nextRetryDelayMs(4)).toBe(20_000)
    expect(nextRetryDelayMs(10)).toBe(20_000)
  })
})

describe('classifyFailure', () => {
  it('maps a 401 status to sign-in-needed', () => {
    expect(classifyFailure({ status: 401 })).toBe('sign-in-needed')
  })

  it('maps a 403 status to sign-in-needed', () => {
    expect(classifyFailure({ status: 403 })).toBe('sign-in-needed')
  })

  it('maps a 5xx status to server-unreachable', () => {
    expect(classifyFailure({ status: 500 })).toBe('server-unreachable')
    expect(classifyFailure({ status: 503 })).toBe('server-unreachable')
  })

  it('maps a status-less network error to server-unreachable', () => {
    expect(classifyFailure(new TypeError('Failed to fetch'))).toBe('server-unreachable')
    expect(classifyFailure(new Error('boom'))).toBe('server-unreachable')
  })
})
