import type { resources } from '../i18n/resources'

// Augments react-i18next/i18next's types so `t()` keys and namespaces are checked against the
// actual resource shape at compile time (the standard react-i18next TypeScript pattern).
declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'translation'
    resources: (typeof resources)['en']
  }
}
