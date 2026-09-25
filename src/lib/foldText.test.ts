import { describe, expect, it } from 'vitest'
import { foldText } from './foldText'

describe('foldText', () => {
  it('folds case, Latin accents, underscores and spacing', () => {
    expect(foldText('  Café_du   Coin ')).toBe('cafe du coin')
  })

  it('keeps marks that change a word in another script', () => {
    expect(foldText('パン')).toBe('パン')
  })
})
