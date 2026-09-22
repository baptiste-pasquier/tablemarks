import type { ReactNode } from 'react'

import { cn } from '../../lib/cn'

type BadgeProps = {
  text: string
  /**
   * A leading glyph: an emoji string for a cuisine, or a rendered icon element for a verdict.
   * Both are decorative -- the label beside them carries the meaning -- so this is wrapped in
   * `aria-hidden` either way.
   */
  icon?: ReactNode
  /**
   * Tinted-pill mode (light background/dark text + a leading color dot, e.g. the account
   * dropdown's sync-status chip) instead of the default solid-background/white-text mode. In
   * this mode `tone` supplies the *full* background+text pairing (already tinted) rather than
   * a solid surface color, and `dotClassName` supplies the leading dot's fill.
   */
  tint?: boolean
  dotClassName?: string
  /**
   * Classes for the text span alone, for a call site that needs the label responsive while the
   * pill itself stays visible — e.g. the header's backend indicator, which must not widen the
   * `shrink-0` right-hand group on a narrow viewport. Keeps that gate here rather than letting a
   * call site reach into this markup with a descendant selector.
   */
  labelClassName?: string
} &
  /**
   * Solid mode: Tailwind classes for the surface *and* its text color. The text color belongs
   * with the fill rather than being fixed to white here, because which one is readable depends
   * on the fill -- white on a verdict, gray-700 on a status's gray. See `VERDICT_BADGE_CLASS` and
   * `STATUS_PILL_CLASS` in `display.ts`.
   */
  (| { tone: string; pastel?: never }
    /**
     * Pastel mode: an explicit background/text pair, contrast-guaranteed by whoever computed it
     * (`cuisinePillTokens` for a cuisine). Replaces the former
     * `color` mode, which took one solid color and picked its text color by luminance — a
     * guess the hue system makes unnecessary.
     */
    | { pastel: { background: string; color: string }; tone?: never }
  )

/**
 * Shared badge primitive: exactly one of `tone` (Tailwind classes, for the closed status/verdict
 * set) or `pastel` (an explicit pair, for per-cuisine values) picks the surface and its text
 * color; both share the same size/padding/font so a future style change touches this file
 * instead of every call site.
 */
export function Badge({
  text,
  icon,
  tone,
  pastel,
  tint,
  dotClassName,
  labelClassName,
}: BadgeProps) {
  const style = pastel ? { background: pastel.background, color: pastel.color } : undefined
  const colorClass = tone ?? ''

  return (
    <span
      className={cn(
        // One size for every badge: at 11px with 2px of padding, a two-word verdict was the
        // hardest thing on the card to read, and the tinted variant was already at this size.
        'inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold',
        tint && 'shadow-sm transition',
        colorClass,
      )}
      style={style}
    >
      {tint && dotClassName && (
        <span aria-hidden="true" className={cn('h-2 w-2 rounded-full', dotClassName)} />
      )}
      {icon && <span aria-hidden="true">{icon}</span>}
      <span className={labelClassName}>{text}</span>
    </span>
  )
}
