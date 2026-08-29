import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'
import i18next from 'i18next'
import { resources } from '../i18n/resources'

// jsdom does not implement Blob.prototype.text(); polyfill via FileReader so components that
// read uploaded files with `file.text()` (e.g. import) work under test as they do in browsers.
if (typeof Blob !== 'undefined' && typeof Blob.prototype.text !== 'function') {
  Blob.prototype.text = function (this: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result))
      reader.onerror = () => reject(reader.error)
      reader.readAsText(this)
    })
  }
}

/**
 * A dedicated, real i18next instance loaded synchronously with the app's actual English and
 * French resource bundles (per U2's locale migration). It backs a global `react-i18next`
 * passthrough mock (below) so every component test resolves real, current copy through `t()`
 * instead of raw keys — real interpolation/pluralization means existing assertions written
 * against real English copy keep passing unchanged, with no per-file passthrough mock needed.
 *
 * Named with a `mock` prefix: `vi.mock` factories are hoisted above this declaration, and Vitest
 * only allows a hoisted factory to close over a top-level variable when its name starts with
 * "mock" (otherwise: "cannot access ... before initialization"). The factories below only run
 * lazily, whenever some test file first imports 'react-i18next' / '../i18n/config', by which
 * point this module has already finished initializing top to bottom.
 *
 * Tests that exercise real language-detection/switching behavior (src/i18n/config.test.ts,
 * src/i18n/config.storage-unavailable.test.ts) opt out of both mocks via `vi.unmock(...)`.
 */
export const mockI18n = i18next.createInstance()
void mockI18n.init({
  resources,
  lng: 'en',
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
})

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: mockI18n.t.bind(mockI18n), i18n: mockI18n }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}))

// display.ts / StatusBadge.tsx / map/markers.ts resolve verdict/status copy through the plain
// i18next instance API (not the hook) since they're not React components — point the app's
// singleton import at the same test instance so their output matches the mocked hook above.
vi.mock('../i18n/config', () => ({ default: mockI18n }))

afterEach(() => {
  cleanup()
  // Reset in case a test switched languages (e.g. to assert French copy) without reverting.
  void mockI18n.changeLanguage('en')
})
