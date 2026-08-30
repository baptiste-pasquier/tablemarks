/** Only http(s) links are safe to render as an href — guards against a pasted `javascript:` URL. */
export function isHttpUrl(u: string | undefined): u is string {
  return !!u && /^https?:\/\//i.test(u)
}

/**
 * Resolves the destination string to use for a Google Maps link: the restaurant's
 * address when known, else its coordinates, else `undefined` when neither is available.
 */
export function resolveDestination(restaurant: {
  address?: string
  lat: number | null
  lng: number | null
}): string | undefined {
  if (restaurant.address) return restaurant.address
  if (restaurant.lat !== null && restaurant.lng !== null) {
    return `${restaurant.lat},${restaurant.lng}`
  }
  return undefined
}

/** Google Maps search/pin URL (no API key required) for a given destination. */
export function googleMapsSearchUrl(destination: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(destination)}`
}

/** Google Maps directions URL (no API key required) for a given destination. */
export function googleMapsDirectionsUrl(destination: string): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`
}
