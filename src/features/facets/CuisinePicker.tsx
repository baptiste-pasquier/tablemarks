import { useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronDown, ChevronUp, Check, Plus } from 'lucide-react'
import { cuisineAvatarBackground, cuisinePillTokens, emojiForCuisine } from './cuisines'
import { cuisineLabel } from './cuisineCatalog'
import { Button } from '../ui/Button'
import { ToggleChip } from '../ui/ToggleChip'
import { cn } from '../../lib/cn'

/**
 * Picks a place's cuisine: closed, it reads the way the list tile does — the avatar and the name
 * in its own color — with no "Cuisine" label, so a future category ("Bar", "Bakery") fits without
 * a rename. Open, every option is a pastel pill, one tap picks and closes, picking the chosen one
 * again clears it, and "Other…" takes a free-typed name — kept when focus leaves the field, so a
 * name typed without OK is not lost. Saving is the caller's: the detail modal writes on every
 * pick, the add form holds the value until it submits.
 */
export function CuisinePicker({
  value,
  options,
  onChange,
}: {
  value: string | null | undefined
  options: readonly string[]
  onChange: (cuisine: string | undefined) => void
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [typing, setTyping] = useState(false)
  const [custom, setCustom] = useState('')
  const optionsId = useId()
  const triggerRef = useRef<HTMLButtonElement>(null)
  const groupRef = useRef<HTMLDivElement>(null)
  const chosen = value?.trim() || undefined
  const name = cuisineLabel(chosen, t)

  function pick(next: string | undefined) {
    onChange(next)
    setOpen(false)
    setTyping(false)
    setCustom('')
  }

  function submitCustom() {
    const next = custom.trim()
    if (next) pick(next)
  }

  // Closing from the trigger is a cancel: the next opening starts from the options, not the draft.
  function toggle() {
    if (open) {
      setTyping(false)
      setCustom('')
    }
    setOpen(!open)
  }

  // Leaving the field keeps what was typed, without closing: collapsing the options under a
  // pointer on its way to "Add" would move the button before the click lands. Focus moving to
  // the trigger (a cancel) or within the options (a pick, OK) is left to those controls.
  function keepDraft(to: EventTarget | null) {
    if (to === triggerRef.current) return
    if (to instanceof Node && groupRef.current?.contains(to)) return
    const next = custom.trim()
    if (next) onChange(next)
  }

  return (
    <div>
      <button
        ref={triggerRef}
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-controls={open ? optionsId : undefined}
        aria-label={t('cuisinePicker.triggerAria', { name })}
        className="flex w-full items-center gap-3 rounded-[14px] bg-white py-2 pr-3 pl-2 text-left shadow-chip transition hover:bg-gray-50"
      >
        <span
          aria-hidden="true"
          className={cn(
            'grid h-10 w-10 shrink-0 place-items-center rounded-xl text-xl',
            !chosen && 'bg-white opacity-80 ring-[1.5px] ring-gray-300 grayscale ring-inset',
          )}
          style={chosen ? { background: cuisineAvatarBackground(chosen) } : undefined}
        >
          {emojiForCuisine(chosen)}
        </span>
        <span
          className={cn(
            'min-w-0 flex-1 truncate text-[15px] font-bold',
            !chosen && 'text-gray-600',
          )}
          style={chosen ? { color: cuisinePillTokens(chosen).color } : undefined}
        >
          {name}
        </span>
        <span className="inline-flex shrink-0 items-center gap-0.5 text-[13px] font-semibold text-brand-strong">
          {t(
            open ? 'cuisinePicker.close' : chosen ? 'cuisinePicker.change' : 'cuisinePicker.choose',
          )}
          {open ? (
            <ChevronUp size={16} aria-hidden="true" />
          ) : (
            <ChevronDown size={16} aria-hidden="true" />
          )}
        </span>
      </button>

      {open && (
        <div
          ref={groupRef}
          id={optionsId}
          role="group"
          aria-label={t('cuisinePicker.optionsAria')}
          className="mt-2.5 flex flex-wrap gap-1.5"
        >
          {options.map((option) => {
            const selected = option.toLowerCase() === chosen?.toLowerCase()
            const tokens = cuisinePillTokens(option)
            return (
              <ToggleChip
                key={option}
                shape="pill"
                active={selected}
                tint={tokens}
                onClick={() => pick(selected ? undefined : option)}
                className="max-w-full"
              >
                <span aria-hidden="true" className="shrink-0">
                  {emojiForCuisine(option)}
                </span>
                <span className="min-w-0 truncate">{option}</span>
                {selected && (
                  <Check size={14} strokeWidth={2.6} aria-hidden="true" className="shrink-0" />
                )}
              </ToggleChip>
            )
          })}
          {typing ? (
            <span className="flex w-full items-center gap-2">
              <input
                autoFocus
                value={custom}
                onChange={(e) => setCustom(e.target.value)}
                onBlur={(e) => keepDraft(e.relatedTarget)}
                onKeyDown={(e) => {
                  // Enter also confirms an input method's composition (Japanese, Chinese…): that
                  // one belongs to the IME, not to this field.
                  if (e.key === 'Enter' && !e.nativeEvent.isComposing) submitCustom()
                  // Cancels the typing only: without stopping it, Escape would also close the modal.
                  if (e.key === 'Escape') {
                    e.stopPropagation()
                    setTyping(false)
                  }
                }}
                aria-label={t('cuisinePicker.otherAria')}
                placeholder={t('cuisinePicker.otherPlaceholder')}
                className="min-w-0 flex-1 rounded-full border-[1.5px] border-gray-300 bg-white px-3.5 py-2 text-sm outline-none focus:border-brand focus:ring-3 focus:ring-brand/15"
              />
              <Button variant="primary" className="shrink-0" onClick={submitCustom}>
                {t('cuisinePicker.add')}
              </Button>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setTyping(true)}
              className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-1.5 text-[13px] font-semibold text-brand-strong ring-[1.5px] ring-brand/40 transition ring-inset hover:bg-brand-soft"
            >
              <Plus size={14} strokeWidth={2.4} aria-hidden="true" />
              {t('cuisinePicker.other')}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
