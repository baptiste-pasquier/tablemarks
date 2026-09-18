import { describe, it, expect } from 'vitest'
import { parseMapsUrl } from './parseMapsUrl'

describe('parseMapsUrl', () => {
  it('extracts coordinates and place name from a full URL', () => {
    const out = parseMapsUrl(
      'https://www.google.com/maps/place/Chez+Marcel/@48.8566,2.3522,15z/data=abc',
    )
    expect(out.kind).toBe('coords')
    if (out.kind !== 'coords') return
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
    if (out.kind !== 'coords') return
    expect(out.name).toBeUndefined()
  })
})

it('treats a legacy goo.gl/maps link as unusable rather than sending it to a resolver that refuses it', () => {
  // The resolver's allowlist is maps.app.goo.gl only, so classifying this as `short` bought a
  // round trip ending in a refusal — and, before that, a placeholder record that never resolved.
  expect(parseMapsUrl('https://goo.gl/maps/abc123').kind).toBe('unsupported')
  expect(parseMapsUrl('https://maps.app.goo.gl/abc123').kind).toBe('short')
})

describe('Maps URLs that cannot be used (review #6)', () => {
  // These used to read as `none`, which routes to name search — and searching Nominatim for the
  // text of a URL finds nothing, so the user got a bare "No matching places found." The copy that
  // explains the real reason existed but nothing could ever reach it.
  it.each([
    'https://goo.gl/maps/abc123',
    'https://www.google.com/maps/search/pizza+near+me',
    'https://maps.google.com/maps?q=something',
  ])('classifies %s as an unusable Maps link, not as a search query', (url) => {
    expect(parseMapsUrl(url).kind).toBe('unsupported')
  })

  it('still routes plain text to search', () => {
    expect(parseMapsUrl('Chez Marcel Paris').kind).toBe('none')
  })

  it('still routes a non-Maps URL to search rather than refusing it', () => {
    expect(parseMapsUrl('https://example.com/some/page').kind).toBe('none')
  })

  it('keeps reading coordinates out of a full Maps URL', () => {
    const parsed = parseMapsUrl('https://www.google.com/maps/place/Chez+Marcel/@48.8566,2.3522,15z')
    expect(parsed.kind).toBe('coords')
  })
})
