import { describe, expect, it } from 'vitest'

import { decideSignIn } from './signInDecision'
import type { SignInFacts, SignInDecision } from './signInDecision'

describe('decideSignIn', () => {
  it.each<[string, SignInFacts, SignInDecision]>([
    [
      'resumes when the store already belongs to this user',
      { storeOwner: 'u1', userId: 'u1', liveCount: 5, pendingCount: 2 },
      { kind: 'resume' },
    ],
    [
      'binds an unowned store with no live data',
      { storeOwner: null, userId: 'u1', liveCount: 0, pendingCount: 3 },
      { kind: 'bind' },
    ],
    [
      'asks to adopt an unowned store that holds live data',
      { storeOwner: null, userId: 'u1', liveCount: 4, pendingCount: 0 },
      { kind: 'ask-adopt', count: 4 },
    ],
    [
      'asks to replace another owner store even when empty',
      { storeOwner: 'u2', userId: 'u1', liveCount: 0, pendingCount: 0 },
      { kind: 'ask-replace', pendingCount: 0 },
    ],
    [
      'asks to replace another owner store with pending writes',
      { storeOwner: 'u2', userId: 'u1', liveCount: 3, pendingCount: 2 },
      { kind: 'ask-replace', pendingCount: 2 },
    ],
  ])('%s', (_label, facts, expected) => {
    expect(decideSignIn(facts)).toEqual(expected)
  })
})
