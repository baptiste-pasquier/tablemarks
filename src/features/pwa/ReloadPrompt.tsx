import { useRef } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'

/**
 * Registers the service worker and surfaces an unobtrusive banner when a new version is waiting
 * (R11) — the user reloads on their own terms rather than being interrupted by a silent reload.
 * Also shows a one-off "ready to work offline" note. Renders nothing when neither applies.
 */
export function ReloadPrompt() {
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
      aria-label="App update"
      className="fixed bottom-4 left-1/2 z-[2000] flex -translate-x-1/2 items-center gap-3 rounded-md bg-gray-900 px-4 py-2 text-sm text-white shadow-lg"
    >
      {needRefresh ? (
        <>
          <span>A new version is available.</span>
          <button
            type="button"
            onClick={reload}
            className="rounded bg-brand px-2.5 py-1 font-medium text-white hover:opacity-90"
          >
            Reload
          </button>
        </>
      ) : (
        <span>Ready to work offline.</span>
      )}
      <button type="button" onClick={dismiss} aria-label="Dismiss" className="text-gray-400 hover:text-white">
        ✕
      </button>
    </div>
  )
}
