import { useEffect } from 'react'
import { render, screen, waitFor, within, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type L from 'leaflet'
import { MapView } from './MapView'
import type { MapMarker } from './markers'
import type { GeoPoint } from '../../lib/geolocate'

// Spy on the stable map instance's setView, so the "Localiser" tests can assert the existing
// recenter call fires (or doesn't) alongside the new onLocate callback. Declared via vi.hoisted
// so the vi.mock factory below (itself hoisted above all imports) can safely close over it.
// tileLayerProps captures the TileLayer's last render props so the crossOrigin regression guard
// can assert on it without rendering a real TileLayer under jsdom.
const { mockMapSetView, tileLayerProps } = vi.hoisted(() => ({
  mockMapSetView: vi.fn(),
  tileLayerProps: { current: null as Record<string, unknown> | null },
}))

// Leaflet needs real DOM dimensions jsdom doesn't provide; stub react-leaflet for the shell, but
// let Marker forward the real icon leaflet's own `L.divIcon()` built, so size/color are assertable.
vi.mock('react-leaflet', () => {
  // Stable map instance — real react-leaflet's useMap() returns the same object across renders.
  const map = {
    setView: mockMapSetView,
    getZoom: () => 12,
    getCenter: () => ({ lat: 0, lng: 0 }),
    on: () => {},
    off: () => {},
  }
  return {
    // Forwards `ref` to the stable map instance — MapView.tsx reads it back via `ref={setMap}`
    // (React 19 ref-as-prop) to call `map.setView(...)` from the "Localiser" tap.
    MapContainer: ({
      children,
      ref,
    }: {
      children?: React.ReactNode
      ref?: (m: typeof map) => void
    }) => {
      useEffect(() => {
        ref?.(map)
      }, [])
      return <div>{children}</div>
    },
    TileLayer: (props: Record<string, unknown>) => {
      tileLayerProps.current = props
      return null
    },
    Marker: ({
      icon,
      position,
      children,
      eventHandlers,
      interactive,
      keyboard,
    }: {
      icon: L.DivIcon
      position: [number, number]
      children?: React.ReactNode
      eventHandlers?: { click?: () => void }
      interactive?: boolean
      keyboard?: boolean
    }) => {
      const iconSize = icon.options.iconSize as L.PointTuple | undefined
      return (
        <div
          data-testid={`marker-${position[0]}-${position[1]}`}
          data-size={iconSize?.[0]}
          data-icon-html={icon.options.html}
          data-interactive={interactive}
          data-keyboard={keyboard}
          onClick={eventHandlers?.click}
        >
          {children}
        </div>
      )
    },
    Popup: ({ children }: { children?: React.ReactNode }) => (
      <div data-testid="popup">{children}</div>
    ),
    useMap: () => map,
  }
})

const { mockGeolocate } = vi.hoisted(() => ({ mockGeolocate: vi.fn<() => Promise<GeoPoint | null>>() }))
vi.mock('../../lib/geolocate', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/geolocate')>()
  return { ...actual, geolocate: () => mockGeolocate() }
})

const MARKERS: MapMarker[] = [
  { id: 'a', lat: 1, lng: 1, name: 'A', label: '', color: '#111111', dimmed: false },
  { id: 'b', lat: 2, lng: 2, name: 'B', label: '', color: '#222222', dimmed: false },
]

describe('MapView', () => {
  beforeEach(() => {
    mockGeolocate.mockReset()
    mockMapSetView.mockClear()
    tileLayerProps.current = null
  })

  it('renders an unselected marker as a same-size teardrop pin', () => {
    const { getByTestId } = render(<MapView markers={MARKERS} />)
    expect(getByTestId('marker-1-1').dataset.size).toBe('24')
    expect(getByTestId('marker-2-2').dataset.size).toBe('24')
  })

  it('renders the selected marker larger, and moves the glow when selection changes', () => {
    const { getByTestId, rerender } = render(<MapView markers={MARKERS} selectedId="a" onSelect={vi.fn()} />)
    expect(getByTestId('marker-1-1').dataset.size).toBe('30')
    expect(getByTestId('marker-2-2').dataset.size).toBe('24')

    rerender(<MapView markers={MARKERS} selectedId="b" onSelect={vi.fn()} />)
    expect(getByTestId('marker-1-1').dataset.size).toBe('24')
    expect(getByTestId('marker-2-2').dataset.size).toBe('30')
  })

  describe('"Localiser" tap (U2 F2)', () => {
    it('recenters the map and reports the fetched point via onLocate when the fetch succeeds (R2)', async () => {
      const user = userEvent.setup()
      const point: GeoPoint = { lat: 9, lng: 8 }
      mockGeolocate.mockResolvedValue(point)
      const onLocate = vi.fn()
      render(<MapView markers={[]} onLocate={onLocate} />)

      await user.click(screen.getByRole('button', { name: /center on my location/i }))

      await waitFor(() => expect(onLocate).toHaveBeenCalledWith(point, expect.any(Number)))
      expect(mockMapSetView).toHaveBeenCalledWith([point.lat, point.lng], 12)
    })

    it('tags each fetch with the generation from beginLocate so the caller can drop a stale resolution (KTD3)', async () => {
      const user = userEvent.setup()
      const point: GeoPoint = { lat: 9, lng: 8 }
      mockGeolocate.mockResolvedValue(point)
      const onLocate = vi.fn()
      const beginLocate = vi.fn().mockReturnValue(7)
      render(<MapView markers={[]} beginLocate={beginLocate} onLocate={onLocate} />)

      await user.click(screen.getByRole('button', { name: /center on my location/i }))

      await waitFor(() => expect(onLocate).toHaveBeenCalledWith(point, 7))
      expect(beginLocate).toHaveBeenCalledTimes(1)
    })

    it('does not call onLocate or recenter when the fetch resolves null — denied/timeout/no support (KTD3 null-guard, R6)', async () => {
      const user = userEvent.setup()
      mockGeolocate.mockResolvedValue(null)
      const onLocate = vi.fn()
      render(<MapView markers={[]} onLocate={onLocate} />)

      await user.click(screen.getByRole('button', { name: /center on my location/i }))

      await waitFor(() => expect(mockGeolocate).toHaveBeenCalledTimes(1))
      expect(onLocate).not.toHaveBeenCalled()
      expect(mockMapSetView).not.toHaveBeenCalled()
    })
  })

  describe('"you are here" marker (U3 R1)', () => {
    it('renders no current-position marker when currentPosition is not set', () => {
      render(<MapView markers={MARKERS} currentPosition={null} />)
      expect(screen.getAllByTestId(/^marker-/)).toHaveLength(MARKERS.length)
    })

    it('renders a distinct current-position marker at the given point, carrying the accessible label', () => {
      const point: GeoPoint = { lat: 5, lng: 6 }
      render(<MapView markers={MARKERS} currentPosition={point} />)

      const marker = screen.getByTestId('marker-5-6')
      // 16px — distinct from the cuisine teardrop pins' 24px (unselected) / 30px (selected).
      expect(marker.dataset.size).toBe('16')
      expect(marker.dataset.iconHtml).toContain('aria-label="Your current location"')
      expect(screen.getAllByTestId(/^marker-/)).toHaveLength(MARKERS.length + 1)
    })

    it('moves the current-position marker when currentPosition changes, e.g. after a "Localiser" tap', () => {
      const { rerender } = render(<MapView markers={MARKERS} currentPosition={{ lat: 5, lng: 6 }} />)
      expect(screen.getByTestId('marker-5-6')).toBeInTheDocument()

      rerender(<MapView markers={MARKERS} currentPosition={{ lat: 9, lng: 8 }} />)
      expect(screen.queryByTestId('marker-5-6')).not.toBeInTheDocument()
      expect(screen.getByTestId('marker-9-8')).toBeInTheDocument()
    })

    it('renders the current-position marker with no click handler and no popup, unlike restaurant pins', () => {
      const onSelect = vi.fn()
      render(
        <MapView markers={MARKERS} currentPosition={{ lat: 5, lng: 6 }} onSelect={onSelect} />,
      )

      const marker = screen.getByTestId('marker-5-6')
      expect(within(marker).queryByTestId('popup')).not.toBeInTheDocument()

      fireEvent.click(marker)
      expect(onSelect).not.toHaveBeenCalled()
    })

    it('renders the current-position marker as non-interactive and non-keyboard-focusable, unlike restaurant pins', () => {
      render(<MapView markers={MARKERS} currentPosition={{ lat: 5, lng: 6 }} />)

      const marker = screen.getByTestId('marker-5-6')
      expect(marker.dataset.interactive).toBe('false')
      expect(marker.dataset.keyboard).toBe('false')
    })
  })

  it('keeps the TileLayer crossOrigin="anonymous" prop (regression guard for opaque tile caching)', () => {
    render(<MapView markers={MARKERS} />)
    expect(tileLayerProps.current?.crossOrigin).toBe('anonymous')
  })
})
