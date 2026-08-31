import { useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useRegisterSW } from 'virtual:pwa-register/react'

/**
 * Registers the service worker and surfaces an unobtrusive banner when a new version is waiting
 * (R11) — the user reloads on their own terms rather than being interrupted by a silent reload.
 * Also shows a one-off "ready to work offline" note. Renders nothing when neither applies.
 */
export function ReloadPrompt() {
  const { t } = useTranslation()
  // Synchronous guard: updateServiceWorker(true) triggers a reload, so a double-click could fire it
  // twice before the page navigates. The ref blocks the second call without waiting for a re-render.
  const reloadingRef = useRef(false)
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisterError(error) {
      console.error('[pwa] service worker registration failed', error)
    },
  })

  if (!needRefresh && !offlineReady) return null

  function dismiss() {
    setNeedRefresh(false)
    setOfflineReady(false)
  }

  function reload() {
    if (reloadingRef.current) return
    reloadingRef.current = true
    void updateServiceWorker(true).catch((error) => {
      console.error('[pwa] update failed', error)
      reloadingRef.current = false
    })
  }

  return (
    <div
      role="region"
      aria-live="polite"
      aria-label={t('pwa.appUpdateAria')}
      className="fixed left-4 right-[6.5rem] z-[2000] flex items-center gap-3 rounded-full bg-gray-900 px-4 py-2.5 text-sm text-white shadow-lg bottom-[calc(var(--safe-area-floating-offset)+1rem)] md:bottom-4 md:left-1/2 md:right-auto md:-translate-x-1/2"
    >
      {needRefresh ? (
        <>
          <span>{t('pwa.newVersion')}</span>
          <button
            type="button"
            onClick={reload}
            className="rounded-full bg-brand px-3 py-1 font-semibold text-white shadow-sm transition hover:bg-brand-strong active:bg-brand-strong"
          >
            {t('pwa.reload')}
          </button>
        </>
      ) : (
        <span>{t('pwa.offlineReady')}</span>
      )}
      <button
        type="button"
        onClick={dismiss}
        aria-label={t('pwa.dismiss')}
        className="rounded-full p-1 text-gray-400 transition hover:text-white active:text-white"
      >
        ✕
      </button>
    </div>
  )
}
