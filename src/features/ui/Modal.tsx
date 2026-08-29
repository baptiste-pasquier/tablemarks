import { useEffect, useRef, type ReactNode } from 'react'

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * Shared shell for every modal-style panel (R15/KTD2): a bottom sheet with rounded top corners
 * and a drag indicator below the `md` breakpoint, centered at or above it. Tapping the backdrop
 * or pressing Escape closes it; focus moves into the panel on open and returns to whatever
 * triggered it on close.
 */
export function Modal({
  onClose,
  children,
  zIndexClassName = 'z-[1000]',
  panelClassName = '',
}: {
  onClose: () => void
  children: ReactNode
  zIndexClassName?: string
  panelClassName?: string
}) {
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null
    panelRef.current?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR)?.focus()

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose()
        return
      }
      if (e.key !== 'Tab' || !panelRef.current) return
      const focusables = panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
      if (focusables.length === 0) return
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      previouslyFocused?.focus()
    }
  }, [onClose])

  return (
    <div
      onClick={onClose}
      className={`fixed inset-0 ${zIndexClassName} flex items-end justify-center bg-black/50 md:items-start md:p-4 md:pt-16`}
    >
      <div
        ref={panelRef}
        onClick={(e) => e.stopPropagation()}
        className={`w-full rounded-t-2xl bg-white p-5 shadow-xl md:max-w-md md:rounded-2xl ${panelClassName}`}
      >
        <div aria-hidden="true" className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-gray-200 md:hidden" />
        {children}
      </div>
    </div>
  )
}
