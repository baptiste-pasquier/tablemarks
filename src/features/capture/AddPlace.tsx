import { useId, useMemo, useState } from 'react'
import { capturePaste, captureSearchPick, type CaptureResult } from '../../capture/capture'
import { searchPlaces, type GeoCandidate } from '../../capture/geocode'
import { updateRestaurant } from '../../data/restaurants'
import { useRestaurants } from '../useRestaurants'
import { cuisineOptions } from '../facets/cuisines'
import { Modal } from '../ui/Modal'
import type { Restaurant } from '../../types/models'

export function AddPlace({
  onClose,
  onOpenExisting,
}: {
  onClose: () => void
  onOpenExisting: (id: string) => void
}) {
  const [input, setInput] = useState('')
  const [cuisine, setCuisine] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [candidates, setCandidates] = useState<GeoCandidate[] | null>(null)
  const [duplicate, setDuplicate] = useState<Restaurant | null>(null)
  const restaurants = useRestaurants()
  const options = useMemo(() => cuisineOptions(restaurants), [restaurants])
  const cuisineListId = useId()

  async function handle(result: CaptureResult) {
    if (result.status === 'created' || result.status === 'provisional') {
      const c = cuisine.trim()
      // The place is already saved; the cuisine is a best-effort follow-up write. A failure here
      // must not surface as "couldn't add the place" or block closing — the place exists.
      if (c) await updateRestaurant(result.restaurant.id, { cuisine: c }).catch(() => {})
      onClose()
    } else if (result.status === 'duplicate') {
      setDuplicate(result.match)
    } else {
      void runSearch(result.query)
    }
  }

  async function runSearch(query: string) {
    setBusy(true)
    setError(null)
    try {
      const found = await searchPlaces(query)
      setCandidates(found)
      if (found.length === 0) setError('No matching places found.')
    } catch {
      setError('Search failed. Try again.')
    } finally {
      setBusy(false)
    }
  }

  async function submit() {
    if (!input.trim()) return
    setBusy(true)
    setError(null)
    setDuplicate(null)
    try {
      await handle(await capturePaste(input))
    } catch {
      setError('Could not add that place.')
    } finally {
      setBusy(false)
    }
  }

  async function pick(candidate: GeoCandidate) {
    setBusy(true)
    try {
      await handle(await captureSearchPick(candidate))
    } catch {
      setError('Could not add that place.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal onClose={onClose} panelClassName="max-h-[90vh] overflow-y-auto">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-semibold">Add a place</h2>
        <button type="button" onClick={onClose} aria-label="Close" className="text-gray-400 hover:text-gray-600">
          ✕
        </button>
      </div>

      <label className="block text-sm text-gray-600" htmlFor="add-input">
        Paste a Google Maps link, or type a place name
      </label>
      <textarea
        id="add-input"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        rows={2}
        className="mt-1 w-full rounded-md border border-gray-300 p-2 text-sm"
        placeholder="https://maps.app.goo.gl/…  or  Chez Marcel Paris"
      />

      <label className="mt-3 block text-sm text-gray-600" htmlFor="add-cuisine">
        Cuisine <span className="text-gray-400">(optional)</span>
      </label>
      <input
        id="add-cuisine"
        list={cuisineListId}
        value={cuisine}
        onChange={(e) => setCuisine(e.target.value)}
        className="mt-1 w-full rounded-md border border-gray-300 p-2 text-sm"
        placeholder="e.g. Italian, Ramen…"
      />
      <datalist id={cuisineListId}>
        {options.map((o) => (
          <option key={o} value={o} />
        ))}
      </datalist>

      <button
        type="button"
        onClick={() => void submit()}
        disabled={busy || !input.trim()}
        className="mt-3 w-full rounded-md bg-brand px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {busy ? 'Working…' : 'Add'}
      </button>

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      {duplicate && (
        <div className="mt-3 rounded-md bg-brand-soft p-3 text-sm">
          <p>
            <strong>{duplicate.name}</strong> is already saved.
          </p>
          <button
            type="button"
            onClick={() => onOpenExisting(duplicate.id)}
            className="mt-1 font-medium text-brand underline"
          >
            Open it
          </button>
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
