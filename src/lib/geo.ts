import type { GeoPoint } from './geolocate'

/** Fallback map center (Paris) used before a real anchor is known. */
export const DEFAULT_MAP_CENTER: GeoPoint = { lat: 48.8566, lng: 2.3522 }

const EARTH_RADIUS_M = 6_371_000

/** Great-circle distance between two lat/lng points, in meters. */
export function haversineMeters(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(bLat - aLat)
  const dLng = toRad(bLng - aLng)
  const lat1 = toRad(aLat)
  const lat2 = toRad(bLat)
  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2)
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h))
}

/** Human-readable distance: meters below 1 km, one-decimal km above. */
export function formatDistance(m: number): string {
  return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`
}
