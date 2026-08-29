import { render } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import type L from 'leaflet'
import { MapView } from './MapView'
import type { MapMarker } from './markers'

// Leaflet needs real DOM dimensions jsdom doesn't provide; stub react-leaflet for the shell, but
// let Marker forward the real icon leaflet's own `L.divIcon()` built, so size/color are assertable.
vi.mock('react-leaflet', () => {
  // Stable map instance — real react-leaflet's useMap() returns the same object across renders.
  const map = {
    setView: () => {},
    getZoom: () => 12,
    getCenter: () => ({ lat: 0, lng: 0 }),
    on: () => {},
    off: () => {},
  }
  return {
    MapContainer: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
    TileLayer: () => null,
    Marker: ({ icon, position }: { icon: L.DivIcon; position: [number, number] }) => {
      const iconSize = icon.options.iconSize as L.PointTuple | undefined
      return <div data-testid={`marker-${position[0]}-${position[1]}`} data-size={iconSize?.[0]} />
    },
    Popup: () => null,
    useMap: () => map,
  }
})

const MARKERS: MapMarker[] = [
  { id: 'a', lat: 1, lng: 1, name: 'A', label: '', color: '#111111', dimmed: false },
  { id: 'b', lat: 2, lng: 2, name: 'B', label: '', color: '#222222', dimmed: false },
]

describe('MapView', () => {
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
})
