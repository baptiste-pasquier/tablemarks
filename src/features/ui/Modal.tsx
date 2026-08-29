import { useEffect, useRef, type ReactNode } from 'react'

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])'

// Browsers only let Tab reach a closed <details>'s own <summary>, not its hidden children, so any
// other FOCUSABLE_SELECTOR match nested inside a closed <details> isn't actually reachable via Tab.
function isReachable(el: HTMLElement): boolean {
  const closedDetails = el.closest('details:not([open])')
  if (!closedDetails) return true
  return el.tagName === 'SUMMARY' && el.parentElement === closedDetails
}

function getFocusables(panel: HTMLElement): HTMLElement[] {
  return Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(isReachable)
}

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
  // Keep the latest onClose in a ref so the effect depends on nothing that changes identity
  // every render (every caller passes an inline arrow) — otherwise it would tear down and
  // re-run on any unrelated re-render while open (e.g. a map pan or a background sync update),
  // stealing focus back to the panel's first focusable element mid-interaction.
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null
    if (panelRef.current) {
      getFocusables(panelRef.current)[0]?.focus()
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onCloseRef.current()
        return
      }
      if (e.key !== 'Tab' || !panelRef.current) return
      const focusables = getFocusables(panelRef.current)
      if (focusables.length === 0) return
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      const activeElement = document.activeElement as HTMLElement | null
      const activeIndex = activeElement ? focusables.indexOf(activeElement) : -1

      // The focused element was removed from the DOM (e.g. replaced by different controls after a
      // click) or was never one of the tracked focusables: focus has escaped the trap. Pull it back
      // in before falling through to the normal first/last wraparound checks below.
      if (activeIndex === -1) {
        e.preventDefault()
        if (e.shiftKey) {
          last.focus()
        } else {
          first.focus()
        }
        return
      }

      if (e.shiftKey && activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      previouslyFocused?.focus()
    }
  }, [])

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
