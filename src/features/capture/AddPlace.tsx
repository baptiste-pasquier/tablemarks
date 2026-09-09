import { useId, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { capturePaste, captureSearchPick, type CaptureResult } from '../../capture/capture'
import { searchPlaces, type GeoCandidate } from '../../capture/geocode'
import { updateRestaurant } from '../../data/restaurants'
import { useRestaurants } from '../useRestaurants'
import { cuisineOptions } from '../facets/cuisines'
import { Modal } from '../ui/Modal'
import { ModalHeader } from '../ui/ModalHeader'
import { Button } from '../ui/Button'
import type { Restaurant } from '../../types/models'

/** Why a pasted short link was refused. Each reason gets its own lead sentence. */
type ShortLinkRefusal = 'absent' | 'unavailable' | 'unresolvable'

const REFUSAL_COPY = {
  absent: 'capture.shortLinkNeedsBackend',
  unavailable: 'capture.shortLinkBackendUnreachable',
  unresolvable: 'capture.shortLinkUnresolvable',
} as const satisfies Record<ShortLinkRefusal, string>

export function AddPlace({
  onClose,
  onOpenExisting,
}: {
  onClose: () => void
  onOpenExisting: (id: string) => void
}) {
  const { t } = useTranslation()
  const [input, setInput] = useState('')
  const [cuisine, setCuisine] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Held apart from `error` on purpose: this deployment will never resolve a short link, so the
  // message is guidance, not a fault to retry, and it must not wear the red error styling (R5).
  // Null when no short link was refused; otherwise why, because the two reasons need different
  // copy — one is a permanent property of this deployment, the other is an outage.
  const [shortLinkRefused, setShortLinkRefused] = useState<ShortLinkRefusal | null>(null)
  const [candidates, setCandidates] = useState<GeoCandidate[] | null>(null)
  const [duplicate, setDuplicate] = useState<Restaurant | null>(null)
  const restaurants = useRestaurants()
  const options = useMemo(() => cuisineOptions(restaurants), [restaurants])
  const cuisineListId = useId()

  // Exhaustive over CaptureResult: the `never` assignment makes a future variant a type error
  // here instead of silently falling through to the search branch.
  async function handle(result: CaptureResult) {
    switch (result.status) {
      case 'created':
      case 'provisional': {
        const c = cuisine.trim()
        // The place is already saved; the cuisine is a best-effort follow-up write. A failure here
        // must not surface as "couldn't add the place" or block closing — the place exists.
        if (c) await updateRestaurant(result.restaurant.id, { cuisine: c }).catch(() => {})
        onClose()
        return
      }
      case 'duplicate':
        setDuplicate(result.match)
        return
      case 'needs-search':
        await runSearch(result.query)
        return
      case 'needs-backend':
        setShortLinkRefused(result.reason)
        return
      case 'link-unresolvable':
        setShortLinkRefused('unresolvable')
        return
      default: {
        const unhandled: never = result
        throw new Error(`Unhandled capture result: ${JSON.stringify(unhandled)}`)
      }
    }
  }

  async function runSearch(query: string) {
    setBusy(true)
    setError(null)
    try {
      const found = await searchPlaces(query)
      setCandidates(found)
      if (found.length === 0) setError(t('capture.errorNoMatches'))
    } catch {
      setError(t('capture.errorSearchFailed'))
    } finally {
      setBusy(false)
    }
  }

  async function submit() {
    if (!input.trim()) return
    setBusy(true)
    setError(null)
    setDuplicate(null)
    setShortLinkRefused(null)
    try {
      await handle(await capturePaste(input))
    } catch {
      setError(t('capture.errorAdd'))
    } finally {
      setBusy(false)
    }
  }

  async function pick(candidate: GeoCandidate) {
    setBusy(true)
    try {
      await handle(await captureSearchPick(candidate))
    } catch {
      setError(t('capture.errorAdd'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal onClose={onClose} panelClassName="max-h-[90vh] overflow-y-auto">
      <ModalHeader title={t('capture.title')} onClose={onClose} />

      <label className="block text-sm text-gray-600" htmlFor="add-input">
        {t('capture.pasteLabel')}
      </label>
      <textarea
        id="add-input"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        rows={2}
        className="mt-1 w-full rounded-md border border-gray-300 p-2 text-sm"
        placeholder={t('capture.pastePlaceholder')}
      />

      <label className="mt-3 block text-sm text-gray-600" htmlFor="add-cuisine">
        {t('capture.cuisineLabel')} <span className="text-gray-400">{t('capture.optional')}</span>
      </label>
      <input
        id="add-cuisine"
        list={cuisineListId}
        value={cuisine}
        onChange={(e) => setCuisine(e.target.value)}
        className="mt-1 w-full rounded-md border border-gray-300 p-2 text-sm"
        placeholder={t('capture.cuisinePlaceholder')}
      />
      <datalist id={cuisineListId}>
        {options.map((o) => (
          <option key={o} value={o} />
        ))}
      </datalist>

      <Button
        variant="primary"
        className="mt-3 w-full"
        onClick={() => void submit()}
        disabled={busy || !input.trim()}
      >
        {busy ? t('capture.working') : t('capture.submit')}
      </Button>

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      {shortLinkRefused && (
        <div
          role="note"
          className="mt-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"
        >
          {/* Three different reasons, three different sentences. "This app runs without a server"
              is true of the demo and false of a private instance whose configuration failed to
              load — where the header is already showing "Server unreachable" a few centimetres
              away — and false again when the server answered and refused the link. The two
              alternatives below work in all three cases. */}
          <p>{t(REFUSAL_COPY[shortLinkRefused])}</p>
          <ul className="mt-1 list-disc pl-5">
            <li>{t('capture.shortLinkTrySearch')}</li>
            <li>{t('capture.shortLinkTryFullUrl')}</li>
          </ul>
        </div>
      )}

      {duplicate && (
        <div className="mt-3 rounded-md bg-brand-soft p-3 text-sm">
          <p>
            <strong>{duplicate.name}</strong> {t('capture.alreadySaved')}
          </p>
          <Button variant="link" className="mt-1" onClick={() => onOpenExisting(duplicate.id)}>
            {t('capture.openIt')}
          </Button>
        </div>
      )}

      {candidates && candidates.length > 0 && (
        <ul className="mt-3 divide-y divide-gray-100 border-t border-gray-100">
          {candidates.map((c, i) => (
            <li key={`${c.lat},${c.lng},${i}`}>
              <button
                type="button"
                onClick={() => void pick(c)}
                className="w-full px-1 py-2 text-left text-sm hover:bg-gray-50"
              >
                <span className="font-medium">{c.name}</span>
                {c.address && <span className="block text-xs text-gray-500">{c.address}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  )
}
