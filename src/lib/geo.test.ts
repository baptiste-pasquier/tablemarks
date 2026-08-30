import { describe, it, expect } from 'vitest'
import { formatDistance, haversineMeters } from './geo'

describe('haversineMeters', () => {
  it('is ~0 for the same point and grows with distance', () => {
    expect(haversineMeters(48.8566, 2.3522, 48.8566, 2.3522)).toBeCloseTo(0, 1)
    expect(haversineMeters(48.8566, 2.3522, 48.8606, 2.3522)).toBeGreaterThan(400)
  })
})

describe('formatDistance', () => {
  it('formats sub-km distances as rounded meters', () => {
    expect(formatDistance(0)).toBe('0 m')
    expect(formatDistance(999)).toBe('999 m')
  })

  it('formats km-and-above distances as one-decimal km', () => {
    expect(formatDistance(1000)).toBe('1.0 km')
    expect(formatDistance(2500)).toBe('2.5 km')
  })
})
