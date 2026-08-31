import { useTranslation } from 'react-i18next'
import { PortabilityPanel } from '../portability/PortabilityPanel'
import { Eyebrow } from '../ui/Eyebrow'
import { ModalHeader } from '../ui/ModalHeader'

/**
 * Settings panel (U4): hosts Language and Export/Import. Export/Import renders `PortabilityPanel`
 * unmodified — it already supplies its own `ModalHeader` (KTD3), so this panel does not add a
 * second heading for that section.
 */
export function SettingsPanel({ onClose }: { onClose: () => void }) {
  const { t, i18n } = useTranslation()

  return (
    <>
      <ModalHeader title={t('settings.title')} onClose={onClose} />

      <div className="border-b border-gray-100 pb-4">
        <Eyebrow as="h3">{t('settings.language')}</Eyebrow>
        <div className="mt-2 flex gap-1.5">
          {(['fr', 'en'] as const).map((lng) => (
            <button
              key={lng}
              type="button"
              aria-pressed={i18n.language === lng}
              onClick={() => void i18n.changeLanguage(lng)}
              className={`inline-flex min-h-10 items-center rounded-full border px-3 py-1.5 text-sm transition ${
                i18n.language === lng
                  ? 'border-brand bg-brand-soft font-semibold text-brand-strong shadow-sm'
                  : 'border-gray-300 text-gray-600 hover:border-gray-400 hover:bg-gray-50'
              }`}
            >
              {lng === 'fr' ? 'Français' : 'English'}
            </button>
          ))}
        </div>
      </div>

      <div className="pt-4">
        <PortabilityPanel onClose={onClose} />
      </div>
    </>
  )
}
