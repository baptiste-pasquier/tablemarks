import { describe, it, expect } from 'vitest'
import { cn } from './cn'

describe('cn', () => {
  it('joins two truthy strings with a single space', () => {
    expect(cn('foo', 'bar')).toBe('foo bar')
  })

  it('filters out falsy arguments instead of joining them as literal text', () => {
    expect(cn('foo', false, 'bar', null, undefined, '', 'baz')).toBe('foo bar baz')
  })

  it('returns an empty string when called with no arguments', () => {
    expect(cn()).toBe('')
  })
})
