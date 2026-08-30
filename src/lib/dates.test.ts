import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  now,
  today,
  localDayToInstantRange,
  instantToLocalDay,
  normalizeInstant,
  isLocalDay,
} from './dates'

// Deterministic timezone-dependent tests stub the `TZ` env var for the duration of the test — V8
// re-resolves the local timezone from it on every Date call, so no date library or shared test
// helper is needed (kept local to this file per the plan's execution note). 'America/Bogota' is a
// real, DST-free UTC-5 zone, matching the AE1/AE2 "viewer in UTC-5" scenarios exactly.
afterEach(() => {
  vi.unstubAllEnvs()
  vi.useRealTimers()
})

describe('now', () => {
  it('is a real, parseable ISO string', () => {
    const value = now()
    expect(Number.isNaN(new Date(value).getTime())).toBe(false)
    expect(value).toBe(new Date(value).toISOString())
  })
})

describe('today', () => {
  it('matches the system clock local calendar day at a fixed mocked time', () => {
    vi.stubEnv('TZ', 'America/Bogota')
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 7, 30, 14, 0, 0, 0)) // local: 2026-08-30 14:00
    expect(today()).toBe('2026-08-30')
  })
})

describe('localDayToInstantRange', () => {
  beforeEach(() => {
    vi.stubEnv('TZ', 'America/Bogota') // UTC-5, no DST
  })

  it('has the expected local-midnight start and next-day-midnight end boundaries', () => {
    const { start, end } = localDayToInstantRange('2026-08-30')
    expect(start).toBe('2026-08-30T05:00:00.000Z')
    expect(end).toBe('2026-08-31T05:00:00.000Z')
  })

  it('covers AE2: the local day extends past the naive UTC end-of-day suffix, reordering recency', () => {
    const { end } = localDayToInstantRange('2026-08-30')
    // Restaurant X: latestVisitDate "2026-08-30" -> local day extends to 2026-08-31T05:00:00Z.
    expect(end).toBe('2026-08-31T05:00:00.000Z')
    // Restaurant Y: added "2026-08-30T23:00:00Z" — a naive UTC end-of-day suffix (23:59:59.999Z)
    // would rank Y ahead of X, but X's real local-day end is later, so X correctly outranks Y.
    const yAdded = new Date('2026-08-30T23:00:00Z').getTime()
    expect(yAdded).toBeLessThan(new Date(end).getTime())
  })
})

describe('instantToLocalDay', () => {
  it('returns the correct local day for an evening UTC instant that falls on a different local day (AE1)', () => {
    vi.stubEnv('TZ', 'America/Bogota') // UTC-5, no DST
    // 2026-08-30T23:30:00Z in UTC-5 is still local calendar day 2026-08-30, not 2026-08-31.
    expect(instantToLocalDay('2026-08-30T23:30:00Z')).toBe('2026-08-30')
  })
})

describe('normalizeInstant', () => {
  it('converts a space-separated PocketBase-style string to the canonical T-separated shape', () => {
    expect(normalizeInstant('2026-08-30 10:00:00.000Z')).toBe('2026-08-30T10:00:00.000Z')
  })

  it('is idempotent on an already-canonical T-separated string', () => {
    const canonical = '2026-08-30T10:00:00.000Z'
    expect(normalizeInstant(canonical)).toBe(canonical)
  })
})

describe('isLocalDay', () => {
  it('accepts a well-formed YYYY-MM-DD string', () => {
    expect(isLocalDay('2026-08-30')).toBe(true)
  })

  it('rejects a full instant string or garbage input', () => {
    expect(isLocalDay('2026-08-30T10:00:00.000Z')).toBe(false)
    expect(isLocalDay('not-a-date')).toBe(false)
    expect(isLocalDay('')).toBe(false)
  })
})
