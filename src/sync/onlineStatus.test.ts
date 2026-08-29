import { describe, it, expect, vi, afterEach } from 'vitest'
import { isOnline, onOnlineChange } from './onlineStatus'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('isOnline', () => {
  it('reflects navigator.onLine', () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    expect(isOnline()).toBe(false)

    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
    expect(isOnline()).toBe(true)
  })
})

describe('onOnlineChange', () => {
  it('fires the callback on a simulated online event, and stops after unsubscribe', () => {
    const cb = vi.fn()
    const unsubscribe = onOnlineChange(cb)

    window.dispatchEvent(new Event('online'))
    expect(cb).toHaveBeenCalledTimes(1)

    unsubscribe()
    window.dispatchEvent(new Event('online'))
    expect(cb).toHaveBeenCalledTimes(1)
  })

  it('fires the callback on a simulated offline event, and stops after unsubscribe', () => {
    const cb = vi.fn()
    const unsubscribe = onOnlineChange(cb)

    window.dispatchEvent(new Event('offline'))
    expect(cb).toHaveBeenCalledTimes(1)

    unsubscribe()
    window.dispatchEvent(new Event('offline'))
    expect(cb).toHaveBeenCalledTimes(1)
  })
})
