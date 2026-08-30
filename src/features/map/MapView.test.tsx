import { useEffect } from 'react'
import { render, screen, waitFor, within, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type L from 'leaflet'
// Imported before './MapView' (which itself imports 'react-leaflet') so this binding is already
// initialized by the time importing './MapView' triggers the `vi.mock('react-leaflet', ...)`
// factory below, which calls it -- reversing this order throws a TDZ ReferenceError.
import { createMockLeafletMap } from '../../test/mockLeafletMap'
import { MapView, LabelVisibility, LABEL_ZOOM_FLOOR } from './MapView'
import { computeLabelPlacement } from './labelPlacement'
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
// Scaled up (was *10) so the two default MARKERS project far enough apart that their label boxes
// don't overlap under finding #1's real-footprint geometry (box left edge now starts past the
// icon's own radius+offset, not centered on the marker point) — keeps this default projection's
// intent (both markers get an unobstructed label) matching pre-existing test expectations below.
let mockProject = (lat: number, lng: number) => ({ x: lng * 20, y: lat * 20 })
const handlers = new Map<string, Set<() => void>>()
const mockInvalidateSize = vi.fn()
// Simulates Leaflet's `getSize()` staying stale (e.g. a container that was hidden via
// `display:none`, per KTD10) until `invalidateSize()` runs — lets finding #2's rising-edge test
// assert the "invalidateSize *before* recompute" ordering guarantee behaviorally, not just via
// call counts: while true, `getSize()` reports a deliberately wrong (zero) size, so a reordering
// regression (recompute reading the size before invalidateSize runs) would make that recompute
// see the wrong viewCenter, which the test can catch.
let mockSizeIsStale = false

function fire(event: string) {
  handlers.get(event)?.forEach((h) => h())
}

// Leaflet needs real DOM dimensions jsdom doesn't provide; stub react-leaflet for the shell, but
// let Marker forward the real icon leaflet's own `L.divIcon()` built, so size/color are assertable.
vi.mock('react-leaflet', () => {
  // Stable map instance — real react-leaflet's useMap() returns the same object across renders;
  // a fresh object each call would make effects keyed on `map` loop forever.
  const map = createMockLeafletMap({
    setView: mockMapSetView,
    getZoom: () => mockZoom,
    // Fixed container size (KTD7's viewCenter math), unless a test has armed the stale-size
    // simulation (`mockSizeIsStale`, finding #2) — and a deterministic lat/lng -> pixel
    // projection tests can swap out (`mockProject`) to simulate a pan changing marker positions.
    getSize: () => (mockSizeIsStale ? { x: 0, y: 0 } : { x: 400, y: 400 }),
    latLngToContainerPoint: ([lat, lng]) => mockProject(lat, lng),
    invalidateSize: () => {
      mockInvalidateSize()
      mockSizeIsStale = false
    },
    on: (event, handler) => {
      if (!handlers.has(event)) handlers.set(event, new Set())
      handlers.get(event)!.add(handler)
    },
    off: (event, handler) => {
      handlers.get(event)?.delete(handler)
    },
  })
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
          data-html={icon.options.html as string}
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

beforeEach(() => {
  mockZoom = 12
  mockProject = (lat, lng) => ({ x: lng * 20, y: lat * 20 })
  mockSizeIsStale = false
  handlers.clear()
  vi.mocked(computeLabelPlacement).mockClear()
  mockInvalidateSize.mockClear()
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

  it('escapes HTML-significant characters in a restaurant name so it cannot inject markup into the raw marker HTML (escapeHtml)', () => {
    mockZoom = LABEL_ZOOM_FLOOR
    // Short enough (8 chars) to survive truncateLabel's 24-char cap untouched, so this test
    // exercises escapeHtml alone — while still covering all five characters it replaces.
    const dangerousName = `A&<B>"C'`
    const markers: MapMarker[] = [
      { id: 'x', lat: 5, lng: 5, name: dangerousName, label: '', color: '#444444', dimmed: false },
    ]
    vi.mocked(computeLabelPlacement).mockReturnValueOnce(new Set(['x']))
    const { getByTestId } = render(<MapView markers={markers} />)

    const html = getByTestId('marker-5-5').dataset.html ?? ''
    expect(html).toContain('A&amp;&lt;B&gt;&quot;C&#39;')
    expect(html).not.toContain(dangerousName)
    expect(html).not.toContain('<B>')
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
    expect(computeLabelPlacement).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledTimes(1)

    // Simulate a pan: markers now project to different screen coordinates. The default canvas
    // measurer returns 0-width label boxes in jsdom (no 2d context here), so boxes never overlap
    // regardless of position, and both markers stay accepted before and after — so this asserts
    // *that* a recompute happened with fresh projections (via computeLabelPlacement), not that
    // `onChange` fires again: an unchanged visible-id set is a no-op update and is suppressed.
    mockProject = (lat, lng) => ({ x: lng * 999, y: lat * 999 })
    fire('moveend')
    expect(computeLabelPlacement).toHaveBeenCalledTimes(2)
    expect(onChange).toHaveBeenCalledTimes(1)
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

  it('nudges Leaflet via invalidateSize before recomputing when `active` flips false -> true (mobile List pane switching back to Map, KTD10)', () => {
    mockZoom = LABEL_ZOOM_FLOOR
    const onChange = vi.fn()
    const { rerender } = render(<LabelVisibility markers={MARKERS} active={false} onChange={onChange} />)
    expect(computeLabelPlacement).toHaveBeenCalledTimes(1)
    expect(mockInvalidateSize).not.toHaveBeenCalled()

    // Simulate the pane having been hidden: getSize() reports a stale (zero) size until
    // invalidateSize() runs. If MapView read the size before invalidating it (a reordering
    // regression), this rising-edge recompute would see viewCenter {x:0,y:0} instead of the real
    // {x:200,y:200} -- a plain call-count assertion couldn't distinguish the two orderings.
    mockSizeIsStale = true
    rerender(<LabelVisibility markers={MARKERS} active={true} onChange={onChange} />)
    expect(mockInvalidateSize).toHaveBeenCalledTimes(1)
    expect(computeLabelPlacement).toHaveBeenCalledTimes(2)
    expect(vi.mocked(computeLabelPlacement).mock.calls[1][1]).toEqual({ x: 200, y: 200 })

    // Flipping active again with no other change is not a rising edge -- no further nudge.
    rerender(<LabelVisibility markers={MARKERS} active={true} onChange={onChange} />)
    expect(mockInvalidateSize).toHaveBeenCalledTimes(1)
  })

  it('does not re-nudge invalidateSize when the merged effect re-runs for a reason other than a rising edge (active stays true throughout, only markers change)', () => {
    mockZoom = LABEL_ZOOM_FLOOR
    const onChange = vi.fn()
    const { rerender } = render(<LabelVisibility markers={MARKERS} active={true} onChange={onChange} />)
    // Mounting already active is not a rising edge (wasActiveRef starts equal to `active`).
    expect(mockInvalidateSize).not.toHaveBeenCalled()
    expect(computeLabelPlacement).toHaveBeenCalledTimes(1)

    // Change `markers`'s reference so `recompute`'s own useCallback identity changes, forcing the
    // merged effect (keyed on [map, recompute, active]) to re-run even though `active` itself
    // never changes -- this is exactly the scenario `wasActiveRef` must guard against a false nudge.
    const changedMarkers: MapMarker[] = [
      ...MARKERS,
      { id: 'c', lat: 3, lng: 3, name: 'C', label: '', color: '#333333', dimmed: false },
    ]
    rerender(<LabelVisibility markers={changedMarkers} active={true} onChange={onChange} />)

    expect(computeLabelPlacement).toHaveBeenCalledTimes(2) // the effect did re-run...
    expect(mockInvalidateSize).not.toHaveBeenCalled() // ...but wasActiveRef correctly suppressed a nudge
  })

  it('fires invalidateSize again on a genuine second rising edge (true -> false -> true)', () => {
    mockZoom = LABEL_ZOOM_FLOOR
    const onChange = vi.fn()
    const { rerender } = render(<LabelVisibility markers={MARKERS} active={false} onChange={onChange} />)
    expect(mockInvalidateSize).not.toHaveBeenCalled()

    rerender(<LabelVisibility markers={MARKERS} active={true} onChange={onChange} />)
    expect(mockInvalidateSize).toHaveBeenCalledTimes(1)

    rerender(<LabelVisibility markers={MARKERS} active={false} onChange={onChange} />)
    expect(mockInvalidateSize).toHaveBeenCalledTimes(1) // falling edge -- no nudge

    rerender(<LabelVisibility markers={MARKERS} active={true} onChange={onChange} />)
    expect(mockInvalidateSize).toHaveBeenCalledTimes(2) // genuine second rising edge
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
