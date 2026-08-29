import { useTranslation } from 'react-i18next'

type ModalHeaderVariant = 'default' | 'detail'

// 'default' matches the plain "static label" title bar shared by AddPlace/DecidePanel/
// PortabilityPanel. 'detail' matches RestaurantDetail's title bar, which needs the dynamic
// restaurant-name heading to stay larger and top-aligned rather than shrinking/re-centering
// to the shared size.
const VARIANT_STYLES: Record<ModalHeaderVariant, { wrapper: string; title: string }> = {
  default: { wrapper: 'mb-3 flex items-center justify-between', title: 'text-base font-semibold' },
  detail: { wrapper: 'mb-1 flex items-start justify-between', title: 'text-lg font-semibold' },
}

/**
 * Shared title-bar chrome for every Modal-hosted panel (KTD3): a title plus a close button.
 * Purely presentational — Escape-close, backdrop-click, and focus-trap semantics all live in
 * `Modal.tsx` itself, so this component is safe to render even without a surrounding `Modal`
 * (e.g. `PortabilityPanel` nested in a future Settings panel).
 */
export function ModalHeader({
  title,
  onClose,
  variant = 'default',
}: {
  title: string
  onClose: () => void
  variant?: ModalHeaderVariant
}) {
  const { t } = useTranslation()
  const styles = VARIANT_STYLES[variant]

  return (
    <div className={styles.wrapper}>
      <h2 className={styles.title}>{title}</h2>
      <button
        type="button"
        onClick={onClose}
        aria-label={t('common.close')}
        className="text-gray-400 hover:text-gray-600"
      >
        ✕
      </button>
    </div>
  )
}
