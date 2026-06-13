import { rollupLabel } from '../display'
import { colorForCuisine } from '../facets/cuisines'
import type { Restaurant } from '../../types/models'

export interface MapMarker {
  id: string
  lat: number
  lng: number
  name: string
  label: string
  /** Marker color from the single cuisine-to-color source (neutral when uncategorized). */
  color: string
}

/** Build map markers from restaurants — only those with resolved coordinates (skips provisional). */
export function toMarkers(restaurants: Restaurant[]): MapMarker[] {
  const markers: MapMarker[] = []
  for (const r of restaurants) {
    if (r.pending || r.lat === null || r.lng === null) continue
    markers.push({
      id: r.id,
      lat: r.lat,
      lng: r.lng,
      name: r.name,
      label: rollupLabel(r),
      color: colorForCuisine(r.cuisine),
    })
  }
  return markers
}
