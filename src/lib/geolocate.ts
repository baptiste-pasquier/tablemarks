export interface GeoPoint {
  lat: number
  lng: number
}

/**
 * Resolve the user's current position, or null when unavailable — permission denied, error,
 * timeout, or no Geolocation support. Never rejects, so callers can leave the anchor unchanged.
 *
 * The outer Promise.race is the real bound: the W3C `timeout` option only starts counting after
 * the permission prompt is answered, so an ignored prompt would hang getCurrentPosition forever.
 */
export function geolocate(timeoutMs = 10_000): Promise<GeoPoint | null> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    return Promise.resolve(null)
  }
  const fromApi = new Promise<GeoPoint | null>((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(null),
      { timeout: timeoutMs, enableHighAccuracy: false },
    )
  })
  const wallClock = new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs))
  return Promise.race([fromApi, wallClock])
}
