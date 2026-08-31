import type { ButtonHTMLAttributes } from 'react'
import { cn } from '../../lib/cn'

type ButtonVariant = 'primary' | 'secondary' | 'link' | 'icon-dismiss'
type ButtonSize = 'sm' | 'xs'
type ButtonTone = 'neutral' | 'destructive' | 'toast'

// icon-dismiss has its own base (ICON_DISMISS_BASE below) composed with a tone, so it's excluded
// from this Record rather than given a placeholder entry here.
type StyledVariant = Exclude<ButtonVariant, 'icon-dismiss'>

// Canonical brand-filled and neutral-pill styles (KD1/KTD1): every call site across App.tsx,
// AddPlace.tsx, DecidePanel.tsx, RestaurantDetail.tsx, PortabilityPanel.tsx and SortBar.tsx used to
// carry its own slightly-diverged copy of one of these two class strings (missing an active:
// state, a brand-tinted hover instead of the neutral one, a one-off padding scale, an ad hoc
// disabled:opacity-50). They now converge on exactly one definition per variant, including the
// disabled treatment (KTD2), so a future style change touches this file instead of five-plus call
// sites. `secondary`'s text size is kept out of this base string (see TEXT_SIZE below).
// `link` covers the brand-underline text-buttons duplicated across AddPlace.tsx, DecidePanel.tsx
// and FilterBar.tsx (R1/KTD1); like `secondary`, its text size is kept out of this base string
// (see TEXT_SIZE below) rather than baked in here.
const VARIANT_STYLES: Record<StyledVariant, string> = {
  primary:
    'rounded-xl bg-brand px-3 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-strong active:bg-brand-strong active:shadow-none disabled:opacity-50',
  secondary:
    'rounded-full border border-gray-300 px-3 py-1.5 font-medium transition hover:bg-gray-100 active:bg-gray-200 disabled:opacity-50',
  link: 'font-medium text-brand underline',
}

// SortBar's direction toggle sits beside its text-xs segment siblings and needs to match them
// (secondary), and FilterBar's "clear all" link sits at a compact text-xs while AddPlace's/
// DecidePanel's inline links sit inside an ancestor text-sm container (link) — both variants share
// this one size token rather than baking a text-size class into their own base string, so `cn`
// never has to override a same-property class already in the base (`cn` doesn't dedupe conflicting
// Tailwind classes; see src/lib/cn.ts) — `size` composes onto the base instead of colliding with it.
const TEXT_SIZE: Record<ButtonSize, string> = {
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

// The three "✕" dismiss buttons (ModalHeader, RestaurantDetail's delete-visit action,
// ReloadPrompt's toast dismiss) used to each carry their own copy of this base plus a
// slightly-diverged hover color. `tone` is kept out of this base string for the same reason
// TEXT_SIZE is kept out of secondary/link's: `cn` doesn't dedupe conflicting
// Tailwind classes, so exactly one tone's hover class must be selected rather than baked in here.
// No padding/border here — ModalHeader/RestaurantDetail need none, and ReloadPrompt layers its own
// `rounded-full p-1` on via caller `className` (a property this base never sets, so it's safe).
const ICON_DISMISS_BASE = 'text-gray-400 transition'

// `neutral` matches ModalHeader's close button, `destructive` matches RestaurantDetail's
// delete-visit action, and `toast` matches ReloadPrompt's dismiss (which also needs an
// `active:` state to match its dark toast background, unlike the other two tones).
const TONE_HOVER: Record<ButtonTone, string> = {
  neutral: 'hover:text-gray-600',
  destructive: 'hover:text-red-600',
  toast: 'hover:text-white active:text-white',
}

/**
 * Shared button primitive (R1/R2, KTD1): one `variant` selects the base class set, the native
 * `disabled` attribute gets the shared disabled treatment for both variants (KTD2), and any
 * caller `className` (layout-only classes like `w-full`/`mt-3`) merges in via `cn`.
 */
export function Button({
  variant,
  iconOnly = false,
  size = 'sm',
  tone,
  className = '',
  ...rest
}: (
  | { variant: 'primary'; iconOnly?: false; size?: never; tone?: never }
  | { variant: 'secondary'; iconOnly?: boolean; size?: ButtonSize; tone?: never }
  | { variant: 'link'; iconOnly?: false; size?: ButtonSize; tone?: never }
  | { variant: 'icon-dismiss'; iconOnly?: false; size?: never; tone: ButtonTone }
) &
  ButtonHTMLAttributes<HTMLButtonElement>) {
  let base: string
  if (iconOnly) {
    base = ICON_ONLY_SECONDARY
  } else {
    switch (variant) {
      case 'secondary':
        base = cn(VARIANT_STYLES.secondary, TEXT_SIZE[size])
        break
      case 'link':
        base = cn(VARIANT_STYLES.link, TEXT_SIZE[size])
        break
      case 'icon-dismiss':
        base = cn(ICON_DISMISS_BASE, TONE_HOVER[tone])
        break
      default:
        base = VARIANT_STYLES.primary
    }
  }

  return <button type="button" className={cn(base, className)} {...rest} />
}
