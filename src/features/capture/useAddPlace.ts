import { useState } from 'react'
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

  function suggest(match: GeoCandidate | undefined) {
    if (!cuisineTouched) setCuisineValue(match ? (suggestCategory(match) ?? '') : '')
  }

  function setInput(value: string) {
    setInputValue(value)
    setCandidates(null)
    setSelected(null)
    setDraft(null)
    setDuplicate(null)
    setRefusal(null)
    setError(null)
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

  async function search(query: string) {
    try {
      const found = await searchPlaces(query)
      setCandidates(found)
      if (found.length === 0) setError('noMatches')
    } catch {
      setError('searchFailed')
    }
  }

  // Exhaustive over CaptureResult: the `never` assignment makes a future variant a type error.
  async function handle(result: CaptureResult) {
    switch (result.status) {
      case 'preview':
        setDraft(result.draft)
        suggest(result.draft.match)
        return
      case 'duplicate':
        setDuplicate(result.match)
        return
      case 'needs-search':
        await search(result.query)
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
    setBusy(true)
    setError(null)
    setDuplicate(null)
    setRefusal(null)
    try {
      if (draft) finish(await commitCapture(draft, cuisine.trim() || undefined))
      else await handle(await capturePaste(input))
    } catch {
      setError('add')
    } finally {
      setBusy(false)
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
