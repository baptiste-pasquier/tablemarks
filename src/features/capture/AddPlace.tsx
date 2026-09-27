import { useTranslation } from 'react-i18next'
import { Link2, Map as MapIcon } from 'lucide-react'
import { CandidateList } from './CandidateList'
import { DraftPreview } from './DraftPreview'
import { useAddPlace, type AddPlaceError, type ShortLinkRefusal } from './useAddPlace'
import { useRestaurants } from '../useRestaurants'
import { useRankedCuisines } from '../facets/useRankedCuisines'
import { CuisinePicker } from '../facets/CuisinePicker'
import { Modal } from '../ui/Modal'
import { ModalHeader } from '../ui/ModalHeader'
import { Button } from '../ui/Button'

// Three different reasons, three different sentences. "This app runs without a server" is true
// of the demo and false of a private instance whose configuration failed to load — where the
// header is already saying it is unreachable a few centimetres away — and false again when the
// server answered and refused the link. The two alternatives below work in all three cases.
const REFUSAL_COPY = {
  absent: 'capture.shortLinkNeedsBackend',
  unavailable: 'capture.shortLinkBackendUnreachable',
  unresolvable: 'capture.shortLinkUnresolvable',
} as const satisfies Record<ShortLinkRefusal, string>

const ERROR_COPY = {
  noMatches: 'capture.errorNoMatches',
  searchFailed: 'capture.errorSearchFailed',
  add: 'capture.errorAdd',
} as const satisfies Record<AddPlaceError, string>

export function AddPlace({
  onClose,
  onOpenExisting,
}: {
  onClose: () => void
  onOpenExisting: (id: string) => void
}) {
  const { t } = useTranslation()
  const form = useAddPlace(onClose)
  const restaurants = useRestaurants()
  const options = useRankedCuisines(restaurants, true)
  const duplicate = form.duplicate

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
          value={form.input}
          onChange={(e) => form.setInput(e.target.value)}
          onKeyDown={(e) => {
            // Not while an input method is composing: that Enter confirms the characters.
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) void form.submit()
          }}
          // While a commit is in flight, the running request already closed over the draft it is
          // saving — a fresh edit here would only invalidate it, not stop it (review #1).
          readOnly={form.committing}
          className="min-w-0 flex-1 bg-transparent text-sm text-gray-900 outline-none placeholder:text-gray-500"
          placeholder={t('capture.pastePlaceholder')}
        />
      </div>

      {form.candidates && form.candidates.length > 0 && (
        <CandidateList
          candidates={form.candidates}
          selected={form.selected}
          onSelect={form.select}
        />
      )}
      {form.draft && !form.selected && (
        <DraftPreview draft={form.draft} onReject={form.rejectMatch} disabled={form.busy} />
      )}

      {/* The category is asked once the place is known, pre-filled with what OSM says. */}
      {form.draft && (
        <div className="mt-4">
          <CuisinePicker value={form.cuisine} options={options} onChange={form.setCuisine} />
          {form.suggested && (
            <p className="mt-1.5 ml-1 flex items-center gap-1 text-xs text-gray-600">
              <MapIcon size={13} aria-hidden="true" />
              {t('capture.suggestedByOsm')}
            </p>
          )}
        </div>
      )}

      <Button
        variant="primary"
        className="mt-4 w-full"
        onClick={() => void form.submit()}
        disabled={form.busy || !form.input.trim()}
      >
        {form.busy ? t('capture.working') : form.draft ? t('capture.submit') : t('capture.search')}
      </Button>

      {form.error && <p className="mt-2 text-sm text-red-600">{t(ERROR_COPY[form.error])}</p>}

      {form.refusal && (
        <div
          role="note"
          className="mt-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"
        >
          {/* Three reasons, three sentences (see REFUSAL_COPY); the two alternatives below work in
              all three cases. */}
          <p>{t(REFUSAL_COPY[form.refusal])}</p>
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
    </Modal>
  )
}
