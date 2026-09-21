import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'

type ToggleChipShape = 'segment' | 'pill'

// Exact active/hover/disabled class values preserved byte-for-byte from SortBar's `segmentClass`
// and FilterBar's local `Chip` (KTD4) — no new values invented, no KD1 (Button) reconciliation
// applied here.
function chipClass(shape: ToggleChipShape, active: boolean, disabled: boolean): string {
  if (shape === 'segment') {
    if (disabled) return 'min-h-10 px-3 py-1.5 text-xs font-medium text-gray-300 cursor-not-allowed'
    return `min-h-10 px-3 py-1.5 text-xs font-medium transition ${
      active ? 'bg-brand-soft font-semibold text-brand-strong' : 'text-gray-600 hover:bg-gray-50'
    }`
  }
  // Soft Pop is borderless: a chip separates from the page by its shadow, and an active chip by
  // its brand-soft fill. The former `border`/`border-brand` pair is gone, not merely recolored.
  return `inline-flex min-h-10 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs transition ${
    active
      ? 'bg-brand-soft font-semibold text-brand-strong shadow-sm'
      : 'bg-white text-gray-600 shadow-sm hover:bg-gray-50'
  }`
}

/**
 * Shared toggle-chip primitive (R5, KD4/KTD4): one component backs both SortBar's connected
 * segmented group and FilterBar's standalone cuisine/status/verdict pills, via a `shape` prop.
 *
 * `shape="segment"` renders only the button's own active/hover/disabled treatment — no
 * self-border or self-rounding. The connecting group chrome (the shared rounded pill wrapper and
 * the divider between SortBar's two segments) stays bespoke markup in `SortBar.tsx`, passed in via
 * `className` when needed, since that wrapper isn't duplicated anywhere else.
 *
 * `shape="pill"` renders the full standalone rounded, shadowed pill `FilterBar.tsx` uses today.
 * Content (a color dot, an icon, a label) is left entirely to `children` (KTD4) — cuisine chips
 * are its only slot-content consumer today, so nothing color/icon-shaped is hardcoded here.
 *
 * Callers keep owning `active`/`onClick` computation (KTD5) — e.g. FilterBar's lowercase-key
 * normalization stays at the call site, not in this component.
 */
export function ToggleChip({
  shape,
  active,
  disabled = false,
  onClick,
  className = '',
  children,
}: {
  shape: ToggleChipShape
  active: boolean
  disabled?: boolean
  onClick: () => void
  className?: string
  children: ReactNode
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      aria-pressed={active}
      onClick={onClick}
      className={cn(chipClass(shape, active, disabled), className)}
    >
      {children}
    </button>
  )
}
