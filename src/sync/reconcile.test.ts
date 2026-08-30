import { describe, it, expect } from 'vitest'
import { pickWinner, reconcile } from './reconcile'
import { normalizeInstant } from '../lib/dates'
import type { SyncFields } from '../types/models'

function rec(id: string, updated: string, deleted = false): SyncFields {
  return { id, updated, deleted }
}

describe('pickWinner', () => {
  it('keeps the newer updated', () => {
    expect(pickWinner(rec('a', '2026-01-01'), rec('a', '2026-02-01'))?.updated).toBe('2026-02-01')
    expect(pickWinner(rec('a', '2026-03-01'), rec('a', '2026-02-01'))?.updated).toBe('2026-03-01')
  })

  it('returns the present one when the other is absent', () => {
    expect(pickWinner(rec('a', '1'), undefined)?.id).toBe('a')
    expect(pickWinner(undefined, rec('a', '1'))?.id).toBe('a')
  })

  it('lets a newer tombstone win', () => {
    const live = rec('a', '2026-01-01', false)
    const tomb = rec('a', '2026-02-01', true)
    expect(pickWinner(live, tomb)?.deleted).toBe(true)
  })

  it('never lets a zeroed remote updated ("") look newer than a real local edit', () => {
    const local = rec('a', '2026-01-01T10:00:00.000Z')
    const remote = rec('a', '')
    expect(pickWinner(local, remote)).toBe(local)
  })

  it('a normalized remote updated compares correctly against a fresh local updated (KTD5)', () => {
    // Simulates a PocketBase `date` field's space-separated shape being normalized at the
    // mappers.ts boundary before it ever reaches pickWinner's string comparison.
    const remoteRaw = '2026-02-01 10:00:00.000Z' // PocketBase-style, genuinely later than local
    const local = rec('a', '2026-01-01T10:00:00.000Z')
    const remote = rec('a', normalizeInstant(remoteRaw))
    expect(pickWinner(local, remote)).toBe(remote)
  })
})

describe('reconcile', () => {
  it('newer remote wins and is queued to write locally', () => {
    const { merged, toWriteLocal, toPush } = reconcile([rec('a', '2026-01-01')], [rec('a', '2026-02-01')])
    expect(merged).toHaveLength(1)
    expect(toWriteLocal.map((r) => r.updated)).toEqual(['2026-02-01'])
    expect(toPush).toEqual([])
  })

  it('newer local wins and is queued to push', () => {
    const { toWriteLocal, toPush } = reconcile([rec('a', '2026-03-01')], [rec('a', '2026-02-01')])
    expect(toPush.map((r) => r.updated)).toEqual(['2026-03-01'])
    expect(toWriteLocal).toEqual([])
  })

  it('local-only pushes, remote-only writes locally — no duplicates', () => {
    const { merged, toWriteLocal, toPush } = reconcile([rec('local', '1')], [rec('remote', '1')])
    expect(merged.map((r) => r.id).sort()).toEqual(['local', 'remote'])
    expect(toPush.map((r) => r.id)).toEqual(['local'])
    expect(toWriteLocal.map((r) => r.id)).toEqual(['remote'])
  })

  it('identical timestamps are a no-op (idempotent re-sync)', () => {
    const { toWriteLocal, toPush } = reconcile([rec('a', '2026-01-01')], [rec('a', '2026-01-01')])
    expect(toWriteLocal).toEqual([])
    expect(toPush).toEqual([])
  })

  it('a pair with equal local/remote updated lands in noop, not toWriteLocal/toPush, and still merges', () => {
    const local = rec('a', '2026-01-01')
    const { merged, noop, toWriteLocal, toPush } = reconcile([local], [rec('a', '2026-01-01')])
    expect(noop).toEqual([local])
    expect(toWriteLocal).toEqual([])
    expect(toPush).toEqual([])
    expect(merged).toEqual([local])
  })

  it('does not put a non-equal pair in noop', () => {
    const { noop } = reconcile([rec('a', '2026-01-01')], [rec('a', '2026-02-01')])
    expect(noop).toEqual([])
  })

  it('a newer remote tombstone is written locally (delete propagates, not resurrects)', () => {
    const { merged, toWriteLocal } = reconcile([rec('a', '2026-01-01', false)], [rec('a', '2026-02-01', true)])
    expect(merged[0].deleted).toBe(true)
    expect(toWriteLocal[0].deleted).toBe(true)
  })
})
