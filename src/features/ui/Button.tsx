import type { ButtonHTMLAttributes } from 'react'
import { cn } from '../../lib/cn'

type ButtonVariant = 'primary' | 'secondary'

// Canonical brand-filled and neutral-pill styles (KD1/KTD1): every call site across App.tsx,
// AddPlace.tsx, DecidePanel.tsx, RestaurantDetail.tsx, PortabilityPanel.tsx and SortBar.tsx used to
// carry its own slightly-diverged copy of one of these two class strings (missing an active:
// state, a brand-tinted hover instead of the neutral one, a one-off padding scale, an ad hoc
// disabled:opacity-50). They now converge on exactly one definition per variant, including the
// disabled treatment (KTD2), so a future style change touches this file instead of five-plus call
// sites.
const VARIANT_STYLES: Record<ButtonVariant, string> = {
  primary:
    'rounded-xl bg-brand px-3 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-strong active:bg-brand-strong active:shadow-none disabled:opacity-50',
  secondary:
    'rounded-full border border-gray-300 px-3 py-1.5 text-sm font-medium transition hover:bg-gray-100 active:bg-gray-200 disabled:opacity-50',
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
  className = '',
  ...rest
}: (
  | { variant: 'primary'; iconOnly?: false }
  | { variant: 'secondary'; iconOnly?: boolean }
) &
  ButtonHTMLAttributes<HTMLButtonElement>) {
  const base = iconOnly ? ICON_ONLY_SECONDARY : VARIANT_STYLES[variant]

  return <button type="button" className={cn(base, className)} {...rest} />
}
