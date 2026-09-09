import { describe, it, expect } from 'vitest'
import { CONFIG_SW_NETWORK_TIMEOUT_SECONDS, CONFIG_TIMEOUT_MS } from './configTimeouts'

describe('config.json deadlines', () => {
  it('lets the service worker fall back to cache before the page gives up', () => {
    // The whole point of the NetworkFirst entry in vite.config.ts. If the page's abort fires first,
    // an installed app on a slow network resolves `unavailable` while holding a usable cached copy,
    // and the cache entry can never be read at all.
    expect(CONFIG_SW_NETWORK_TIMEOUT_SECONDS * 1000).toBeLessThan(CONFIG_TIMEOUT_MS)
  })

  it('leaves the cached response room to reach the page', () => {
    // Not merely `<`: the worker still has to hand the body over after it gives up on the network.
    const marginMs = CONFIG_TIMEOUT_MS - CONFIG_SW_NETWORK_TIMEOUT_SECONDS * 1000
    expect(marginMs).toBeGreaterThanOrEqual(500)
  })
})
