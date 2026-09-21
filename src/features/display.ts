import { Ban, Compass, Meh, RotateCcw, type LucideIcon } from 'lucide-react'
import { statusOf, translateStatus, type Restaurant, type Verdict } from '../types/models'

/**
 * A line icon per verdict, not an emoji. An emoji carries its own fixed colors, so on a solid
 * verdict fill it reads as a colored smudge rather than a symbol; a Lucide glyph is drawn in
 * `currentColor` and stays legible on any surface. Cuisines keep their emoji -- those sit on a
 * pastel pill, where the color is an asset.
 */
export const VERDICT_ICON: Record<Verdict, LucideIcon> = {
  go_back: RotateCcw,
  worth_a_detour: Compass,
  once_was_enough: Meh,
  never_again: Ban,
}

export function statusLabel(r: Restaurant): string {
  return translateStatus(statusOf(r))
}

/** The one status/verdict classification shared by every status/rollup/badge presentation. */
export type BadgeState =
  | { kind: 'pending' }
  | { kind: 'to_try' }
  | { kind: 'visited'; verdict: Verdict | null }

export function badgeState(
  r: Pick<Restaurant, 'pending' | 'visitCount' | 'latestVerdict'>,
): BadgeState {
  if (r.pending) return { kind: 'pending' }
  if (r.visitCount === 0) return { kind: 'to_try' }
  return { kind: 'visited', verdict: r.latestVerdict }
}
