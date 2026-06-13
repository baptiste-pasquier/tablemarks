import { describe, it, expect, vi, afterEach } from 'vitest'
import { geolocate } from './geolocate'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('geolocate', () => {
  it('resolves to coordinates on success', async () => {
    vi.stubGlobal('navigator', {
      geolocation: {
        getCurrentPosition: (ok: PositionCallback) =>
          ok({ coords: { latitude: 48.8566, longitude: 2.3522 } } as GeolocationPosition),
      },
    })
    expect(await geolocate()).toEqual({ lat: 48.8566, lng: 2.3522 })
  })

  it('resolves to null when permission is denied / errors', async () => {
    vi.stubGlobal('navigator', {
      geolocation: {
        getCurrentPosition: (_ok: PositionCallback, err: PositionErrorCallback) =>
          err({ code: 1, message: 'denied' } as GeolocationPositionError),
      },
    })
    expect(await geolocate()).toBeNull()
  })

  it('resolves to null when geolocation is unsupported', async () => {
    vi.stubGlobal('navigator', {})
    expect(await geolocate()).toBeNull()
  })

  it('resolves to null when the permission prompt is never answered (wall-clock timeout)', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('navigator', { geolocation: { getCurrentPosition: () => {} } }) // never calls back
    const promise = geolocate(5000)
    await vi.advanceTimersByTimeAsync(5000)
    expect(await promise).toBeNull()
  })
})
