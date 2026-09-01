import { cn } from '../../lib/cn'

type BadgeProps = {
  text: string
  icon?: string
  /**
   * Tinted-pill mode (light background/dark text + a leading color dot, e.g. the account
   * dropdown's sync-status chip) instead of the default solid-background/white-text mode. In
   * this mode `tone`/`color` supply the *full* background+text pairing (already tinted) rather
   * than a solid surface color, and `dotClassName` supplies the leading dot's fill.
   */
  tint?: boolean
  dotClassName?: string
} & ({ tone: string; color?: never } | { color: string; tone?: never })

function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16)
  const channel = (c: number) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255)
}

/**
 * White or near-black text for a solid color-mode surface, picked from the relative-luminance
 * crossover point where black-on-color and white-on-color contrast ratios are equal — curated
 * and hashed colors (e.g. per-cuisine) span too wide a luminance range for one fixed text color
 * (KTD3).
 */
function textColorFor(bgHex: string): string {
  return luminance(bgHex) > 0.179 ? '#000000' : '#ffffff'
}

/**
 * Shared badge primitive (R3/R4, KTD3): exactly one of `tone` (a Tailwind class, for the closed
 * status/verdict set — fixed white text) or `color` (a raw CSS color, for per-cuisine values —
 * text color computed internally via the same luminance rule) picks the surface; both share the
 * same size/padding/font so a future style change touches this file instead of every call site.
 */
export function Badge({ text, icon, tone, color, tint, dotClassName }: BadgeProps) {
  const style = !tint && color ? { background: color, color: textColorFor(color) } : undefined
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
      {tint && dotClassName && <span aria-hidden="true" className={cn('h-2 w-2 rounded-full', dotClassName)} />}
      {icon && <span aria-hidden="true">{icon}</span>}
      <span>{text}</span>
    </span>
  )
}
