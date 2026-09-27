import { useEffect, useRef, type ReactNode } from 'react'
import { getFocusables, trapTabFocus } from './focusTrap'

/**
 * Shared shell for every modal-style panel (R15/KTD2): a bottom sheet with rounded top corners
 * and a drag indicator below the `md` breakpoint, centered at or above it. Tapping the backdrop
 * or pressing Escape closes it; focus moves into the panel on open and returns to whatever
 * triggered it on close.
 *
 * Default z-index (`--z-modal`, index.css) sits above the mobile List/Map nav (`--z-nav` in
 * App.tsx) — a modal must cover that nav when open, not render underneath it. `--z-nav` itself
 * sits above Leaflet's own highest internal z-index (1000, its attribution control) so the map,
 * which fills its pane fully with no reserved gap, can never draw on top of the nav either.
 * `DecidePanel` deliberately stays 100 above this default (`--z-modal-elevated`).
 *
 * `initialFocus` (default `'auto'`) picks what receives focus on open: `'auto'` focuses the
 * panel's first focusable descendant, safe for every caller that renders a `ModalHeader` (its
 * close button) first. A caller with no such safe leading control — content that starts with a
 * state-mutating action, e.g. the mobile filters sheet's first cuisine chip — passes `'panel'`
 * instead, which focuses the (inert, `tabIndex={-1}`) panel container itself so opening the
 * modal never fires an unintended action.
 */
export function Modal({
  onClose,
  children,
  label,
  zIndexClassName = 'z-[var(--z-modal)]',
  panelClassName = '',
  initialFocus = 'auto',
}: {
  onClose: () => void
  children: ReactNode
  /** The dialog's accessible name (aria-label): every caller's own visible title, so a
   *  screen-reader user hears which dialog opened rather than just "dialog". Required, not
   *  optional, so a new call site can't ship a nameless one (axe rule aria-dialog-name). Not
   *  aria-labelledby: Settings renders two ModalHeaders (Settings + PortabilityPanel) and the
   *  mobile filters sheet has no header at all, so an id-linking scheme would be ambiguous or
   *  absent. */
  label: string
  zIndexClassName?: string
  panelClassName?: string
  initialFocus?: 'auto' | 'panel'
}) {
  const panelRef = useRef<HTMLDivElement>(null)
  // Keep the latest onClose in a ref so the effect depends on nothing that changes identity
  // every render (every caller passes an inline arrow) — otherwise it would tear down and
  // re-run on any unrelated re-render while open (e.g. a map pan or a background sync update),
  // stealing focus back to the panel's first focusable element mid-interaction.
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  // Same reasoning as onCloseRef: read the latest value without adding it to the effect's deps.
  const initialFocusRef = useRef(initialFocus)
  initialFocusRef.current = initialFocus

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null
    if (panelRef.current) {
      if (initialFocusRef.current === 'panel') {
        panelRef.current.focus()
      } else {
        getFocusables(panelRef.current)[0]?.focus()
      }
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onCloseRef.current()
        return
      }
      if (!panelRef.current) return
      trapTabFocus(panelRef.current, e)
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
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className={`w-full rounded-t-card bg-white p-5 shadow-xl outline-none md:max-w-md md:rounded-card ${panelClassName}`}
      >
        <div
          aria-hidden="true"
          className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-gray-200 md:hidden"
        />
        {children}
      </div>
    </div>
  )
}
