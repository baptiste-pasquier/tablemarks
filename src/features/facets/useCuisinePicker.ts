import { useRef, useState } from 'react'
import { resolveCuisine, storedCuisine } from './cuisineCatalog'
import { splitRows, type RankedCuisine } from './cuisineRanking'

const PICKER_ROW_SIZE = 8

/**
 * The category picker's state: whether it is open, expanded past its top eight, taking a
 * free-typed name, and the draft of that name. Every exit resets what the next opening should not
 * inherit — a pick or a cancel from the trigger starts again from the top options, not the draft
 * or the expanded list.
 */
export function useCuisinePicker(
  value: string | null | undefined,
  options: readonly RankedCuisine[],
  onChange: (cuisine: string | undefined) => void,
) {
  const [open, setOpen] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [typing, setTyping] = useState(false)
  const [custom, setCustom] = useState('')
  const triggerRef = useRef<HTMLButtonElement>(null)
  const groupRef = useRef<HTMLDivElement>(null)
  // A value that names nothing ("_") reads as no choice, the same as the catalog reads it.
  const chosenKey = resolveCuisine(value)?.key
  const chosen = chosenKey ? value?.trim() : undefined
  // Not memoized: a few dozen options split in a blink, and a `useMemo` here fails
  // `react-hooks/preserve-manual-memoization` (the compiler cannot prove `chosenKey` stable).
  const { visible, overflow } = splitRows(
    options,
    new Set(chosenKey ? [chosenKey] : []),
    PICKER_ROW_SIZE,
  )

  function pick(next: string | undefined) {
    onChange(next)
    setOpen(false)
    setExpanded(false)
    setTyping(false)
    setCustom('')
  }

  function submitCustom() {
    const next = storedCuisine(custom)
    if (next) pick(next)
  }

  // Closing from the trigger is a cancel.
  function toggle() {
    if (open) {
      setTyping(false)
      setCustom('')
      setExpanded(false)
    }
    setOpen(!open)
  }

  // Leaving the field keeps what was typed, without closing: collapsing the options under a
  // pointer on its way to "Add" would move the button before the click lands. Focus moving to
  // the trigger (a cancel) or within the options (a pick, OK) is left to those controls.
  function keepDraft(to: EventTarget | null) {
    if (to === triggerRef.current) return
    if (to instanceof Node && groupRef.current?.contains(to)) return
    const next = storedCuisine(custom)
    if (next) onChange(next)
  }

  return {
    open,
    expanded,
    typing,
    custom,
    chosen,
    chosenKey,
    /** The options on screen: the top eight (current one pinned), or all of them once expanded. */
    shown: expanded ? options : visible,
    /** How many options the collapsed row hides; 0 when everything fits. */
    hiddenCount: overflow.length,
    triggerRef,
    groupRef,
    toggle,
    pick,
    submitCustom,
    keepDraft,
    setCustom,
    startTyping: () => setTyping(true),
    stopTyping: () => setTyping(false),
    toggleExpanded: () => setExpanded(!expanded),
  }
}
