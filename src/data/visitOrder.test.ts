import { describe, it, expect } from 'vitest'
import { rollupOf } from './visitOrder'
import type { Visit } from '../types/models'

function visit(
  date: string | null,
  verdict: Visit['verdict'],
  deleted = false,
  updated = date ?? '2026-01-01T00:00:00.000Z',
): Visit {
  return { id: `${date}-${updated}`, restaurantId: 'r', date, verdict, updated, deleted }
}

describe('rollupOf (pure)', () => {
  it('returns nulls for no visits', () => {
    expect(rollupOf([])).toEqual({ latestVerdict: null, latestVisitDate: null, visitCount: 0 })
  })

  it('picks the latest-by-date verdict regardless of input order', () => {
    const r = rollupOf([
      visit('2025-08-20', 'go_back'),
      visit('2026-02-11', 'once_was_enough'),
      visit('2025-11-03', 'worth_a_detour'),
    ])
    expect(r).toEqual({
      latestVerdict: 'once_was_enough',
      latestVisitDate: '2026-02-11',
      visitCount: 3,
    })
  })

  it('ignores deleted visits', () => {
    const r = rollupOf([visit('2026-02-11', 'never_again', true), visit('2025-08-20', 'go_back')])
    expect(r).toEqual({ latestVerdict: 'go_back', latestVisitDate: '2025-08-20', visitCount: 1 })
  })

  it('lets a dated visit win over an undated one recorded later', () => {
    const r = rollupOf([
      visit('2024-03-01', 'go_back', false, '2024-03-01T00:00:00.000Z'),
      visit(null, 'never_again', false, '2026-10-01T00:00:00.000Z'),
    ])
    expect(r).toEqual({ latestVerdict: 'go_back', latestVisitDate: '2024-03-01', visitCount: 2 })
  })

  it('breaks a same-day tie by the more recently recorded visit, whatever the input order', () => {
    const earlier = visit('2026-03-01', 'go_back', false, '2026-03-01T09:00:00.000Z')
    const later = visit('2026-03-01', 'never_again', false, '2026-03-01T21:00:00.000Z')
    const expected = { latestVerdict: 'never_again', latestVisitDate: '2026-03-01', visitCount: 2 }
    expect(rollupOf([earlier, later])).toEqual(expected)
    expect(rollupOf([later, earlier])).toEqual(expected)
  })

  it('takes the most recently recorded undated visit when none is dated', () => {
    const r = rollupOf([
      visit(null, 'go_back', false, '2026-01-01T00:00:00.000Z'),
      visit(null, 'worth_a_detour', false, '2026-02-01T00:00:00.000Z'),
    ])
    expect(r).toEqual({ latestVerdict: 'worth_a_detour', latestVisitDate: null, visitCount: 2 })
  })
})
