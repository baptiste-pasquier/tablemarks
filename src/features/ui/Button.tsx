import type { ButtonHTMLAttributes } from 'react'
import { cn } from '../../lib/cn'

type ButtonVariant = 'primary' | 'secondary' | 'link'
type ButtonSize = 'sm' | 'xs'

// Canonical brand-filled and neutral-pill styles (KD1/KTD1): every call site across App.tsx,
// AddPlace.tsx, DecidePanel.tsx, RestaurantDetail.tsx, PortabilityPanel.tsx and SortBar.tsx used to
// carry its own slightly-diverged copy of one of these two class strings (missing an active:
// state, a brand-tinted hover instead of the neutral one, a one-off padding scale, an ad hoc
// disabled:opacity-50). They now converge on exactly one definition per variant, including the
// disabled treatment (KTD2), so a future style change touches this file instead of five-plus call
// sites. `secondary`'s text size is kept out of this base string (see SECONDARY_TEXT_SIZE below).
// `link` covers the brand-underline text-buttons duplicated across AddPlace.tsx, DecidePanel.tsx
// and FilterBar.tsx (R1/KTD1); like `secondary`, its text size is kept out of this base string
// (see LINK_TEXT_SIZE below) rather than baked in here.
const VARIANT_STYLES: Record<ButtonVariant, string> = {
  primary:
    'rounded-xl bg-brand px-3 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-strong active:bg-brand-strong active:shadow-none disabled:opacity-50',
  secondary:
    'rounded-full border border-gray-300 px-3 py-1.5 font-medium transition hover:bg-gray-100 active:bg-gray-200 disabled:opacity-50',
  link: 'font-medium text-brand underline',
}

// SortBar's direction toggle sits beside its text-xs segment siblings and needs to match them,
// unlike every other secondary call site (App.tsx, RestaurantDetail), which uses the canonical
// text-sm. Kept as a separate token rather than embedded in VARIANT_STYLES.secondary so `cn` never
// has to override a same-property class already in the base (`cn` doesn't dedupe conflicting
// Tailwind classes; see src/lib/cn.ts) — `size` composes onto the base instead of colliding with it.
const SECONDARY_TEXT_SIZE: Record<ButtonSize, string> = {
  sm: 'text-sm',
  xs: 'text-xs',
}

// FilterBar's "clear all" link sits at a compact text-xs, while AddPlace's/DecidePanel's inline
// links sit inside an ancestor text-sm container. Kept as a separate token from VARIANT_STYLES.link
// for the same reason as SECONDARY_TEXT_SIZE above — `cn` doesn't dedupe conflicting Tailwind
// classes, so a text-size class can never be baked into the base string itself.
const LINK_TEXT_SIZE: Record<ButtonSize, string> = {
  sm: 'text-sm',
  xs: 'text-xs',
}

// Icon-only secondary sites (e.g. App.tsx's Settings trigger) need square icon padding instead of
// the text-pill's `px-3`/`text-sm` sizing. `cn` doesn't dedupe conflicting Tailwind classes (see
// src/lib/cn.ts), so this has to be a distinct base rather than a caller `className` override.
// `iconOnly` is typed as valid only alongside `variant: 'secondary'` (below) so a mismatched pair
// is a compile error instead of silently discarding `variant`.
const ICON_ONLY_SECONDARY =
  'rounded-full border border-gray-300 p-1.5 transition hover:bg-gray-100 active:bg-gray-200 disabled:opacity-50'

/**
 * Shared button primitive (R1/R2, KTD1): one `variant` selects the base class set, the native
 * `disabled` attribute gets the shared disabled treatment for both variants (KTD2), and any
 * caller `className` (layout-only classes like `w-full`/`mt-3`) merges in via `cn`.
 */
export function Button({
  variant,
  iconOnly = false,
  size = 'sm',
  className = '',
  ...rest
}: (
  | { variant: 'primary'; iconOnly?: false; size?: never }
  | { variant: 'secondary'; iconOnly?: boolean; size?: ButtonSize }
  | { variant: 'link'; iconOnly?: false; size?: ButtonSize }
) &
  ButtonHTMLAttributes<HTMLButtonElement>) {
  const base = iconOnly
    ? ICON_ONLY_SECONDARY
    : variant === 'secondary'
      ? cn(VARIANT_STYLES.secondary, SECONDARY_TEXT_SIZE[size])
      : variant === 'link'
        ? cn(VARIANT_STYLES.link, LINK_TEXT_SIZE[size])
        : VARIANT_STYLES.primary

  return <button type="button" className={cn(base, className)} {...rest} />
}
