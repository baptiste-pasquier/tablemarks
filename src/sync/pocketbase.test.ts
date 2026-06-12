import { describe, it, expect, vi, afterEach } from 'vitest'
import { pb, resolveShortLink } from './pocketbase'

afterEach(() => vi.restoreAllMocks())

describe('resolveShortLink', () => {
  it('returns coordinates from the resolver route', async () => {
    const send = vi.spyOn(pb, 'send').mockResolvedValue({ lat: 48.8566, lng: 2.3522, name: 'Chez Marcel' })
    const out = await resolveShortLink('https://maps.app.goo.gl/abc')
    expect(out).toEqual({ lat: 48.8566, lng: 2.3522, name: 'Chez Marcel' })
    expect(send).toHaveBeenCalledWith(
      '/api/tablemarks/resolve-short-link',
      expect.objectContaining({ query: { url: 'https://maps.app.goo.gl/abc' } }),
    )
  })

  it('throws when the route returns no coordinates', async () => {
    vi.spyOn(pb, 'send').mockResolvedValue({ error: 'could not extract coordinates' })
    await expect(resolveShortLink('https://maps.app.goo.gl/nope')).rejects.toThrow(/coordinates/)
  })
})
