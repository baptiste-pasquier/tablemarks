import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'

type ToggleChipShape = 'segment' | 'pill'

// Exact active/hover/disabled class values preserved byte-for-byte from SortBar's `segmentClass`
// and FilterBar's local `Chip` (KTD4) — no new values invented, no KD1 (Button) reconciliation
// applied here.
/**
 * What a selected pill wears when its caller does not name a color of its own: the same brand
 * green as the primary buttons, so "selected" reads as one idea across the app.
 */
const DEFAULT_ACTIVE_PILL = 'bg-brand text-white'

function chipClass(
  shape: ToggleChipShape,
  active: boolean,
  disabled: boolean,
  activeTone: string | undefined,
): string {
  if (shape === 'segment') {
    if (disabled) return 'min-h-10 px-3 py-1.5 text-xs font-medium text-gray-300 cursor-not-allowed'
    return `min-h-10 px-3 py-1.5 text-xs font-medium transition ${
      active ? 'bg-brand-soft font-semibold text-brand-strong' : 'text-gray-600 hover:bg-gray-50'
    }`
  }
  // Soft Pop is borderless, so relief tells a chip from the white card it sits on -- `shadow-chip`
  // is denser than a card's for that reason. Only the selected chip takes a fill, which is what
  // makes the selection findable among a dozen siblings; the pastel fill it replaced did not.
  return `inline-flex min-h-10 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs transition ${
    active
      ? `${activeTone ?? DEFAULT_ACTIVE_PILL} font-semibold shadow-chip`
      : 'bg-white text-gray-700 shadow-chip hover:bg-gray-50'
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
  activeTone,
  disabled = false,
  onClick,
  className = '',
  children,
}: {
  shape: ToggleChipShape
  active: boolean
  /**
   * Surface + text classes for the selected state, replacing the brand fill. A chip that filters
   * for a colored thing wears that thing's color when selected, so the row of verdict chips reads
   * as the badges it selects rather than as four identical green pills.
   */
  activeTone?: string
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
      className={cn(chipClass(shape, active, disabled, activeTone), className)}
    >
      {children}
    </button>
  )
}
