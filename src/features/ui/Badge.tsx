type BadgeProps = {
  text: string
  icon?: string
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
export function Badge({ text, icon, tone, color }: BadgeProps) {
  const style = color ? { background: color, color: textColorFor(color) } : undefined
  const colorClass = tone ? `${tone} text-white` : ''

  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${colorClass}`}
      style={style}
    >
      {icon && <span aria-hidden="true">{icon}</span>}
      <span>{text}</span>
    </span>
  )
}
