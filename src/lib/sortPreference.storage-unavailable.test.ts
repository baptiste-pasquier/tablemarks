import { describe, it, expect } from 'vitest'
import { readSortPreference, writeSortPreference, type SortPreference } from './sortPreference'

// Kept in a separate file from sortPreference.test.ts, mirroring
// src/i18n/config.storage-unavailable.test.ts: this exercises the "localStorage throws" path in
// its own isolated module graph so it can't affect (or be affected by) the working-storage
// scenarios in the main suite.

describe('sortPreference (localStorage unavailable)', () => {
  it('read returns absent, without throwing, when localStorage.getItem throws', () => {
    const originalLocalStorage = window.localStorage
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get(): Storage {
        throw new Error('localStorage disabled (private browsing / quota exceeded)')
      },
    })

    try {
      expect(() => readSortPreference()).not.toThrow()
      expect(readSortPreference()).toBeNull()
    } finally {
      Object.defineProperty(window, 'localStorage', {
        configurable: true,
        writable: true,
        value: originalLocalStorage,
      })
    }
  })

  it('write no-ops, without throwing, when localStorage.setItem throws', () => {
    const preference: SortPreference = {
      criterion: 'distance',
      directions: { distance: 'nearest', date: 'newest' },
    }
    const originalSetItem = window.localStorage.setItem
    window.localStorage.setItem = () => {
      throw new Error('QuotaExceededError')
    }

    try {
      expect(() => writeSortPreference(preference)).not.toThrow()
    } finally {
      window.localStorage.setItem = originalSetItem
    }
  })
})
