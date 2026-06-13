import { describe, it, expect } from 'vitest'
import { haversineMeters } from './geo'

describe('haversineMeters', () => {
  it('is ~0 for the same point and grows with distance', () => {
    expect(haversineMeters(48.8566, 2.3522, 48.8566, 2.3522)).toBeCloseTo(0, 1)
    expect(haversineMeters(48.8566, 2.3522, 48.8606, 2.3522)).toBeGreaterThan(400)
  })
})
