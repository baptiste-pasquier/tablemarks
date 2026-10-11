export type SignInDecision =
  | { kind: 'resume' }
  | { kind: 'bind' }
  | { kind: 'ask-adopt'; count: number }
  | { kind: 'ask-replace'; pendingCount: number }

export interface SignInFacts {
  storeOwner: string | null
  userId: string
  liveCount: number
  pendingCount: number
}

export type AccountQuestion =
  | { kind: 'adopt'; count: number }
  | { kind: 'replace'; pendingCount: number }
  | { kind: 'loss'; pendingCount: number }

export type AccountAnswer = 'add' | 'erase' | 'sign-out' | 'cancel'

export type AskAccountQuestion = (question: AccountQuestion) => Promise<AccountAnswer>

export function decideSignIn(facts: SignInFacts): SignInDecision {
  if (facts.storeOwner === facts.userId) {
    return { kind: 'resume' }
  }
  if (facts.storeOwner !== null) {
    return { kind: 'ask-replace', pendingCount: facts.pendingCount }
  }
  if (facts.liveCount > 0) {
    return { kind: 'ask-adopt', count: facts.liveCount }
  }
  return { kind: 'bind' }
}
