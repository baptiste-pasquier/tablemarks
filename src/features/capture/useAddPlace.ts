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
import { dismissOsm } from '../places/osmDismissals'
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
  // True only while `submit` commits an existing draft (as opposed to a search): the text must
  // hold still, because the running commit already closed over the draft it is saving — an edit
  // here would invalidate the request without stopping it, and the created place would then have
  // no `onAdded` to show for it (review #1).
  const [committing, setCommitting] = useState(false)
  // The user rejected this draft's OSM match in the preview: carried through to the commit so the
  // saved place's detail does not propose the same match again (review #4).
  const [rejectedMatch, setRejectedMatch] = useState(false)
  // Bumped on every input edit and at the start of every submit: a request whose id no longer
  // matches this ref once its await settles is stale (superseded by an edit or a later submit),
  // and its result — including an error, or `onAdded` — is dropped rather than written.
  const requestId = useRef(0)

  function suggest(match: GeoCandidate | undefined) {
    if (!cuisineTouched) setCuisineValue(match ? (suggestCategory(match) ?? '') : '')
  }

  function setInput(value: string) {
    // While a commit is in flight, the running `commitCapture` already closed over the draft it is
    // saving: changing the text here would only invalidate the request without stopping it, and
    // the created place would then have no `onAdded` to show for it (review #1).
    if (committing) return
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
    setRejectedMatch(false)
    // A manually chosen category belongs to the place identified for the text it was chosen
    // under; new text starts over with whatever the next match suggests.
    setCuisineValue('')
    setCuisineTouched(false)
  }

  function select(candidate: GeoCandidate) {
    // A result card stays clickable while "Add" commits the current selection; picking another one
    // then must not steal the in-flight commit's place.
    if (busy) return
    setSelected(candidate)
    setDraft(draftFromCandidate(candidate))
    setDuplicate(null)
    setRejectedMatch(false)
    suggest(candidate)
  }

  function rejectMatch() {
    // The running commit already holds the draft with its match; rejecting it now would change
    // what "Add" is saving without the commit knowing (review #3).
    if (busy) return
    if (!draft) return
    setDraft(withoutMatch(draft))
    setRejectedMatch(true)
    suggest(undefined)
  }

  function setCuisine(value: string | undefined) {
    if (busy) return
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
    if (result.status === 'duplicate') {
      setDuplicate(result.match)
      return
    }
    // The saved place must not offer the same OSM match again if the user already turned it down
    // once, at capture time (review #4).
    if (rejectedMatch) dismissOsm(result.restaurant.id)
    onAdded()
  }

  async function submit() {
    if (busy || !input.trim()) return
    const id = (requestId.current += 1)
    // Read before the await: whether this request commits a draft or starts a search, for the
    // catch below — and unaffected by whatever the input becomes while this request is in flight.
    const hadDraft = draft !== null
    setBusy(true)
    if (hadDraft) setCommitting(true)
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
      if (hadDraft) setCommitting(false)
    }
  }

  return {
    input,
    setInput,
    busy,
    /** A commit (as opposed to a search) is in flight: the text can no longer change (review #1). */
    committing,
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
