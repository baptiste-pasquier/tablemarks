export interface GeoPoint {
  lat: number
  lng: number
}

/**
 * Resolve the user's current position, or null when unavailable — permission denied, error,
 * timeout, or no Geolocation support. Never rejects, so callers can leave the anchor unchanged
 * on failure without a try/catch.
 */
export function geolocate(timeoutMs = 10_000): Promise<GeoPoint | null> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    return Promise.resolve(null)
  }
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(null),
      { timeout: timeoutMs, enableHighAccuracy: false },
    )
  })
}
