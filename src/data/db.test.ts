import { beforeEach, describe, it, expect, vi } from 'vitest'
import { openDB } from 'idb'
import { freshDB } from '../test/idb'
import { DB, getDB } from './db'

beforeEach(freshDB)

describe('getDB', () => {
  it('yields to another tab opening a newer version, then reopens on the next call', async () => {
    const first = await getDB()
    const blocked = vi.fn()

    const newer = await openDB(DB.name, DB.version + 1, { blocked })

    expect(blocked).not.toHaveBeenCalled()
    newer.close()
    // The cached connection was dropped, so the next call opens a new one, not the closed one.
    await freshDB()
    const second = await getDB()
    expect(second).not.toBe(first)
    expect(await second.get('meta', 'owner')).toBeUndefined()
  })
})
