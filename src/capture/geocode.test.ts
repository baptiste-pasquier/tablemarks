import { describe, it, expect, vi, afterEach } from 'vitest'
import { nominatim } from './geocode'

afterEach(() => vi.restoreAllMocks())

describe('nominatim provider', () => {
  it('maps search rows to candidates', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => [
          { display_name: 'Chez Marcel, Paris, France', name: 'Chez Marcel', lat: '48.8566', lon: '2.3522' },
        ],
      })),
    )
    const out = await nominatim.search('chez marcel')
    expect(out).toEqual([
      { name: 'Chez Marcel', lat: 48.8566, lng: 2.3522, address: 'Chez Marcel, Paris, France' },
    ])
  })

  it('throws when search fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 503 })))
    await expect(nominatim.search('x')).rejects.toThrow(/failed/i)
  })

  it('returns a display name for reverse geocoding', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, json: async () => ({ display_name: '1 Rue de Rivoli, Paris' }) })),
    )
    expect(await nominatim.reverse(48.85, 2.35)).toBe('1 Rue de Rivoli, Paris')
  })
})
