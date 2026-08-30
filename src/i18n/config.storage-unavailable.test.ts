import { describe, it, expect, vi } from 'vitest'
import type { i18n as I18nInstance } from 'i18next'

// Kept in a separate file from config.test.ts on purpose: i18next-browser-languagedetector
// memoizes whether localStorage is usable in a module-scoped variable that isn't reset by
// vi.resetModules() (a known limitation for pre-bundled/optimized dependencies). Running this
// scenario alongside tests that rely on a *working* localStorage in the same file/module graph
// makes whichever runs first "win" the memoized flag for the rest of the file. A separate test
// file gets its own isolated module graph (Vitest's default per-file isolation), so this is the
// only reliable way to exercise the "localStorage throws" path without corrupting the others.
async function loadI18n(): Promise<I18nInstance> {
  vi.resetModules()
  const { default: i18n } = await import('./config')
  return i18n
}

function setBrowserLanguage(...languages: string[]): void {
  vi.stubGlobal('navigator', { language: languages[0], languages })
}

// Opt out of the global test passthrough (src/test/setup.ts) — this suite drives the real config
// module, not the setup file's stand-in pointed at a fixed-language test instance.
vi.unmock('./config')

describe('i18n config (localStorage unavailable)', () => {
  it('falls back to browser-language detection alone, without throwing, when localStorage is unavailable', async () => {
    setBrowserLanguage('fr-FR', 'fr')
    const originalLocalStorage = window.localStorage
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get(): Storage {
        throw new Error('localStorage disabled (private browsing / quota exceeded)')
      },
    })

    try {
      const i18n = await loadI18n()
      expect(i18n.resolvedLanguage).toBe('fr')
    } finally {
      Object.defineProperty(window, 'localStorage', {
        configurable: true,
        writable: true,
        value: originalLocalStorage,
      })
      vi.unstubAllGlobals()
    }
  })
})
