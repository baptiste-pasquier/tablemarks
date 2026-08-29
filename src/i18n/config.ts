import i18n from 'i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import { initReactI18next } from 'react-i18next'
import { resources } from './resources'

/** Keeps <html lang> tracking the active i18next language (R8 / KTD5). */
function syncDocumentLang(lng: string): void {
  document.documentElement.lang = lng
}

// Registered before `init()` so it also catches the language resolved during init itself:
// with static `resources` (no backend), init() resolves and calls `changeLanguage`
// synchronously, emitting `languageChanged` before `init()` returns.
i18n.on('languageChanged', syncDocumentLang)

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'en',
    supportedLngs: Object.keys(resources),
    defaultNS: 'translation',
    detection: {
      // Per KTD2: check a stored choice first, then the browser's reported language.
      // Omits the library's other defaults (querystring, cookie, sessionStorage, htmlTag).
      order: ['localStorage', 'navigator'],
      // Persist the resolved language to localStorage only — device-local, not cookie-based.
      caches: ['localStorage'],
    },
    interpolation: {
      escapeValue: false, // React already escapes interpolated values.
    },
  })

export default i18n
