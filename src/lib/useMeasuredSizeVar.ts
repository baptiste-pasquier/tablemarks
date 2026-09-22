import { useLayoutEffect, type RefObject } from 'react'

export type MeasuredDimension = 'height' | 'width'

/**
 * Measures `ref`'s rendered size live (via ResizeObserver) and writes it to `document
 * .documentElement`'s `varName` CSS custom property. For elements whose size a hardcoded
 * `index.css` constant can't stand in for: the desktop filter overlay (grows with the cuisine
 * row's "+N autres" expansion) and the floating account controls (a sign-in button, an avatar, an
 * outage indicator — each a different width). Written straight to the DOM, not React state: a
 * ResizeObserver can fire on every frame during a resize, and only CSS consumers ever read these
 * values, so routing them through setState would re-render the whole tree on every tick.
 */
export function useMeasuredSizeVar(
  ref: RefObject<HTMLElement | null>,
  varName: string,
  dimension: MeasuredDimension = 'height',
) {
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const apply = (size: number) => {
      document.documentElement.style.setProperty(varName, `${size}px`)
    }
    // A forced layout read is the point of useLayoutEffect here: this call has to happen
    // synchronously before paint, before `observe()` below can report anything.
    const rect = el.getBoundingClientRect()
    apply(dimension === 'height' ? rect.height : rect.width)
    // No-op (rather than throwing) where ResizeObserver isn't available — the initial `apply()`
    // above still runs, it just won't track later resizes.
    if (typeof ResizeObserver === 'undefined') return
    // Reads the size the browser already computed for this notification, rather than forcing
    // another layout read via getBoundingClientRect() on every resize tick.
    const observer = new ResizeObserver(([entry]) => {
      const box = entry.borderBoxSize[0]
      apply(dimension === 'height' ? box.blockSize : box.inlineSize)
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [ref, varName, dimension])
}
