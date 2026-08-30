import { describe, it, expect } from 'vitest'
import { resources } from './resources'

// Recursively walks any nested object and returns its full set of dotted leaf-key paths, e.g.
// `{ a: { b: 'x' } }` -> `['a.b']`. Non-object values (strings, numbers, arrays, etc.) are treated
// as terminal keys, so this needs no updating when new namespaces or nesting levels are added.
function flattenKeys(node: unknown, prefix = ''): string[] {
  if (typeof node !== 'object' || node === null || Array.isArray(node)) {
    return prefix ? [prefix] : []
  }

  return Object.entries(node as Record<string, unknown>).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key
    return flattenKeys(value, path)
  })
}

describe('i18n resources key parity', () => {
  it('exposes the exact same set of translation keys in en and fr', () => {
    const enKeys = new Set(flattenKeys(resources.en.translation))
    const frKeys = new Set(flattenKeys(resources.fr.translation))

    const missingFromFr = [...enKeys].filter((key) => !frKeys.has(key)).sort()
    const missingFromEn = [...frKeys].filter((key) => !enKeys.has(key)).sort()

    expect(missingFromFr, 'keys present in en but missing from fr').toEqual([])
    expect(missingFromEn, 'keys present in fr but missing from en').toEqual([])
  })

  it('has at least one key, guarding against an empty/broken import', () => {
    const enKeys = flattenKeys(resources.en.translation)
    expect(enKeys.length).toBeGreaterThan(0)
  })
})
