import { afterEach, describe, expect, it, vi } from 'vitest'
import { dismissOsm, isOsmDismissed } from './osmDismissals'

afterEach(() => {
  vi.restoreAllMocks()
  localStorage.clear()
})

describe('osmDismissals', () => {
  it('remembers a refused match on this device', () => {
    expect(isOsmDismissed('a')).toBe(false)
    dismissOsm('a')
    dismissOsm('a')
    expect(isOsmDismissed('a')).toBe(true)
    expect(JSON.parse(localStorage.getItem('tablemarks:osmDismissed')!)).toEqual(['a'])
  })

  it('ignores a corrupt value', () => {
    localStorage.setItem('tablemarks:osmDismissed', '{not json')
    expect(isOsmDismissed('a')).toBe(false)
  })

  it('does not throw when storage is unavailable', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(() => dismissOsm('a')).not.toThrow()
    expect(isOsmDismissed('a')).toBe(false)
  })
})
