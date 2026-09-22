import { Ban, Compass, Meh, RotateCcw, type LucideIcon } from 'lucide-react'
import {
  statusOf,
  translateStatus,
  type Restaurant,
  type RestaurantStatus,
  type Verdict,
} from '../types/models'

/**
 * Surface and text a verdict wears wherever it appears: the badge on a card, and the filter chip
 * once selected. A selected "worth a detour" chip in the brand color would say the opposite of what
 * it filters for, so the chip borrows the verdict's own color instead. The fills are deep enough
 * that white clears AA on all four -- `docs/reference/design-tokens.md` carries the figures.
 */
export const VERDICT_BADGE_CLASS: Record<Verdict, string> = {
  go_back: 'bg-verdict-go-back text-white',
  worth_a_detour: 'bg-verdict-detour text-white',
  once_was_enough: 'bg-verdict-once text-white',
  never_again: 'bg-verdict-never text-white',
}

/**
 * The same borrowing for the two plain statuses. "To try" wears the neutral pill its badge wears
 * on a tile — kept in step with `STATUS_PILL` in `StatusBadge.tsx`, which needs the same pair as
 * inline style values rather than classes. "Visited" has no badge of its own (a visited place
 * shows its verdict instead), so like a cuisine it takes the brand fill: `undefined` leaves
 * `ToggleChip` on its default.
 */
export const STATUS_CHIP_CLASS: Record<RestaurantStatus, string | undefined> = {
  to_try: 'bg-gray-200 text-gray-700',
  visited: undefined,
}

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
