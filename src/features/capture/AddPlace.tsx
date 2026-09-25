import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronRight, Link2, MapPin } from 'lucide-react'
import { capturePaste, captureSearchPick, type CaptureResult } from '../../capture/capture'
import { searchPlaces, type GeoCandidate } from '../../capture/geocode'
import { updateRestaurant } from '../../data/restaurants'
import { useRestaurants } from '../useRestaurants'
import { useRankedCuisines } from '../facets/useRankedCuisines'
import { CuisinePicker } from '../facets/CuisinePicker'
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
  const options = useRankedCuisines(restaurants, true)

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

      <label className="block text-[13px] font-semibold text-gray-700" htmlFor="add-input">
        {t('capture.pasteLabel')}
      </label>
      {/* One line, not a textarea: a link or a name is a single line, and Enter can then submit. */}
      <div className="mt-1.5 flex items-center gap-2.5 rounded-[14px] border-[1.5px] border-gray-300 bg-white px-3.5 py-3 text-gray-600 transition focus-within:border-brand focus-within:ring-3 focus-within:ring-brand/15">
        <Link2 size={17} aria-hidden="true" className="shrink-0" />
        <input
          id="add-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            // Not while an input method is composing: that Enter confirms the characters.
            if (e.key === 'Enter' && !e.nativeEvent.isComposing && !busy) void submit()
          }}
          className="min-w-0 flex-1 bg-transparent text-sm text-gray-900 outline-none placeholder:text-gray-500"
          placeholder={t('capture.pastePlaceholder')}
        />
      </div>

      {/* Optional, and shows it by reading "Uncategorized" until something is picked. */}
      <div className="mt-3">
        <CuisinePicker value={cuisine} options={options} onChange={(c) => setCuisine(c ?? '')} />
      </div>

      <Button
        variant="primary"
        className="mt-4 w-full"
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
        <div className="mt-4">
          <p className="text-[13px] font-semibold text-gray-700">{t('capture.whichOne')}</p>
          <ul className="mt-2 space-y-2">
            {candidates.map((c, i) => (
              <li key={`${c.lat},${c.lng},${i}`}>
                <button
                  type="button"
                  onClick={() => void pick(c)}
                  className="flex w-full items-center gap-2.5 rounded-[14px] bg-white px-3 py-2.5 text-left shadow-card transition hover:bg-gray-50"
                >
                  <span
                    aria-hidden="true"
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-brand-soft text-brand-strong"
                  >
                    <MapPin size={16} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-bold text-gray-900">{c.name}</span>
                    {c.address && (
                      <span className="block truncate text-xs text-gray-600">{c.address}</span>
                    )}
                  </span>
                  <ChevronRight size={16} aria-hidden="true" className="shrink-0 text-gray-500" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Modal>
  )
}
