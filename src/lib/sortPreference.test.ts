import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { readSortPreference, writeSortPreference, type SortPreference } from './sortPreference'

const VALID_PREFERENCE: SortPreference = {
  criterion: 'distance',
  directions: { distance: 'farthest', date: 'oldest' },
}

describe('sortPreference', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  afterEach(() => {
    window.localStorage.clear()
  })

  it('returns absent (null) when nothing is persisted yet', () => {
    expect(readSortPreference()).toBeNull()
  })

  it('returns the persisted value unchanged when it is valid', () => {
    writeSortPreference(VALID_PREFERENCE)

    expect(readSortPreference()).toEqual(VALID_PREFERENCE)
  })

  it('round-trips the exact persisted shape via write then read', () => {
    const preference: SortPreference = {
      criterion: 'date',
      directions: { distance: 'nearest', date: 'newest' },
    }
    writeSortPreference(preference)

    expect(readSortPreference()).toEqual(preference)
  })

  it('returns absent when the persisted criterion is unrecognized', () => {
    window.localStorage.setItem(
      'tablemarks:sortPreference',
      JSON.stringify({
        criterion: 'popularity',
        directions: { distance: 'nearest', date: 'newest' },
      }),
    )

    expect(readSortPreference()).toBeNull()
  })

  it('returns absent when a persisted direction is unrecognized', () => {
    window.localStorage.setItem(
      'tablemarks:sortPreference',
      JSON.stringify({
        criterion: 'distance',
        directions: { distance: 'ascending', date: 'newest' },
      }),
    )

    expect(readSortPreference()).toBeNull()
  })

  it('returns absent when the persisted value is malformed JSON', () => {
    window.localStorage.setItem('tablemarks:sortPreference', '{not valid json')

    expect(readSortPreference()).toBeNull()
  })

  it('returns absent when the persisted value is not an object', () => {
    window.localStorage.setItem('tablemarks:sortPreference', JSON.stringify('distance'))

    expect(readSortPreference()).toBeNull()
  })

  it('returns absent when the persisted value is missing the directions field', () => {
    window.localStorage.setItem(
      'tablemarks:sortPreference',
      JSON.stringify({ criterion: 'distance' }),
    )

    expect(readSortPreference()).toBeNull()
  })
})
