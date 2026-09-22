import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Trash2 } from 'lucide-react'
import { Button } from '../ui/Button'
import { removeRestaurant } from '../../data/restaurants'

// `cancelled` is `idle` plus one instruction: hand focus back to the delete button, which the
// confirmation replaced — otherwise backing out would drop focus on the page body.
type Step = 'idle' | 'confirming' | 'cancelled'

/**
 * The place-delete action at the foot of RestaurantDetail: a two-step confirm, because deleting a
 * place also tombstones every one of its visits and, once synced, reaches every device.
 *
 * Success is not reported: the detail sees the tombstone in the store, as it would a delete from
 * another device, and leaves. `onPendingChange` lets it refuse to close while the write runs, so a
 * failure always has this component still mounted to show it.
 */
export function DeleteRestaurant({
  restaurantId,
  name,
  visitCount,
  onPendingChange,
}: {
  restaurantId: string
  name: string
  visitCount: number
  onPendingChange: (pending: boolean) => void
}) {
  const { t } = useTranslation()
  const [step, setStep] = useState<Step>('idle')
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const confirmRef = useRef<HTMLButtonElement>(null)

  // Disabling the button during the write dropped its focus; give it back for the retry.
  useEffect(() => {
    if (failed) confirmRef.current?.focus()
  }, [failed])

  async function confirm() {
    setBusy(true)
    setFailed(false)
    onPendingChange(true)
    try {
      await removeRestaurant(restaurantId)
    } catch {
      setFailed(true)
      setBusy(false)
      onPendingChange(false)
    }
  }

  return (
    <div className="mt-5 border-t border-gray-200 pt-3">
      {step === 'confirming' ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3">
          {failed && (
            <p role="alert" className="mb-2 text-sm text-red-700">
              {t('visitDetail.errorDelete')}
            </p>
          )}
          <p className="text-sm font-semibold">
            {t('visitDetail.deleteConfirm', { name, count: visitCount })}
          </p>
          <p className="mt-0.5 text-xs text-gray-600">{t('visitDetail.deleteIrreversible')}</p>
          <div className="mt-3 flex gap-2">
            <Button
              ref={confirmRef}
              variant="danger"
              disabled={busy}
              onClick={() => void confirm()}
            >
              {t('visitDetail.deleteConfirmAction')}
            </Button>
            <Button
              variant="secondary"
              autoFocus
              disabled={busy}
              onClick={() => {
                setFailed(false)
                setStep('cancelled')
              }}
            >
              {t('visitDetail.deleteCancel')}
            </Button>
          </div>
        </div>
      ) : (
        <Button
          variant="menu-item"
          tone="destructive"
          autoFocus={step === 'cancelled'}
          onClick={() => setStep('confirming')}
        >
          <Trash2 size={16} aria-hidden="true" />
          {t('visitDetail.deletePlace')}
        </Button>
      )}
    </div>
  )
}
