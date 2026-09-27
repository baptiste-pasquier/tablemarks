import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useNow } from './useNow'

afterEach(() => vi.useRealTimers())

describe('useNow', () => {
  it('ticks once a minute', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 8, 21, 18, 40))
    const { result } = renderHook(() => useNow())
    expect(result.current.getMinutes()).toBe(40)
    act(() => vi.advanceTimersByTime(60_000))
    expect(result.current.getMinutes()).toBe(41)
  })

  it('ticks on the whole minute, so every instance agrees, rather than 60 s from mount', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 8, 21, 12, 0, 30))
    const { result } = renderHook(() => useNow())

    act(() => vi.advanceTimersByTime(29_999))
    expect(result.current.getMinutes()).toBe(0)

    act(() => vi.advanceTimersByTime(1))
    expect(result.current.getMinutes()).toBe(1)
    expect(result.current.getSeconds()).toBe(0)
  })
})
