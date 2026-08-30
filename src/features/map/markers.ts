import { colorForCuisine } from '../facets/cuisines'
import { matches, type FacetFilter } from '../facets/filter'
import type { Restaurant, Verdict } from '../../types/models'

export interface MapMarker {
  id: string
  lat: number
  lng: number
  name: string
  /** Always false — `toMarkers` filters out pending restaurants before this point. */
  pending: boolean
  visitCount: number
  latestVerdict: Verdict | null
  cuisine?: string
  /** Marker color from the single cuisine-to-color source (neutral when uncategorized). */
  color: string
  /** True when an active filter excludes this place — still placed, just de-emphasized (R9). */
  dimmed: boolean
}

/**
 * Build map markers from restaurants — only those with resolved coordinates (skips provisional).
 * Non-matching places are kept but flagged `dimmed` so the map stays a stable spatial reference.
 */
export function toMarkers(restaurants: Restaurant[], filter?: FacetFilter): MapMarker[] {
  const markers: MapMarker[] = []
  for (const r of restaurants) {
    if (r.pending || r.lat === null || r.lng === null) continue
    markers.push({
      id: r.id,
      lat: r.lat,
      lng: r.lng,
      name: r.name,
      pending: false,
      visitCount: r.visitCount,
      latestVerdict: r.latestVerdict,
      cuisine: r.cuisine,
      color: colorForCuisine(r.cuisine),
      dimmed: filter ? !matches(r, filter) : false,
    })
  }
  return markers
}
