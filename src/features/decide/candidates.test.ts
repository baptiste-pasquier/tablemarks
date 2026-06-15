import { describe, it, expect } from 'vitest'
import { decideCandidates, pickForMe, type Anchor } from './candidates'
import type { Restaurant, Verdict } from '../../types/models'

const ANCHOR: Anchor = { lat: 48.8566, lng: 2.3522 }

function r(
  over: Partial<Restaurant> & Pick<Restaurant, 'id'>,
): Restaurant {
  return {
    name: over.id,
    lat: 48.8566,
    lng: 2.3522,
    pending: false,
    latestVerdict: null,
    latestVisitDate: null,
    visitCount: 0,
    updated: '1',
    deleted: false,
    needsPush: false,
    ...over,
  }
}

function visited(id: string, verdict: Verdict, over: Partial<Restaurant> = {}): Restaurant {
  return r({ id, visitCount: 1, latestVerdict: verdict, ...over })
}

describe('decideCandidates', () => {
  it('includes to-try and Go-back places, excludes lower verdicts', () => {
    const out = decideCandidates(
      [
        r({ id: 'to-try' }),
        visited('go-back', 'go_back'),
        visited('detour', 'worth_a_detour'),
        visited('once', 'once_was_enough'),
        visited('never', 'never_again'),
      ],
      ANCHOR,
      5000,
    )
    expect(out.map((c) => c.restaurant.id).sort()).toEqual(['go-back', 'to-try'])
  })

  it('restricts to the radius and sorts nearest-first', () => {
    // ~445m north and ~1.3km north of the anchor
    const near = r({ id: 'near', lat: 48.8606, lng: 2.3522 })
    const far = r({ id: 'far', lat: 48.8686, lng: 2.3522 })
    const outside = r({ id: 'outside', lat: 49.0, lng: 2.3522 })
    const out = decideCandidates([far, near, outside], ANCHOR, 2000)
    expect(out.map((c) => c.restaurant.id)).toEqual(['near', 'far'])
  })

  it('excludes provisional records and ones without coordinates', () => {
    const out = decideCandidates(
      [r({ id: 'pending', pending: true }), r({ id: 'nocoord', lat: null, lng: null }), r({ id: 'ok' })],
      ANCHOR,
      5000,
    )
    expect(out.map((c) => c.restaurant.id)).toEqual(['ok'])
  })

  it('returns empty when nothing matches in range', () => {
    expect(decideCandidates([r({ id: 'far', lat: 49.5, lng: 2.3522 })], ANCHOR, 1000)).toEqual([])
  })
})

describe('pickForMe', () => {
  it('returns a member of the candidate set', () => {
    const candidates = decideCandidates([r({ id: 'a' }), r({ id: 'b' })], ANCHOR, 5000)
    const picked = pickForMe(candidates)
    expect(candidates).toContain(picked)
  })

  it('returns undefined for an empty set', () => {
    expect(pickForMe([])).toBeUndefined()
  })
})
