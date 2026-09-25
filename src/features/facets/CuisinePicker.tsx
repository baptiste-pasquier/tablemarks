import { useId } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronDown, ChevronUp, Check, Plus } from 'lucide-react'
import { cuisineAvatarBackground, cuisinePillTokens, emojiForCuisine } from './cuisines'
import { cuisineLabel } from './cuisineCatalog'
import { useCuisinePicker } from './useCuisinePicker'
import type { RankedCuisine } from './cuisineRanking'
import { Button } from '../ui/Button'
import { ToggleChip } from '../ui/ToggleChip'
import { cn } from '../../lib/cn'

/**
 * Picks a place's category: closed, it reads the way the list tile does — the avatar and the name
 * in its own color, in the reader's language — with no "Cuisine" label, since a category may as
 * well be a bar or a bakery. Open, every option is a pastel pill ranked by use — the top eight,
 * the current one always among them, then "+N more" — and one tap picks and closes, picking the
 * chosen one again clears it, and "Other…" takes a free-typed name (saved as a curated key when it
 * names one, in either language) — kept when focus leaves the field, so a name typed without OK
 * is not lost. Saving is the caller's: the detail modal writes on every pick, the add form holds
 * the value until it submits.
 */
export function CuisinePicker({
  value,
  options,
  onChange,
}: {
  value: string | null | undefined
  options: readonly RankedCuisine[]
  onChange: (cuisine: string | undefined) => void
}) {
  const { t } = useTranslation()
  const optionsId = useId()
  const {
    open,
    expanded,
    typing,
    custom,
    chosen,
    chosenKey,
    shown,
    hiddenCount,
    triggerRef,
    groupRef,
    toggle,
    pick,
    submitCustom,
    keepDraft,
    setCustom,
    startTyping,
    stopTyping,
    toggleExpanded,
  } = useCuisinePicker(value, options, onChange)
  const name = cuisineLabel(chosen, t)

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
          {shown.map((option) => {
            const selected = option.key === chosenKey
            const tokens = cuisinePillTokens(option.value)
            return (
              <ToggleChip
                key={option.key}
                shape="pill"
                active={selected}
                tint={tokens}
                onClick={() => pick(selected ? undefined : option.value)}
                className="max-w-full"
              >
                <span aria-hidden="true" className="shrink-0">
                  {emojiForCuisine(option.value)}
                </span>
                <span className="min-w-0 truncate">{option.label}</span>
                {selected && (
                  <Check size={14} strokeWidth={2.6} aria-hidden="true" className="shrink-0" />
                )}
              </ToggleChip>
            )
          })}
          {hiddenCount > 0 && (
            <Button
              type="button"
              variant="secondary"
              size="xs"
              aria-expanded={expanded}
              aria-controls={optionsId}
              onClick={toggleExpanded}
            >
              {expanded
                ? t('cuisinePicker.showLess')
                : t('cuisinePicker.showMore', { count: hiddenCount })}
            </Button>
          )}
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
                    stopTyping()
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
              onClick={startTyping}
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
