import { describe, it, expect } from 'vitest'
import { parseImport } from './import'
import { EXPORT_FORMAT, EXPORT_SCHEMA_VERSION } from './schema'

function envelope(over: Record<string, unknown> = {}): string {
  return JSON.stringify({
    format: EXPORT_FORMAT,
    schemaVersion: EXPORT_SCHEMA_VERSION,
    exportedAt: '2026-06-13T00:00:00Z',
    records: {
      restaurants: [
        {
          id: 'r1',
          name: 'Chez Marcel',
          lat: 48,
          lng: 2,
          cuisine: 'French',
          pending: false,
          latestVerdict: 'go_back',
          latestVisitDate: '2026-05-01',
          visitCount: 1,
          updated: '2026-05-01T00:00:00Z',
          deleted: false,
        },
      ],
      visits: [
        { id: 'v1', restaurantId: 'r1', date: '2026-05-01', verdict: 'go_back', updated: '2026-05-01T00:00:00Z', deleted: false },
      ],
    },
    ...over,
  })
}

describe('parseImport', () => {
  it('parses a well-formed v1 envelope', () => {
    const res = parseImport(envelope())
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.records.restaurants).toHaveLength(1)
    expect(res.records.restaurants[0]).toMatchObject({ id: 'r1', cuisine: 'French' })
    expect(res.records.visits[0]).toMatchObject({ id: 'v1', verdict: 'go_back' })
  })

  it('rejects truncated / invalid JSON without throwing (AE3)', () => {
    const res = parseImport('{"format":"tablemarks-export", "schemaVersion":1,')
    expect(res.ok).toBe(false)
  })

  it('rejects a non-Tablemarks file (wrong format guard) (AE3)', () => {
    const res = parseImport(JSON.stringify({ format: 'something-else', schemaVersion: 1, records: { restaurants: [], visits: [] } }))
    expect(res.ok).toBe(false)
  })

  it('rejects a schemaVersion newer than this app understands', () => {
    const res = parseImport(envelope({ schemaVersion: EXPORT_SCHEMA_VERSION + 1 }))
    expect(res.ok).toBe(false)
  })

  it('rejects when records.restaurants is not an array', () => {
    const res = parseImport(envelope({ records: { restaurants: 'nope', visits: [] } }))
    expect(res.ok).toBe(false)
  })

  it('rejects a restaurant record missing required fields / wrong types', () => {
    const bad = JSON.stringify({
      format: EXPORT_FORMAT,
      schemaVersion: EXPORT_SCHEMA_VERSION,
      records: { restaurants: [{ id: 'r1', name: 'X', lat: 'not-a-number', lng: 2, pending: false, updated: '2026-01-01T00:00:00Z', deleted: false }], visits: [] },
    })
    expect(parseImport(bad).ok).toBe(false)
  })

  it('coerces an unknown verdict on a visit rather than rejecting the file', () => {
    const res = parseImport(envelope({
      records: {
        restaurants: [],
        visits: [{ id: 'v1', restaurantId: 'r1', date: '2026-05-01', verdict: 'bogus_verdict', updated: '2026-05-01T00:00:00Z', deleted: false }],
      },
    }))
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(['go_back', 'worth_a_detour', 'once_was_enough', 'never_again']).toContain(res.records.visits[0].verdict)
  })

  it('rejects a record whose updated is not a parseable date (would poison LWW)', () => {
    const res = parseImport(envelope({
      records: {
        restaurants: [{ id: 'r1', name: 'X', lat: 1, lng: 2, pending: false, latestVerdict: null, latestVisitDate: null, visitCount: 0, updated: 'not-a-real-timestamp', deleted: false }],
        visits: [],
      },
    }))
    expect(res.ok).toBe(false)
  })

  it('rejects duplicate ids within a collection rather than silently collapsing them', () => {
    const dup = { id: 'r1', name: 'X', lat: 1, lng: 2, pending: false, latestVerdict: null, latestVisitDate: null, visitCount: 0, updated: '2026-05-01T00:00:00Z', deleted: false }
    const res = parseImport(envelope({ records: { restaurants: [dup, { ...dup, name: 'Y' }], visits: [] } }))
    expect(res.ok).toBe(false)
  })

  it('treats an absent latestVerdict as null, not a fabricated default', () => {
    const res = parseImport(envelope({
      records: {
        restaurants: [{ id: 'r1', name: 'To try', lat: 1, lng: 2, pending: false, latestVisitDate: null, visitCount: 0, updated: '2026-05-01T00:00:00Z', deleted: false }],
        visits: [],
      },
    }))
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.records.restaurants[0].latestVerdict).toBeNull()
  })

  it('accepts the current schema version unchanged through migration', () => {
    const res = parseImport(envelope())
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.records.restaurants[0].updated).toBe('2026-05-01T00:00:00.000Z')
  })

  it('preserves a present added value on a restaurant (R3)', () => {
    const res = parseImport(envelope({
      records: {
        restaurants: [
          {
            id: 'r1',
            name: 'Chez Marcel',
            lat: 48,
            lng: 2,
            cuisine: 'French',
            pending: false,
            latestVerdict: 'go_back',
            latestVisitDate: '2026-05-01',
            visitCount: 1,
            updated: '2026-05-01T00:00:00Z',
            added: '2026-01-01T00:00:00Z',
            deleted: false,
          },
        ],
        visits: [],
      },
    }))
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.records.restaurants[0].added).toBe('2026-01-01T00:00:00.000Z')
  })

  it('normalizes a non-canonical but valid ISO offset timestamp to the canonical UTC form (R6)', () => {
    const res = parseImport(envelope({
      records: {
        restaurants: [
          {
            id: 'r1',
            name: 'Chez Marcel',
            lat: 48,
            lng: 2,
            cuisine: 'French',
            pending: false,
            latestVerdict: 'go_back',
            latestVisitDate: '2026-05-01',
            visitCount: 1,
            updated: '2026-08-30T23:00:00+05:00',
            added: '2026-08-30T23:00:00+05:00',
            deleted: false,
          },
        ],
        visits: [],
      },
    }))
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.records.restaurants[0].added).toBe('2026-08-30T18:00:00.000Z')
    expect(res.records.restaurants[0].updated).toBe('2026-08-30T18:00:00.000Z')
  })

  it('preserves an absent added value on a restaurant as undefined (no backfill)', () => {
    const res = parseImport(envelope())
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.records.restaurants[0].added).toBeUndefined()
  })

  it('rejects a restaurant whose added is not a real ISO instant (R6)', () => {
    const res = parseImport(envelope({
      records: {
        restaurants: [
          {
            id: 'r1',
            name: 'Chez Marcel',
            lat: 48,
            lng: 2,
            cuisine: 'French',
            pending: false,
            latestVerdict: 'go_back',
            latestVisitDate: '2026-05-01',
            visitCount: 1,
            updated: '2026-05-01T00:00:00Z',
            added: 'not-a-timestamp',
            deleted: false,
          },
        ],
        visits: [],
      },
    }))
    expect(res.ok).toBe(false)
  })

  it('accepts a restaurant whose added is the empty string, treating it like absent (mirrors mappers.ts sync-ingest pass-through)', () => {
    const res = parseImport(envelope({
      records: {
        restaurants: [
          {
            id: 'r1',
            name: 'Chez Marcel',
            lat: 48,
            lng: 2,
            cuisine: 'French',
            pending: false,
            latestVerdict: 'go_back',
            latestVisitDate: '2026-05-01',
            visitCount: 1,
            updated: '2026-05-01T00:00:00Z',
            added: '',
            deleted: false,
          },
        ],
        visits: [],
      },
    }))
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.records.restaurants[0].added).toBe('')
  })

  it('rejects a visit whose date is not YYYY-MM-DD shaped (AE4)', () => {
    const res = parseImport(envelope({
      records: {
        restaurants: [],
        visits: [{ id: 'v1', restaurantId: 'r1', date: 'not-a-date', verdict: 'go_back', updated: '2026-05-01T00:00:00Z', deleted: false }],
      },
    }))
    expect(res.ok).toBe(false)
  })

  it('rejects a restaurant whose latestVisitDate is a full instant instead of a local day (R6)', () => {
    const res = parseImport(envelope({
      records: {
        restaurants: [{ id: 'r1', name: 'X', lat: 1, lng: 2, pending: false, latestVerdict: null, latestVisitDate: '2026-05-01T00:00:00Z', visitCount: 0, updated: '2026-05-01T00:00:00Z', deleted: false }],
        visits: [],
      },
    }))
    expect(res.ok).toBe(false)
  })
})
