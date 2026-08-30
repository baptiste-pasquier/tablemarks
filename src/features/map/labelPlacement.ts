/**
 * Pure, framework-agnostic label-placement algorithm underlying R1-R4: decides which
 * candidate restaurants get a visible name label on the map, given their screen-projected
 * positions and the current zoom-floor status.
 *
 * No Leaflet or DOM import here — text measurement is an injectable dependency
 * (see `measureTextWidthWithCanvas` below for the production default) so this module and its
 * tests never need a real `HTMLCanvasElement` 2D context.
 */

export interface LabelCandidate {
  id: string
  /** Screen-pixel x, already projected by the caller. */
  x: number
  /** Screen-pixel y, already projected by the caller. */
  y: number
  name: string
  /** True when an active filter excludes this restaurant (KTD5/R4) — pruned before placement. */
  dimmed: boolean
  /** Half the marker icon's on-screen size (px) — the label's real box is anchored off this, not off `x`/`y` directly (R3). */
  iconRadius: number
}

export interface ScreenPoint {
  x: number
  y: number
}

/** Measures the rendered width (px) of `text` set in `font`. Injectable so tests can stub it. */
export type MeasureTextWidth = (text: string, font: string) => number

export interface LabelPlacementOptions {
  /** Injectable text-width measurer (KTD4). Defaults to `measureTextWidthWithCanvas`. */
  measureTextWidth?: MeasureTextWidth
  /** CSS font string used for every label's width measurement. */
  font?: string
  /** Fixed label box height (px) used for collision checks. */
  labelHeight?: number
  /** Horizontal gap (px) between the icon's edge and the label's left edge — matches the rendered `margin-left`. */
  offsetX?: number
  /** Horizontal padding (px) applied on both sides of the measured text — matches the rendered `padding`. */
  paddingX?: number
}

// Font, height, offset and padding below are kept in lockstep with the label span's actual
// rendered CSS in MapView.tsx's `iconForColor` (font-size:11px, line-height:1.5, margin-left:6px,
// padding:1px 6px) so the collision geometry here matches what really paints on screen (R3).
const DEFAULT_FONT = '11px system-ui, sans-serif'
const DEFAULT_LABEL_HEIGHT = 19
const DEFAULT_OFFSET_X = 6
const DEFAULT_PADDING_X = 6

interface Box {
  left: number
  right: number
  top: number
  bottom: number
}

/**
 * Per-measurer width cache, keyed by `${font} ${name}` (KTD4: measure once per unique
 * name+font, then reuse). Keyed on the measurer function itself (not a module-level singleton)
 * so distinct injected stubs — e.g. one per test — never share or leak cached widths.
 */
const widthCaches = new WeakMap<MeasureTextWidth, Map<string, number>>()

function measureCached(measure: MeasureTextWidth, name: string, font: string): number {
  let cache = widthCaches.get(measure)
  if (!cache) {
    cache = new Map()
    widthCaches.set(measure, cache)
  }
  const key = `${font} ${name}`
  let width = cache.get(key)
  if (width === undefined) {
    width = measure(name, font)
    cache.set(key, width)
  }
  return width
}

/**
 * Models the label's real screen footprint (R3), not a box centered on the marker's raw point:
 * the rendered label sits to the right of the icon (`left:100%` plus `offsetX` margin) with
 * `paddingX` on both sides of the measured text, and is vertically centered on the icon's own
 * midpoint (`candidate.y - iconRadius`, since the marker's anchor point is the icon's bottom
 * edge per `iconAnchor:[size/2, size]`), not on `candidate.y` itself.
 */
function boxFor(
  candidate: LabelCandidate,
  width: number,
  height: number,
  offsetX: number,
  paddingX: number,
): Box {
  const left = candidate.x + candidate.iconRadius + offsetX
  const right = left + width + 2 * paddingX
  const verticalCenter = candidate.y - candidate.iconRadius
  return {
    left,
    right,
    top: verticalCenter - height / 2,
    bottom: verticalCenter + height / 2,
  }
}

function boxesOverlap(a: Box, b: Box): boolean {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom
}

function distanceSquared(p: ScreenPoint, center: ScreenPoint): number {
  const dx = p.x - center.x
  const dy = p.y - center.y
  return dx * dx + dy * dy
}

/**
 * Decide which candidates get a visible label.
 *
 * - Dimmed candidates are excluded up front and never occupy space (R4/KTD5).
 * - Below the zoom floor, nothing is shown (R2).
 * - Otherwise candidates are visited nearest-to-view-center first (ties broken by id, KTD6) and
 *   greedily accepted when their label box doesn't overlap an already-accepted box (R1/R3/KTD1).
 */
export function computeLabelPlacement(
  candidates: LabelCandidate[],
  viewCenter: ScreenPoint,
  zoomFloorMet: boolean,
  options: LabelPlacementOptions = {},
): Set<string> {
  if (!zoomFloorMet) return new Set()

  const {
    measureTextWidth = measureTextWidthWithCanvas,
    font = DEFAULT_FONT,
    labelHeight = DEFAULT_LABEL_HEIGHT,
    offsetX = DEFAULT_OFFSET_X,
    paddingX = DEFAULT_PADDING_X,
  } = options

  const eligible = candidates.filter((c) => !c.dimmed)

  const sorted = [...eligible].sort((a, b) => {
    const da = distanceSquared(a, viewCenter)
    const db = distanceSquared(b, viewCenter)
    if (da !== db) return da - db
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
  })

  const acceptedBoxes: Box[] = []
  const acceptedIds = new Set<string>()

  for (const candidate of sorted) {
    const width = measureCached(measureTextWidth, candidate.name, font)
    const box = boxFor(candidate, width, labelHeight, offsetX, paddingX)
    if (!acceptedBoxes.some((existing) => boxesOverlap(box, existing))) {
      acceptedBoxes.push(box)
      acceptedIds.add(candidate.id)
    }
  }

  return acceptedIds
}

/**
 * Production default measurer: a single offscreen `canvas.measureText()` call (KTD4).
 * Lives in its own export, separate from the pure algorithm above, so this is the only place
 * in this module that touches a DOM API — kept out of `computeLabelPlacement`'s own imports.
 */
let sharedCanvasContext: CanvasRenderingContext2D | null | undefined

export function measureTextWidthWithCanvas(text: string, font: string): number {
  if (sharedCanvasContext === undefined) {
    sharedCanvasContext = document.createElement('canvas').getContext('2d')
  }
  if (!sharedCanvasContext) return 0
  sharedCanvasContext.font = font
  return sharedCanvasContext.measureText(text).width
}
