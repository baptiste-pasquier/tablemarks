import { useRef, useState } from 'react'
import {
  capturePaste,
  commitCapture,
  draftFromCandidate,
  withoutMatch,
  type CaptureResult,
  type CommitResult,
  type PlaceDraft,
} from '../../capture/capture'
import { searchPlaces, type GeoCandidate } from '../../capture/geocode'
import { suggestCategory } from '../facets/osmCategory'
import type { Restaurant } from '../../types/models'

/** Why a pasted short link was refused. Each reason gets its own lead sentence. */
export type ShortLinkRefusal = 'absent' | 'unavailable' | 'unresolvable'

/** Which failure the form reports. A code, not copy: the view translates it. */
export type AddPlaceError = 'noMatches' | 'searchFailed' | 'add'

/**
 * The add modal's state: input → results or a link preview → category → add. Nothing is saved
 * until "Add"; any edit to the input drops what was identified, so "Add" never saves a place for
 * text that no longer names it.
 */
export function useAddPlace(onAdded: () => void) {
  const [input, setInputValue] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<AddPlaceError | null>(null)
  // Held apart from `error` on purpose: it is guidance, not a fault to retry (R5).
  const [refusal, setRefusal] = useState<ShortLinkRefusal | null>(null)
  const [duplicate, setDuplicate] = useState<Restaurant | null>(null)
  const [candidates, setCandidates] = useState<GeoCandidate[] | null>(null)
  const [selected, setSelected] = useState<GeoCandidate | null>(null)
  const [draft, setDraft] = useState<PlaceDraft | null>(null)
  const [cuisine, setCuisineValue] = useState('')
  // Set once the user picks a category: from then on a suggestion never overwrites it.
  const [cuisineTouched, setCuisineTouched] = useState(false)
  // Bumped on every input edit and at the start of every submit: a request whose id no longer
  // matches this ref once its await settles is stale (superseded by an edit or a later submit),
  // and its result — including an error, or `onAdded` — is dropped rather than written.
  const requestId = useRef(0)

  function suggest(match: GeoCandidate | undefined) {
    if (!cuisineTouched) setCuisineValue(match ? (suggestCategory(match) ?? '') : '')
  }

  function setInput(value: string) {
    // Invalidates any in-flight request (its result lands under text it no longer describes) and
    // ends the wait from the user's point of view — the stale request's own `finally` will see it
    // has been superseded and leave `busy` alone.
    requestId.current += 1
    setInputValue(value)
    setBusy(false)
    setCandidates(null)
    setSelected(null)
    setDraft(null)
    setDuplicate(null)
    setRefusal(null)
    setError(null)
    // A manually chosen category belongs to the place identified for the text it was chosen
    // under; new text starts over with whatever the next match suggests.
    setCuisineValue('')
    setCuisineTouched(false)
  }

  function select(candidate: GeoCandidate) {
    setSelected(candidate)
    setDraft(draftFromCandidate(candidate))
    setDuplicate(null)
    suggest(candidate)
  }

  function rejectMatch() {
    if (!draft) return
    setDraft(withoutMatch(draft))
    suggest(undefined)
  }

  function setCuisine(value: string | undefined) {
    setCuisineTouched(true)
    setCuisineValue(value ?? '')
  }

  async function search(query: string, id: number) {
    try {
      const found = await searchPlaces(query)
      if (requestId.current !== id) return
      setCandidates(found)
      if (found.length === 0) setError('noMatches')
    } catch {
      if (requestId.current !== id) return
      setError('searchFailed')
    }
  }

  // Exhaustive over CaptureResult: the `never` assignment makes a future variant a type error.
  async function handle(result: CaptureResult, id: number) {
    switch (result.status) {
      case 'preview':
        setDraft(result.draft)
        suggest(result.draft.match)
        return
      case 'duplicate':
        setDuplicate(result.match)
        return
      case 'needs-search':
        await search(result.query, id)
        return
      case 'needs-backend':
        setRefusal(result.reason)
        return
      case 'link-unresolvable':
        setRefusal('unresolvable')
        return
      default: {
        const unhandled: never = result
        throw new Error(`Unhandled capture result: ${JSON.stringify(unhandled)}`)
      }
    }
  }

  function finish(result: CommitResult) {
    if (result.status === 'duplicate') setDuplicate(result.match)
    else onAdded()
  }

  async function submit() {
    if (busy || !input.trim()) return
    const id = (requestId.current += 1)
    // Read before the await: whether this request commits a draft or starts a search, for the
    // catch below — and unaffected by whatever the input becomes while this request is in flight.
    const hadDraft = draft !== null
    setBusy(true)
    setError(null)
    setDuplicate(null)
    setRefusal(null)
    try {
      if (draft) {
        const result = await commitCapture(draft, cuisine.trim() || undefined)
        if (requestId.current !== id) return
        finish(result)
      } else {
        const result = await capturePaste(input)
        if (requestId.current !== id) return
        await handle(result, id)
      }
    } catch {
      if (requestId.current !== id) return
      setError(hadDraft ? 'add' : 'searchFailed')
    } finally {
      // A stale request must not clear `busy` for a newer one already in flight; `setInput`
      // already cleared it for the case where no newer request took over.
      if (requestId.current === id) setBusy(false)
    }
  }

  return {
    input,
    setInput,
    busy,
    error,
    refusal,
    duplicate,
    candidates,
    selected,
    draft,
    cuisine,
    setCuisine,
    /** The category shown came from OSM and the user has not changed it. */
    suggested: !cuisineTouched && cuisine !== '',
    select,
    rejectMatch,
    submit,
  }
}
