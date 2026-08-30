import { describe, it, expect, vi, afterEach } from 'vitest'
import { pb, resolveShortLink } from './pocketbase'

afterEach(() => vi.restoreAllMocks())

describe('pb client', () => {
  // PocketBase's default auto-cancellation aborts any earlier in-flight request that shares
  // the same method+path key. authWithOAuth2() opens a popup synchronously then calls
  // listAuthMethods() (a plain GET) before redirecting it — with auto-cancellation on, a second
  // tap on the sign-in button while that GET is still pending aborts the first call's request,
  // which closes the popup it already opened (reported as "the tab opens then closes" on iPhone).
  it('disables auto-cancellation so overlapping sign-in attempts do not abort each other', () => {
    expect(pb.enableAutoCancellation).toBe(false)
  })
})

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
