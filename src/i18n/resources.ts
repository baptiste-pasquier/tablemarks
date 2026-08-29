import en from './locales/en/translation.json'
import fr from './locales/fr/translation.json'

// Static i18next resources, keyed by language then namespace. No HTTP backend — every string
// ships in the bundle so language switches are instant and offline-safe (per KTD1).
export const resources = {
  en: { translation: en },
  fr: { translation: fr },
} as const

export type SupportedLanguage = keyof typeof resources
