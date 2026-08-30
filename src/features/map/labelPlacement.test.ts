import { describe, it, expect, vi } from 'vitest'
import { computeLabelPlacement, type LabelCandidate, type MeasureTextWidth } from './labelPlacement'

const CENTER = { x: 0, y: 0 }

/** Deterministic stub: never touches a real canvas, width scales with character count. */
const stubMeasure: MeasureTextWidth = (text) => text.length * 10

function candidate(over: Partial<LabelCandidate> & Pick<LabelCandidate, 'id'>): LabelCandidate {
  return { x: 0, y: 0, name: 'X', dimmed: false, ...over }
}

describe('computeLabelPlacement', () => {
  it('returns an empty set below the zoom floor, regardless of available space (R2, AE1)', () => {
    const candidates = [
      candidate({ id: 'a', x: 0, y: 0 }),
      candidate({ id: 'b', x: 500, y: 500 }),
    ]
    const accepted = computeLabelPlacement(candidates, CENTER, false, { measureTextWidth: stubMeasure })
    expect(accepted).toEqual(new Set())
  })

  it('accepts both of two well-separated candidates above the floor (AE2)', () => {
    const candidates = [
      candidate({ id: 'a', x: 0, y: 0, name: 'A' }), // width 10 -> box [-5, 5]
      candidate({ id: 'b', x: 200, y: 0, name: 'B' }), // width 10 -> box [195, 205]
    ]
    const accepted = computeLabelPlacement(candidates, CENTER, true, { measureTextWidth: stubMeasure })
    expect(accepted).toEqual(new Set(['a', 'b']))
  })

  it('accepts only the candidate nearer view center when two labels overlap (R3, AE3)', () => {
    const candidates = [
      // 10-char names -> 100px-wide boxes, so these two definitely overlap.
      candidate({ id: 'far', x: 20, y: 0, name: 'AAAAAAAAAA' }), // dist 20
      candidate({ id: 'near', x: 5, y: 0, name: 'AAAAAAAAAA' }), // dist 5
    ]
    const accepted = computeLabelPlacement(candidates, CENTER, true, { measureTextWidth: stubMeasure })
    expect(accepted).toEqual(new Set(['near']))
  })

  it('never labels a dimmed candidate, and it does not block a nearby non-dimmed one (R4, AE5, AE6)', () => {
    const candidates = [
      candidate({ id: 'dimmed', x: 0, y: 0, name: 'AAAAAAAAAA', dimmed: true }),
      candidate({ id: 'visible', x: 5, y: 0, name: 'AAAAAAAAAA', dimmed: false }),
    ]
    const accepted = computeLabelPlacement(candidates, CENTER, true, { measureTextWidth: stubMeasure })
    expect(accepted).toEqual(new Set(['visible']))
  })

  it('breaks exact distance ties deterministically by id (KTD6)', () => {
    const candidates = [
      candidate({ id: 'b', x: 5, y: 0, name: 'AAAAAAAAAA' }),
      candidate({ id: 'a', x: -5, y: 0, name: 'AAAAAAAAAA' }),
    ]
    const first = computeLabelPlacement(candidates, CENTER, true, { measureTextWidth: stubMeasure })
    const second = computeLabelPlacement(candidates, CENTER, true, { measureTextWidth: stubMeasure })
    expect(first).toEqual(new Set(['a']))
    expect(second).toEqual(first)
  })

  it('returns an empty set for an empty candidate list without error', () => {
    const accepted = computeLabelPlacement([], CENTER, true, { measureTextWidth: stubMeasure })
    expect(accepted).toEqual(new Set())
  })

  it('measures each unique name+font once and reuses the cached width (KTD4)', () => {
    const measure = vi.fn(stubMeasure)
    const candidates = [
      candidate({ id: 'a', x: 0, y: 0, name: 'Same Name' }),
      candidate({ id: 'b', x: 300, y: 0, name: 'Same Name' }),
    ]
    computeLabelPlacement(candidates, CENTER, true, { measureTextWidth: measure })
    expect(measure).toHaveBeenCalledTimes(1)
  })
})
