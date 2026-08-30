import { describe, it, expect } from 'vitest'
import {
  isHttpUrl,
  resolveDestination,
  googleMapsSearchUrl,
  googleMapsDirectionsUrl,
} from './mapsLinks'

describe('resolveDestination', () => {
  it('returns address when set, even if coordinates are also set', () => {
    expect(resolveDestination({ address: '10 Rue de Rivoli', lat: 48.8566, lng: 2.3522 })).toBe(
      '10 Rue de Rivoli',
    )
  })

  it('returns "lat,lng" when address is unset and both coordinates are set', () => {
    expect(resolveDestination({ lat: 48.8566, lng: 2.3522 })).toBe('48.8566,2.3522')
    expect(resolveDestination({ address: '', lat: 48.8566, lng: 2.3522 })).toBe('48.8566,2.3522')
  })

  it('returns undefined when address is unset and either coordinate is null', () => {
    expect(resolveDestination({ lat: null, lng: 2.3522 })).toBeUndefined()
    expect(resolveDestination({ lat: 48.8566, lng: null })).toBeUndefined()
    expect(resolveDestination({ lat: null, lng: null })).toBeUndefined()
  })
})

describe('googleMapsSearchUrl / googleMapsDirectionsUrl', () => {
  const destination = 'Le Chat, 10 Rue de Rivoli'
  const encoded = encodeURIComponent(destination)

  it('URI-encodes the destination under the query param', () => {
    const url = googleMapsSearchUrl(destination)
    expect(url).toBe(`https://www.google.com/maps/search/?api=1&query=${encoded}`)
  })

  it('URI-encodes the destination under the destination param', () => {
    const url = googleMapsDirectionsUrl(destination)
    expect(url).toBe(`https://www.google.com/maps/dir/?api=1&destination=${encoded}`)
  })
})

describe('isHttpUrl', () => {
  it('accepts http:// and https:// URLs', () => {
    expect(isHttpUrl('http://example.com')).toBe(true)
    expect(isHttpUrl('https://example.com')).toBe(true)
  })

  it('rejects undefined, empty string, and javascript: URLs', () => {
    expect(isHttpUrl(undefined)).toBe(false)
    expect(isHttpUrl('')).toBe(false)
    expect(isHttpUrl('javascript:alert(1)')).toBe(false)
  })
})
