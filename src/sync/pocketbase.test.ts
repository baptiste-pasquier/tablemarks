import { describe, it, expect, vi, afterEach } from 'vitest'
import { UnresolvableShortLink, pb, resolveShortLink } from './pocketbase'

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

  // The translation callers depend on: everything downstream branches on this class, so if the
  // status never becomes one the whole permanent-refusal path is dead and nothing else notices.
  it.each([422])('turns a %i into a refusal the caller must not retry', async (status) => {
    vi.spyOn(pb, 'send').mockRejectedValue(Object.assign(new Error('refused'), { status }))
    await expect(resolveShortLink('https://maps.app.goo.gl/abc')).rejects.toBeInstanceOf(UnresolvableShortLink)
  })

  // PocketBase turns ANY exception thrown inside a hook handler into a generic 400 (stated in the
  // header of resolveShortLink.pb.js). So a 400 cannot mean "this URL is bad" -- it also means the
  // hook crashed, curl is missing from the image, a regression shipped. Treating it as a verdict
  // told the user their link was unopenable, permanently, for a bug that a retry would survive.
  it('leaves a 400 retryable — a hook that crashed reports one too (review #4)', async () => {
    vi.spyOn(pb, 'send').mockRejectedValue(Object.assign(new Error('generic'), { status: 400 }))
    const err = await resolveShortLink('https://maps.app.goo.gl/abc').catch((e: unknown) => e)
    expect(err).not.toBeInstanceOf(UnresolvableShortLink)
  })

  it.each([401, 502, 0])('leaves a %i as a retryable failure', async (status) => {
    // The session, the upstream or the network can change; the URL is not what was rejected.
    vi.spyOn(pb, 'send').mockRejectedValue(Object.assign(new Error('later'), { status }))
    const err = await resolveShortLink('https://maps.app.goo.gl/abc').catch((e: unknown) => e)
    expect(err).not.toBeInstanceOf(UnresolvableShortLink)
  })

  it('leaves a transport error with no status as a retryable failure', async () => {
    vi.spyOn(pb, 'send').mockRejectedValue(new TypeError('Failed to fetch'))
    const err = await resolveShortLink('https://maps.app.goo.gl/abc').catch((e: unknown) => e)
    expect(err).not.toBeInstanceOf(UnresolvableShortLink)
  })

  it('throws when the route returns no coordinates', async () => {
    vi.spyOn(pb, 'send').mockResolvedValue({ error: 'could not extract coordinates' })
    await expect(resolveShortLink('https://maps.app.goo.gl/nope')).rejects.toThrow(/coordinates/)
  })
})
