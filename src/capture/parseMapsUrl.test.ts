import { describe, it, expect } from 'vitest'
import { parseMapsUrl } from './parseMapsUrl'

describe('parseMapsUrl', () => {
  it('extracts coordinates and place name from a full URL', () => {
    const out = parseMapsUrl(
      'https://www.google.com/maps/place/Chez+Marcel/@48.8566,2.3522,15z/data=abc',
    )
    expect(out.kind).toBe('coords')
    expect(out.lat).toBeCloseTo(48.8566)
    expect(out.lng).toBeCloseTo(2.3522)
    expect(out.name).toBe('Chez Marcel')
  })

  it('flags a maps.app.goo.gl short link for server resolution', () => {
    expect(parseMapsUrl('https://maps.app.goo.gl/abc123').kind).toBe('short')
  })

  it('returns none for plain text', () => {
    expect(parseMapsUrl('Chez Marcel, Paris').kind).toBe('none')
  })

  it('handles a coordinate URL with no place segment', () => {
    const out = parseMapsUrl('https://www.google.com/maps/@40.0,-3.0,12z')
    expect(out.kind).toBe('coords')
    expect(out.name).toBeUndefined()
  })
})
