import { cn } from '../../lib/cn'

type BadgeProps = {
  text: string
  icon?: string
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
} & (
  | { tone: string; pastel?: never }
  /**
   * Pastel mode: an explicit background/text pair, contrast-guaranteed by whoever computed it
   * (`cuisinePillTokens` for a cuisine, a fixed gray pair for a status). Replaces the former
   * `color` mode, which took one solid color and picked its text color by luminance — a
   * guess the hue system makes unnecessary.
   */
  | { pastel: { background: string; color: string }; tone?: never }
)

/**
 * Shared badge primitive: exactly one of `tone` (a Tailwind class, for the closed status/verdict
 * set — fixed white text) or `pastel` (an explicit pair, for per-cuisine values) picks the
 * surface; both share the same size/padding/font so a future style change touches this file
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
  const colorClass = tint ? (tone ?? '') : tone ? `${tone} text-white` : ''

  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-full font-semibold',
        tint ? 'px-2.5 py-1 text-xs shadow-sm transition' : 'px-2 py-0.5 text-[11px]',
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
