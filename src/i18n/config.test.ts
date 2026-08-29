import { createElement } from 'react'
import { render, screen } from '@testing-library/react'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { i18n as I18nInstance } from 'i18next'

// This unit proves the detector/config wiring itself, so it drives a real i18next instance
// rather than the passthrough mock later units will add for component tests. Every scenario
// needs its own fresh i18next + language-detector module graph (both keep module-scoped
// singleton state), so each test resets the module registry and re-imports before asserting.
async function loadI18n(): Promise<I18nInstance> {
  vi.resetModules()
  const { default: i18n } = await import('./config')
  return i18n
}

// `react-i18next`'s no-provider `useTranslation()` reads a module-scoped singleton set by
// whichever `initReactI18next` instance last ran. It must come from the same fresh module
// graph as the `i18n` instance above, not a stale top-level import, or it won't see the
// resources/language that instance just resolved.
async function loadUseTranslation(): Promise<typeof import('react-i18next').useTranslation> {
  const { useTranslation } = await import('react-i18next')
  return useTranslation
}

function setBrowserLanguage(...languages: string[]): void {
  vi.stubGlobal('navigator', { language: languages[0], languages })
}

// Opt out of the global test passthrough (src/test/setup.ts) for both mocked modules: this suite
// drives a real i18next instance end to end, including real `react-i18next` resolution and the
// real config module (not the setup file's stand-in pointed at a fixed-language test instance).
vi.unmock('react-i18next')
vi.unmock('./config')

describe('i18n config', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    window.localStorage.clear()
    document.documentElement.lang = ''
  })

  it('renders in the browser-detected language on load when nothing is stored', async () => {
    setBrowserLanguage('fr-FR', 'fr')
    const i18n = await loadI18n()

    expect(i18n.resolvedLanguage).toBe('fr')
    expect(document.documentElement.lang).toBe('fr')
  })

  it('falls back to English when there is no stored preference and the browser language is unsupported', async () => {
    setBrowserLanguage('de-DE', 'de')
    const i18n = await loadI18n()

    expect(i18n.resolvedLanguage).toBe('en')
  })

  it('prefers a stored preference over the current browser language', async () => {
    window.localStorage.setItem('i18nextLng', 'fr')
    setBrowserLanguage('en-US', 'en')
    const i18n = await loadI18n()

    expect(i18n.resolvedLanguage).toBe('fr')
  })

  it('updates document.documentElement.lang and local storage together when the language changes', async () => {
    setBrowserLanguage('en-US', 'en')
    const i18n = await loadI18n()
    expect(document.documentElement.lang).toBe('en')

    await i18n.changeLanguage('fr')

    expect(document.documentElement.lang).toBe('fr')
    expect(window.localStorage.getItem('i18nextLng')).toBe('fr')
  })

  it('renders a translating component without throwing in French', async () => {
    setBrowserLanguage('fr-FR', 'fr')
    await loadI18n()
    const useTranslation = await loadUseTranslation()

    function Probe() {
      const { t } = useTranslation()
      return createElement('div', null, t('app.title'))
    }
    render(createElement(Probe))

    expect(screen.getByText('Tablemarks')).toBeInTheDocument()
  })

  it('renders a translating component without throwing in English', async () => {
    setBrowserLanguage('en-US', 'en')
    await loadI18n()
    const useTranslation = await loadUseTranslation()

    function Probe() {
      const { t } = useTranslation()
      return createElement('div', null, t('app.title'))
    }
    render(createElement(Probe))

    expect(screen.getByText('Tablemarks')).toBeInTheDocument()
  })
})
