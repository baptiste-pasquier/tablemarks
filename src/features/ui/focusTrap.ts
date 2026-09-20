// The focus-trap helpers `Modal` is built on, kept out of `Modal.tsx` because a module that
// exports both a component and plain functions loses React Fast Refresh (react-refresh/
// only-export-components). Other focus-trapping overlays reuse them — `AccountMenu`'s dropdown,
// KTD3 — so the wraparound logic has exactly one implementation.

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])'

// Browsers only let Tab reach a closed <details>'s own <summary>, not its hidden children, so any
// other FOCUSABLE_SELECTOR match nested inside a closed <details> isn't actually reachable via Tab.
function isReachable(el: HTMLElement): boolean {
  const closedDetails = el.closest('details:not([open])')
  if (!closedDetails) return true
  return el.tagName === 'SUMMARY' && el.parentElement === closedDetails
}

export function getFocusables(panel: HTMLElement): HTMLElement[] {
  return Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(isReachable)
}

/** Wraps Tab/Shift+Tab within `panel`'s focusable descendants — no-op for any other key. */
export function trapTabFocus(panel: HTMLElement, e: KeyboardEvent): void {
  if (e.key !== 'Tab') return
  const focusables = getFocusables(panel)
  if (focusables.length === 0) return
  const first = focusables[0]
  const last = focusables[focusables.length - 1]
  const active = document.activeElement as HTMLElement | null
  const activeIndex = active ? focusables.indexOf(active) : -1

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

  if (e.shiftKey && active === first) {
    e.preventDefault()
    last.focus()
  } else if (!e.shiftKey && active === last) {
    e.preventDefault()
    first.focus()
  }
}
