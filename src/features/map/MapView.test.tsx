import { render } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type L from 'leaflet'
import { MapView, LabelVisibility, LABEL_ZOOM_FLOOR } from './MapView'
import { computeLabelPlacement } from './labelPlacement'
import type { MapMarker } from './markers'

// Defaults to the real algorithm (so every existing test keeps exercising real placement logic),
// but individual tests below can queue a `mockReturnValueOnce` to force a specific visible-label
// set — needed for the "dimmed marker would otherwise qualify" defense-in-depth case, which the
// real algorithm can never produce (it excludes dimmed candidates before MapView ever sees them).
vi.mock('./labelPlacement', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./labelPlacement')>()
  return { ...actual, computeLabelPlacement: vi.fn(actual.computeLabelPlacement) }
})

// Mutable per-test knobs for the mocked map, plus a handler registry so tests can simulate
// Leaflet firing `zoomend`/`moveend` by invoking the recorded handlers directly.
let mockZoom = 12
let mockProject = (lat: number, lng: number) => ({ x: lng * 10, y: lat * 10 })
const handlers = new Map<string, Set<() => void>>()

function fire(event: string) {
  handlers.get(event)?.forEach((h) => h())
}

// Leaflet needs real DOM dimensions jsdom doesn't provide; stub react-leaflet for the shell, but
// let Marker forward the real icon leaflet's own `L.divIcon()` built, so size/color are assertable.
vi.mock('react-leaflet', () => {
  // Stable map instance — real react-leaflet's useMap() returns the same object across renders;
  // a fresh object each call would make effects keyed on `map` loop forever.
  const map = {
    setView: () => {},
    getZoom: () => mockZoom,
    getCenter: () => ({ lat: 0, lng: 0 }),
    // Fixed container size (KTD7's viewCenter math), and a deterministic lat/lng -> pixel
    // projection tests can swap out (`mockProject`) to simulate a pan changing marker positions.
    getSize: () => ({ x: 400, y: 400 }),
    latLngToContainerPoint: ([lat, lng]: [number, number]) => mockProject(lat, lng),
    on: (event: string, handler: () => void) => {
      if (!handlers.has(event)) handlers.set(event, new Set())
      handlers.get(event)!.add(handler)
    },
    off: (event: string, handler: () => void) => {
      handlers.get(event)?.delete(handler)
    },
  }
  return {
    MapContainer: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
    TileLayer: () => null,
    Marker: ({ icon, position }: { icon: L.DivIcon; position: [number, number] }) => {
      const iconSize = icon.options.iconSize as L.PointTuple | undefined
      return (
        <div
          data-testid={`marker-${position[0]}-${position[1]}`}
          data-size={iconSize?.[0]}
          data-html={icon.options.html as string}
        />
      )
    },
    Popup: () => null,
    useMap: () => map,
  }
})

beforeEach(() => {
  mockZoom = 12
  mockProject = (lat, lng) => ({ x: lng * 10, y: lat * 10 })
  handlers.clear()
  vi.mocked(computeLabelPlacement).mockClear()
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

describe('MapView name labels (U3)', () => {
  it('renders a marker in the visible-label set with its name as on-map text, aria-hidden, and no label for a marker outside the set', () => {
    mockZoom = LABEL_ZOOM_FLOOR
    vi.mocked(computeLabelPlacement).mockReturnValueOnce(new Set(['a']))
    const { getByTestId } = render(<MapView markers={MARKERS} />)

    const htmlA = getByTestId('marker-1-1').dataset.html ?? ''
    expect(htmlA).toContain('aria-hidden="true"')
    expect(htmlA).toContain('>A<')

    const htmlB = getByTestId('marker-2-2').dataset.html ?? ''
    expect(htmlB).not.toContain('aria-hidden')
    expect(htmlB).not.toContain('>B<')
  })

  it('shows the same label regardless of whether the marker is selected (no popup/label special-casing, KTD7)', () => {
    mockZoom = LABEL_ZOOM_FLOOR
    vi.mocked(computeLabelPlacement).mockReturnValueOnce(new Set(['a']))
    const { getByTestId, rerender } = render(<MapView markers={MARKERS} />)
    const htmlUnselected = getByTestId('marker-1-1').dataset.html ?? ''
    expect(htmlUnselected).toContain('aria-hidden="true"')
    expect(htmlUnselected).toContain('>A<')

    rerender(<MapView markers={MARKERS} selectedId="a" onSelect={vi.fn()} />)
    const htmlSelected = getByTestId('marker-1-1').dataset.html ?? ''
    expect(htmlSelected).toContain('aria-hidden="true"')
    expect(htmlSelected).toContain('>A<')
  })

  it('never renders a label for a dimmed marker, even when it would otherwise be in the visible-label set', () => {
    mockZoom = LABEL_ZOOM_FLOOR
    const dimmedMarkers: MapMarker[] = [
      { ...MARKERS[0], dimmed: true },
      MARKERS[1],
    ]
    // Force both ids into the "visible" set, simulating the upstream algorithm having (contrary
    // to its own guarantee) included the dimmed marker — MapView's own guard must still hide it.
    vi.mocked(computeLabelPlacement).mockReturnValueOnce(new Set(['a', 'b']))
    const { getByTestId } = render(<MapView markers={dimmedMarkers} />)

    const htmlA = getByTestId('marker-1-1').dataset.html ?? ''
    expect(htmlA).not.toContain('aria-hidden')
    expect(htmlA).not.toContain('>A<')

    const htmlB = getByTestId('marker-2-2').dataset.html ?? ''
    expect(htmlB).toContain('aria-hidden="true"')
    expect(htmlB).toContain('>B<')
  })
})

// Tested via the exported `LabelVisibility` component directly, rather than through `MapView`'s
// props: `MapView` doesn't (and shouldn't yet, per U3) expose the visible-label set on its own
// public contract, so rendering `LabelVisibility` standalone — with a spy `onChange` — is the
// cleanest seam to observe what a recompute reports, without widening MapView's contract just
// for a test.
describe('LabelVisibility', () => {
  it('mounts with zoom already above the floor and computes labels immediately, with no event required', () => {
    mockZoom = LABEL_ZOOM_FLOOR
    const onChange = vi.fn()
    render(<LabelVisibility markers={MARKERS} onChange={onChange} />)
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith(new Set(['a', 'b']))
  })

  it('reports an empty set below the zoom floor, and the eligible set once zoomend crosses it', () => {
    mockZoom = LABEL_ZOOM_FLOOR - 1
    const onChange = vi.fn()
    render(<LabelVisibility markers={MARKERS} onChange={onChange} />)
    expect(onChange).toHaveBeenLastCalledWith(new Set())

    mockZoom = LABEL_ZOOM_FLOOR
    fire('zoomend')
    expect(onChange).toHaveBeenLastCalledWith(new Set(['a', 'b']))

    mockZoom = LABEL_ZOOM_FLOOR - 1
    fire('zoomend')
    expect(onChange).toHaveBeenLastCalledWith(new Set())
  })

  it('recomputes on moveend using freshly projected marker positions', () => {
    mockZoom = LABEL_ZOOM_FLOOR
    const onChange = vi.fn()
    render(<LabelVisibility markers={MARKERS} onChange={onChange} />)
    expect(onChange).toHaveBeenCalledTimes(1)

    // Simulate a pan: markers now project to different screen coordinates. The default canvas
    // measurer returns 0-width label boxes in jsdom (no 2d context here), so boxes never overlap
    // regardless of position — this asserts *that* a recompute happened with fresh projections,
    // not a collision outcome (U1's own tests cover the collision math via an injected stub).
    mockProject = (lat, lng) => ({ x: lng * 999, y: lat * 999 })
    fire('moveend')
    expect(onChange).toHaveBeenCalledTimes(2)
    expect(onChange).toHaveBeenLastCalledWith(new Set(['a', 'b']))
  })

  it('recomputes when the markers prop changes (e.g. a facet filter toggle), without any zoom/pan event', () => {
    mockZoom = LABEL_ZOOM_FLOOR
    const onChange = vi.fn()
    const { rerender } = render(<LabelVisibility markers={MARKERS} onChange={onChange} />)
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenLastCalledWith(new Set(['a', 'b']))

    const filtered: MapMarker[] = [{ ...MARKERS[0], dimmed: true }, MARKERS[1]]
    rerender(<LabelVisibility markers={filtered} onChange={onChange} />)
    expect(onChange).toHaveBeenCalledTimes(2)
    expect(onChange).toHaveBeenLastCalledWith(new Set(['b']))
  })

  it('recomputes when `active` flips false -> true (mobile List pane switching back to Map)', () => {
    mockZoom = LABEL_ZOOM_FLOOR
    const onChange = vi.fn()
    const { rerender } = render(<LabelVisibility markers={MARKERS} active={false} onChange={onChange} />)
    expect(onChange).toHaveBeenCalledTimes(1)

    rerender(<LabelVisibility markers={MARKERS} active={true} onChange={onChange} />)
    expect(onChange).toHaveBeenCalledTimes(2)
  })

  it('unsubscribes both zoomend and moveend on unmount', () => {
    mockZoom = LABEL_ZOOM_FLOOR
    const onChange = vi.fn()
    const { unmount } = render(<LabelVisibility markers={MARKERS} onChange={onChange} />)
    expect(handlers.get('zoomend')?.size).toBe(1)
    expect(handlers.get('moveend')?.size).toBe(1)

    unmount()
    expect(handlers.get('zoomend')?.size).toBe(0)
    expect(handlers.get('moveend')?.size).toBe(0)
  })
})
