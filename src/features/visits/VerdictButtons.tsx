import { Button } from '../ui/Button'
import { VERDICT_ICON } from '../display'
import { VERDICTS, translateVerdict, type Verdict } from '../../types/models'

/** One button per verdict — the picker behind both "I'm here now" and "Add a past visit". */
export function VerdictButtons({
  onPick,
  disabled,
}: {
  onPick: (v: Verdict) => void
  disabled?: boolean
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {/* Each button sits on its own white backing: disabled, a button drops to half opacity, and on
          the tinted "add a past visit" panel that let the orange show through it. */}
      {VERDICTS.map((v) => {
        const Icon = VERDICT_ICON[v]
        return (
          <span key={v} className="rounded-full bg-white">
            <Button
              variant="secondary"
              className="inline-flex items-center gap-1.5"
              disabled={disabled}
              onClick={() => onPick(v)}
            >
              <Icon size={14} strokeWidth={2.4} aria-hidden="true" />
              {translateVerdict(v)}
            </Button>
          </span>
        )
      })}
    </div>
  )
}
