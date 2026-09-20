import { describe, it, expect, vi, afterEach } from 'vitest'
import { loadRuntimeConfig, runtimeConfigPath } from './runtimeConfig'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

/** Stub `fetch` with a JSON body, mimicking the parts of `Response` the module reads. */
function stubJson(body: unknown, init: { ok?: boolean; status?: number } = {}) {
  const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => ({
    ok: init.ok ?? true,
    status: init.status ?? 200,
    json: async () => body,
  }))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

describe('loadRuntimeConfig — configured', () => {
  it('resolves to configured with the URL when the file carries a non-empty https URL', async () => {
    stubJson({ pocketbaseUrl: 'https://pb.example.com' })
    await expect(loadRuntimeConfig()).resolves.toEqual({
      status: 'configured',
      pocketbaseUrl: 'https://pb.example.com',
    })
  })

  it('trims surrounding whitespace off a configured URL', async () => {
    stubJson({ pocketbaseUrl: '  https://pb.example.com/  ' })
    await expect(loadRuntimeConfig()).resolves.toEqual({
      status: 'configured',
      pocketbaseUrl: 'https://pb.example.com/',
    })
  })
})

describe('loadRuntimeConfig — absent', () => {
  it('resolves to absent when the backend URL is empty', async () => {
    stubJson({ pocketbaseUrl: '' })
    await expect(loadRuntimeConfig()).resolves.toEqual({ status: 'absent' })
  })

  it('treats a whitespace-only URL as absent, not as a usable backend', async () => {
    stubJson({ pocketbaseUrl: '   ' })
    await expect(loadRuntimeConfig()).resolves.toEqual({ status: 'absent' })
  })
})

describe('loadRuntimeConfig — unavailable', () => {
  it('resolves to unavailable — not absent — when the network rejects', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch')
      }),
    )
    const out = await loadRuntimeConfig()
    expect(out.status).toBe('unavailable')
    // The distinction KTD9 exists to protect: an offline launch must not read as "no backend".
    expect(out.status).not.toBe('absent')
  })

  it('resolves to unavailable without throwing on a 404 serving an HTML body', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 404,
        json: async () => {
          throw new SyntaxError('Unexpected token < in JSON at position 0')
        },
      })),
    )
    const out = await loadRuntimeConfig()
    expect(out.status).toBe('unavailable')
  })

  it('resolves to unavailable without throwing when a 200 body is malformed JSON', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => {
          throw new SyntaxError('Unexpected end of JSON input')
        },
      })),
    )
    const out = await loadRuntimeConfig()
    expect(out.status).toBe('unavailable')
  })

  it('resolves to unavailable when the key is missing from a valid object', async () => {
    stubJson({ somethingElse: 'https://pb.example.com' })
    expect((await loadRuntimeConfig()).status).toBe('unavailable')
  })

  it('resolves to unavailable when the body is not an object', async () => {
    stubJson('https://pb.example.com')
    expect((await loadRuntimeConfig()).status).toBe('unavailable')
  })

  it('resolves to unavailable when the key is not a string', async () => {
    stubJson({ pocketbaseUrl: 8090 })
    expect((await loadRuntimeConfig()).status).toBe('unavailable')
  })

  it('resolves to unavailable when the URL is unparseable', async () => {
    stubJson({ pocketbaseUrl: 'not a url' })
    expect((await loadRuntimeConfig()).status).toBe('unavailable')
  })
})

describe('loadRuntimeConfig — timeout (R30)', () => {
  it('resolves to unavailable once the timeout elapses when the connection never answers', async () => {
    // Real `fetch` rejects with an AbortError when its signal fires.
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string, init?: { signal?: AbortSignal }) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () =>
              reject(new DOMException('aborted', 'AbortError')),
            )
          }),
      ),
    )
    const out = await loadRuntimeConfig({ timeoutMs: 20 })
    expect(out.status).toBe('unavailable')
  })

  it('still settles when the request ignores the abort signal entirely', async () => {
    // Hard bound: the page must never be left unrendered by a promise that never settles.
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise(() => {})),
    )
    const out = await loadRuntimeConfig({ timeoutMs: 20 })
    expect(out.status).toBe('unavailable')
  })

  it('passes an abort signal so the stalled request is torn down', async () => {
    const fetchMock = vi.fn(
      (_url: string, init?: { signal?: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(new DOMException('aborted', 'AbortError')),
          )
        }),
    )
    vi.stubGlobal('fetch', fetchMock)
    await loadRuntimeConfig({ timeoutMs: 20 })
    const init = fetchMock.mock.calls[0][1] as { signal?: AbortSignal }
    expect(init.signal).toBeInstanceOf(AbortSignal)
  })
})

describe('loadRuntimeConfig — transport safety (R1)', () => {
  it('resolves a non-loopback http URL to unavailable, not to configured', async () => {
    stubJson({ pocketbaseUrl: 'http://pb.example.com' })
    const out = await loadRuntimeConfig()
    expect(out.status).toBe('unavailable')
    expect(out).not.toHaveProperty('pocketbaseUrl')
  })

  it.each(['http://127.0.0.1:8090', 'http://localhost:8090', 'http://[::1]:8090'])(
    'exempts the loopback origin %s so development is unaffected',
    async (url) => {
      stubJson({ pocketbaseUrl: url })
      await expect(loadRuntimeConfig()).resolves.toEqual({
        status: 'configured',
        pocketbaseUrl: url,
      })
    },
  )

  it('rejects a non-http(s) scheme', async () => {
    stubJson({ pocketbaseUrl: 'ws://pb.example.com' })
    expect((await loadRuntimeConfig()).status).toBe('unavailable')
  })
})

describe('runtimeConfigPath', () => {
  it('fetches relative to the app base path, not a root-absolute path', async () => {
    vi.stubEnv('BASE_URL', '/tablemarks/')
    const fetchMock = stubJson({ pocketbaseUrl: '' })
    await loadRuntimeConfig()
    expect(fetchMock.mock.calls[0][0]).toBe('/tablemarks/config.json')
  })

  it('tolerates a base path with no trailing slash', () => {
    vi.stubEnv('BASE_URL', '/tablemarks')
    expect(runtimeConfigPath()).toBe('/tablemarks/config.json')
  })

  it('resolves to /config.json at the root base path', () => {
    vi.stubEnv('BASE_URL', '/')
    expect(runtimeConfigPath()).toBe('/config.json')
  })
})
