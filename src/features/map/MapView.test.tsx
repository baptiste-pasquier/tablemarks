import { useEffect, useRef } from 'react'
import { act, render, screen, waitFor, within, fireEvent } from '@testing-library/react'
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
// fakeMarkerTarget / blurSpy stand in for Leaflet's real click-event target (a `L.Marker`
// instance), which production code calls `closeTooltip()` / `getElement().blur()` on.
// internalTooltipOpen stands in for Leaflet's own internal click-to-open-tooltip listener
// (bound via `bindTooltip`'s `_initTooltipInteractions`) — a *second*, independent listener
// on the same 'click' event, which the ordering test below registers alongside ours.
// clickListenerOrder lets each ordering-test variant control which of the two listeners the
// mock's marker element registers (and therefore dispatches) first, proving the production
// click handler's ordering guarantee holds regardless of which one Leaflet happens to run first.
//
// tooltipOpen / mapMoving / moveEndListeners make the tooltip stand-in *stateful*, mirroring
// Leaflet's real `Tooltip.prototype._openTooltip` (node_modules/leaflet/src/layer/Tooltip.js):
// when `mapMoving.current` is true at "open" time, it doesn't open — it arms itself on the
// mock map's `once('moveend', ...)` and re-checks once that fires, exactly like the real
// `dragging.moving()` guard. This is what lets the KTD6 regression test below actually prove
// the production fix (arming a competing one-time `moveend` close) wins against Leaflet's own
// deferred re-open, instead of merely asserting a spy was called.
const {
  mockMapSetView,
  tileLayerProps,
  mapContainerProps,
  mockZoomIn,
  mockZoomOut,
  fakeMarkerTarget,
  blurSpy,
  internalTooltipOpen,
  clickListenerOrder,
  tooltipOpen,
  mapMoving,
  fireMoveEnd,
  onceMoveEnd,
} = vi.hoisted(() => {
  const blur = vi.fn()
  const tooltipOpen = { current: false }
  const mapMoving = { current: false }
  const moveEndListeners: Array<() => void> = []
  const onceMoveEnd = (cb: () => void) => {
    moveEndListeners.push(cb)
  }
  const fireMoveEnd = () => {
    // Real `map.once` fires each registered listener exactly once, then drops it — snapshot
    // and clear before invoking so a listener that re-arms itself (as the internal tooltip's
    // recursive re-check below does while still moving) doesn't get invoked in the same pass.
    const listeners = moveEndListeners.splice(0)
    listeners.forEach((listener) => listener())
  }
  const openOnceFlag = { current: false }
  // Mirrors Tooltip.js's `_openTooltip`: bails out to a deferred `moveend` re-check while the
  // map is moving, otherwise opens. Wrapped in vi.fn() below so it stays spy-able (the existing
  // ordering test reads `.mock.invocationCallOrder`) while actually modeling open/closed state.
  function openInternalTooltip(_event?: unknown) {
    if (mapMoving.current && !openOnceFlag.current) {
      openOnceFlag.current = true
      onceMoveEnd(() => {
        openOnceFlag.current = false
        openInternalTooltip()
      })
      return
    }
    tooltipOpen.current = true
  }
  return {
    mockMapSetView: vi.fn(),
    tileLayerProps: { current: null as Record<string, unknown> | null },
    mapContainerProps: { current: null as Record<string, unknown> | null },
    mockZoomIn: vi.fn(),
    mockZoomOut: vi.fn(),
    blurSpy: blur,
    fakeMarkerTarget: {
      closeTooltip: vi.fn(() => {
        tooltipOpen.current = false
      }),
      getElement: () => ({ blur }),
    },
    internalTooltipOpen: vi.fn(openInternalTooltip),
    clickListenerOrder: { current: 'internal-first' as 'internal-first' | 'real-first' },
    tooltipOpen,
    mapMoving,
    fireMoveEnd,
    // Exposed so the react-leaflet mock's `map` object (below, in the vi.mock factory) can wire
    // its own `dragging.moving()` / `once('moveend', ...)` to this same state — production code
    // calls these on the *map* (via `useMap()`/the MapContainer ref), not on the marker.
    onceMoveEnd,
  }
})

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
// Zoom-limit knobs backing the ZoomControl disabled-state tests (U3 R3) — mutable per-test like
// `mockZoom` above, so a test can simulate the map already sitting at a limit.
let mockMaxZoom = 18
let mockMinZoom = 0
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
  const baseMap = createMockLeafletMap({
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
    getMaxZoom: () => mockMaxZoom,
    getMinZoom: () => mockMinZoom,
    zoomIn: mockZoomIn,
    zoomOut: mockZoomOut,
  })
  // `createMockLeafletMap`'s override type doesn't model `dragging`/`once` (only MapView.tsx's
  // click/tooltip guard needs them, not LabelVisibility), so they're added here rather than
  // passed through its typed parameter.
  const map = {
    ...baseMap,
    // KTD6: mirrors the real `L.Map`'s public `dragging.moving()` accessor (see
    // node_modules/leaflet/src/map/handler/Map.Drag.js's `moving()`), which the production
    // click handler reads to detect an inertia-coasting map at click time, and `once()`, which
    // it uses to arm a matching one-time close for Leaflet's own deferred tooltip re-open.
    // Deliberately separate from the `on`/`off` handler registry above (which models Leaflet's
    // *continuous* zoomend/moveend subscriptions for LabelVisibility): `once` here only serves
    // the one-shot KTD6 path via `onceMoveEnd`/`fireMoveEnd`.
    dragging: { moving: () => mapMoving.current },
    once: (event: string, cb: () => void) => {
      if (event === 'moveend') onceMoveEnd(cb)
    },
  }
  return {
    // Forwards `ref` to the stable map instance — MapView.tsx reads it back via `ref={setMap}`
    // (React 19 ref-as-prop) to call `map.setView(...)` from the "Localiser" tap.
    MapContainer: ({
      children,
      ref,
      ...rest
    }: {
      children?: React.ReactNode
      ref?: (m: typeof map) => void
      [key: string]: unknown
    }) => {
      mapContainerProps.current = rest
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
      eventHandlers?: { click?: (event: L.LeafletMouseEvent) => void }
      interactive?: boolean
      keyboard?: boolean
    }) => {
      const iconSize = icon.options.iconSize as L.PointTuple | undefined
      const elementRef = useRef<HTMLDivElement | null>(null)
      // Real Leaflet dispatches a native DOM click that can carry more than one 'click'
      // listener on the same element (ours, and Leaflet's own internal tooltip-open
      // listener) — simulate that with real addEventListener calls (not the `onClick` prop,
      // which would only ever model a single React-attached handler) so registration order
      // is under the test's control, matching real DOM dispatch order.
      useEffect(() => {
        const el = elementRef.current
        const real = eventHandlers?.click
        if (!el || !real) return
        const fakeEvent = { target: fakeMarkerTarget } as unknown as L.LeafletMouseEvent
        const onReal = () => real(fakeEvent)
        const onInternal = () => internalTooltipOpen(fakeEvent)
        const listeners =
          clickListenerOrder.current === 'internal-first' ? [onInternal, onReal] : [onReal, onInternal]
        listeners.forEach((listener) => el.addEventListener('click', listener))
        return () => {
          listeners.forEach((listener) => el.removeEventListener('click', listener))
        }
      }, [eventHandlers])
      return (
        <div
          ref={elementRef}
          data-testid={`marker-${position[0]}-${position[1]}`}
          data-size={iconSize?.[0]}
          data-html={icon.options.html as string}
          data-icon-html={icon.options.html}
          data-interactive={interactive}
          data-keyboard={keyboard}
        >
          {children}
        </div>
      )
    },
    Tooltip: ({ children, className }: { children?: React.ReactNode; className?: string }) => (
      <div data-testid="tooltip" className={className}>
        {children}
      </div>
    ),
    useMap: () => map,
  }
})

beforeEach(() => {
  mockZoom = 12
  mockMaxZoom = 18
  mockMinZoom = 0
  mockProject = (lat, lng) => ({ x: lng * 20, y: lat * 20 })
  mockSizeIsStale = false
  handlers.clear()
  vi.mocked(computeLabelPlacement).mockClear()
  mockInvalidateSize.mockClear()
  mapContainerProps.current = null
  mockZoomIn.mockClear()
  mockZoomOut.mockClear()
})

const { mockGeolocate } = vi.hoisted(() => ({ mockGeolocate: vi.fn<() => Promise<GeoPoint | null>>() }))
vi.mock('../../lib/geolocate', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/geolocate')>()
  return { ...actual, geolocate: () => mockGeolocate() }
})

const MARKERS: MapMarker[] = [
  { id: 'a', lat: 1, lng: 1, name: 'A', pending: false, visitCount: 0, latestVerdict: null, color: '#111111', dimmed: false },
  { id: 'b', lat: 2, lng: 2, name: 'B', pending: false, visitCount: 0, latestVerdict: null, color: '#222222', dimmed: false },
]

describe('MapView', () => {
  beforeEach(() => {
    mockGeolocate.mockReset()
    mockMapSetView.mockClear()
    tileLayerProps.current = null
    fakeMarkerTarget.closeTooltip.mockClear()
    blurSpy.mockClear()
    internalTooltipOpen.mockClear()
    clickListenerOrder.current = 'internal-first'
    tooltipOpen.current = false
    mapMoving.current = false
  })

  it('renders an unselected marker as a same-size teardrop pin', () => {
    const { getByTestId } = render(<MapView markers={MARKERS} />)
    expect(getByTestId('marker-1-1').dataset.size).toBe('24')
    expect(getByTestId('marker-2-2').dataset.size).toBe('24')
  })

  describe('marker accessible name (U4 R6, KTD7)', () => {
    it("sets the icon's aria-label to the restaurant's name", () => {
      render(<MapView markers={MARKERS} />)
      expect(screen.getByTestId('marker-1-1').dataset.iconHtml).toContain('aria-label="A"')
      expect(screen.getByTestId('marker-2-2').dataset.iconHtml).toContain('aria-label="B"')
    })

    it("does not affect the current-position marker's own accessible label", () => {
      render(<MapView markers={MARKERS} currentPosition={{ lat: 5, lng: 6 }} />)
      expect(screen.getByTestId('marker-5-6').dataset.iconHtml).toContain(
        'aria-label="Your current location"',
      )
    })

    it('gives two same-color, same-selection restaurants their own correctly-named icon (cache-key fix)', () => {
      const sameColor: MapMarker[] = [
        { ...MARKERS[0], id: 'x', lat: 10, lng: 10, name: 'Same Color X', color: '#abcabc' },
        { ...MARKERS[1], id: 'y', lat: 11, lng: 11, name: 'Same Color Y', color: '#abcabc' },
      ]
      render(<MapView markers={sameColor} />)
      expect(screen.getByTestId('marker-10-10').dataset.iconHtml).toContain('aria-label="Same Color X"')
      expect(screen.getByTestId('marker-11-11').dataset.iconHtml).toContain('aria-label="Same Color Y"')
    })

    it('HTML-escapes a restaurant name containing quotes/markup before interpolating it into the icon HTML', () => {
      const tricky: MapMarker[] = [
        { ...MARKERS[0], id: 'z', lat: 20, lng: 20, name: `<b>"Tom's"</b> & Jerry` },
      ]
      render(<MapView markers={tricky} />)
      const html = screen.getByTestId('marker-20-20').dataset.iconHtml ?? ''
      expect(html).toContain('aria-label="&lt;b&gt;&quot;Tom&#39;s&quot;&lt;/b&gt; &amp; Jerry"')
      expect(html).not.toContain('aria-label="<b>"Tom\'s"</b> & Jerry"')
    })
  })

  it('renders the selected marker larger, and moves the glow when selection changes', () => {
    const { getByTestId, rerender } = render(<MapView markers={MARKERS} selectedId="a" onSelect={vi.fn()} />)
    expect(getByTestId('marker-1-1').dataset.size).toBe('30')
    expect(getByTestId('marker-2-2').dataset.size).toBe('24')

    rerender(<MapView markers={MARKERS} selectedId="b" onSelect={vi.fn()} />)
    expect(getByTestId('marker-1-1').dataset.size).toBe('24')
    expect(getByTestId('marker-2-2').dataset.size).toBe('30')
  })

  describe('hovered marker halo (U2 R1-R3, KTD3)', () => {
    it('renders the hovered marker with the same halo/size as a selected marker, and moves it when hoveredId changes', () => {
      const { getByTestId, rerender } = render(<MapView markers={MARKERS} hoveredId="a" />)
      expect(getByTestId('marker-1-1').dataset.size).toBe('30')
      expect(getByTestId('marker-2-2').dataset.size).toBe('24')

      rerender(<MapView markers={MARKERS} hoveredId="b" />)
      expect(getByTestId('marker-1-1').dataset.size).toBe('24')
      expect(getByTestId('marker-2-2').dataset.size).toBe('30')
    })

    it('never pans or re-centers the map when only hoveredId changes (R2)', () => {
      const { rerender } = render(<MapView markers={MARKERS} hoveredId={null} />)
      mockMapSetView.mockClear()

      rerender(<MapView markers={MARKERS} hoveredId="a" />)
      rerender(<MapView markers={MARKERS} hoveredId="b" />)
      rerender(<MapView markers={MARKERS} hoveredId={null} />)

      expect(mockMapSetView).not.toHaveBeenCalled()
    })

    it('renders one unchanged halo/size, not a "double" state, for a marker that is both selectedId and hoveredId', () => {
      const { getByTestId } = render(
        <MapView markers={MARKERS} selectedId="a" hoveredId="a" onSelect={vi.fn()} />,
      )
      expect(getByTestId('marker-1-1').dataset.size).toBe('30')
      expect(getByTestId('marker-2-2').dataset.size).toBe('24')
    })
  })

  describe('marker click / tooltip guard (U2 R2, R3, KTD3, KTD4)', () => {
    it('still calls onSelect(m.id) when a restaurant marker is clicked (regression)', async () => {
      const onSelect = vi.fn()
      render(<MapView markers={MARKERS} onSelect={onSelect} />)

      fireEvent.click(screen.getByTestId('marker-1-1'))

      await waitFor(() => expect(onSelect).toHaveBeenCalledWith('a'))
    })

    it.each([
      ['internal-first', 'internal-first' as const],
      ['real-first', 'real-first' as const],
    ])(
      'closes the tooltip and blurs the marker before selecting, and after Leaflet\'s own internal tooltip-open click handler — registration order: %s',
      async (_label, order) => {
        clickListenerOrder.current = order
        const onSelect = vi.fn()
        render(<MapView markers={MARKERS} onSelect={onSelect} />)

        fireEvent.click(screen.getByTestId('marker-1-1'))

        // The close/blur/select sequence is deferred (queueMicrotask) past the synchronous
        // click-dispatch phase — wait for it to flush before asserting.
        await waitFor(() => expect(onSelect).toHaveBeenCalledWith('a'))

        const closeOrder = fakeMarkerTarget.closeTooltip.mock.invocationCallOrder[0]
        const blurOrder = blurSpy.mock.invocationCallOrder[0]
        const selectOrder = onSelect.mock.invocationCallOrder[0]
        const internalOrder = internalTooltipOpen.mock.invocationCallOrder[0]

        // KTD3: the tooltip-close always runs after Leaflet's own internal tooltip-open
        // click binding, regardless of which one Leaflet happened to register (and thus
        // invoke) first.
        expect(closeOrder).toBeGreaterThan(internalOrder)
        // KTD4: close and blur happen before the modal-opening onSelect fires.
        expect(closeOrder).toBeLessThan(selectOrder)
        expect(blurOrder).toBeLessThan(selectOrder)
      },
    )

    it.each([
      ['internal-first', 'internal-first' as const],
      ['real-first', 'real-first' as const],
    ])(
      "closes the tooltip again after a deferred 'moveend' when the map is coasting from inertia at click time, so Leaflet's own deferred tooltip re-open never resurfaces after the modal has opened (KTD6 regression) — registration order: %s",
      async (_label, order) => {
        clickListenerOrder.current = order
        mapMoving.current = true // the map is still coasting from an inertial pan at click time
        const onSelect = vi.fn()
        render(<MapView markers={MARKERS} onSelect={onSelect} />)

        fireEvent.click(screen.getByTestId('marker-1-1'))
        await waitFor(() => expect(onSelect).toHaveBeenCalledWith('a'))

        // Leaflet's own internal click-to-open-tooltip handler saw the map moving and deferred
        // itself (armed its own one-time 'moveend' re-check) instead of opening synchronously —
        // it has not opened yet.
        expect(tooltipOpen.current).toBe(false)

        // The pan settles.
        mapMoving.current = false
        fireMoveEnd()

        // Leaflet's deferred handler re-checks on 'moveend' and — now that the map has
        // stopped — opens the tooltip. Without KTD6, that would be the end of it and this
        // would now be `true`. The production fix's own 'moveend' listener is armed inside the
        // same queueMicrotask that runs the close/blur/select sequence, which is guaranteed to
        // run after every synchronous 'click' listener (including Leaflet's own) regardless of
        // dispatch order, so it is always registered — and therefore always fires — after
        // Leaflet's deferred re-open, closing the tooltip a second time.
        expect(tooltipOpen.current).toBe(false)
      },
    )
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

  describe('Recenter (U3 R1-R4)', () => {
    it('centers on currentPosition as soon as it is available on first render (AE1)', () => {
      const point: GeoPoint = { lat: 1, lng: 2 }
      render(<MapView markers={[]} currentPosition={point} />)
      expect(mockMapSetView).toHaveBeenCalledWith([point.lat, point.lng], 12)
    })

    it('centers on fallbackCenter when no live position is available (AE2, AE3 first half)', () => {
      const fallback: GeoPoint = { lat: 3, lng: 4 }
      render(<MapView markers={[]} currentPosition={null} fallbackCenter={fallback} />)
      expect(mockMapSetView).toHaveBeenCalledWith([fallback.lat, fallback.lng], 12)
    })

    it('re-centers onto a live position that resolves after the fallback already centered (AE3 second half)', () => {
      const fallback: GeoPoint = { lat: 3, lng: 4 }
      const { rerender } = render(
        <MapView markers={[]} currentPosition={null} fallbackCenter={fallback} />,
      )
      expect(mockMapSetView).toHaveBeenCalledWith([fallback.lat, fallback.lng], 12)

      const point: GeoPoint = { lat: 5, lng: 6 }
      rerender(<MapView markers={[]} currentPosition={point} fallbackCenter={fallback} />)
      expect(mockMapSetView).toHaveBeenCalledWith([point.lat, point.lng], 12)
    })

    it('centers on currentPosition, not fallbackCenter, when both are already truthy on the very first render (R1)', () => {
      const point: GeoPoint = { lat: 5, lng: 6 }
      const fallback: GeoPoint = { lat: 3, lng: 4 }
      render(<MapView markers={[]} currentPosition={point} fallbackCenter={fallback} />)

      expect(mockMapSetView).toHaveBeenCalledTimes(1)
      expect(mockMapSetView).toHaveBeenCalledWith([point.lat, point.lng], 12)
      expect(mockMapSetView).not.toHaveBeenCalledWith([fallback.lat, fallback.lng], 12)
    })

    it('does not let a fallback arriving after a live position override it (R1)', () => {
      const point: GeoPoint = { lat: 5, lng: 6 }
      const { rerender } = render(
        <MapView markers={[]} currentPosition={point} fallbackCenter={null} />,
      )
      expect(mockMapSetView).toHaveBeenCalledWith([point.lat, point.lng], 12)

      const fallback: GeoPoint = { lat: 3, lng: 4 }
      rerender(<MapView markers={[]} currentPosition={point} fallbackCenter={fallback} />)
      expect(mockMapSetView).not.toHaveBeenCalledWith([fallback.lat, fallback.lng], 12)
    })

    it('centers on the first marker when there is no fallbackCenter, exactly as today (AE4)', () => {
      const { rerender } = render(<MapView markers={[]} fallbackCenter={null} />)
      expect(mockMapSetView).not.toHaveBeenCalled()

      rerender(<MapView markers={MARKERS} fallbackCenter={null} />)
      expect(mockMapSetView).toHaveBeenCalledWith([MARKERS[0].lat, MARKERS[0].lng], 12)
    })

    it('does not re-trigger centering once a tier has already fired, on a later unrelated markers/fallbackCenter change', () => {
      const fallback: GeoPoint = { lat: 3, lng: 4 }
      const { rerender } = render(<MapView markers={[]} fallbackCenter={fallback} />)
      expect(mockMapSetView).toHaveBeenCalledTimes(1)

      rerender(<MapView markers={MARKERS} fallbackCenter={fallback} />)
      expect(mockMapSetView).toHaveBeenCalledTimes(1)

      rerender(<MapView markers={MARKERS} fallbackCenter={{ lat: 9, lng: 9 }} />)
      expect(mockMapSetView).toHaveBeenCalledTimes(1)
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

    it('renders the current-position marker with no click handler and no tooltip, unlike restaurant pins', () => {
      const onSelect = vi.fn()
      render(
        <MapView markers={MARKERS} currentPosition={{ lat: 5, lng: 6 }} onSelect={onSelect} />,
      )

      const marker = screen.getByTestId('marker-5-6')
      expect(within(marker).queryByTestId('tooltip')).not.toBeInTheDocument()

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

  it('disables the default Leaflet zoom control, since a custom one replaces it (U3 R3)', () => {
    render(<MapView markers={MARKERS} />)
    expect(mapContainerProps.current?.zoomControl).toBe(false)
  })

  describe('zoom control (U3 R3)', () => {
    it('calls map.zoomIn()/zoomOut() when its buttons are clicked', async () => {
      const user = userEvent.setup()
      render(<MapView markers={[]} />)

      await user.click(screen.getByRole('button', { name: /zoom in/i }))
      expect(mockZoomIn).toHaveBeenCalledTimes(1)

      await user.click(screen.getByRole('button', { name: /zoom out/i }))
      expect(mockZoomOut).toHaveBeenCalledTimes(1)
    })

    it('carries translated aria-labels distinct from the Locate button', () => {
      render(<MapView markers={[]} />)
      expect(screen.getByRole('button', { name: 'Zoom in' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Zoom out' })).toBeInTheDocument()
    })

    it('disables zoom-in at the max zoom and zoom-out at the min zoom, tracked via zoomend (matching the Leaflet default control it replaces)', () => {
      mockMaxZoom = 14
      mockMinZoom = 10
      mockZoom = 12
      render(<MapView markers={[]} />)
      expect(screen.getByRole('button', { name: /zoom in/i })).not.toBeDisabled()
      expect(screen.getByRole('button', { name: /zoom out/i })).not.toBeDisabled()

      mockZoom = 14
      act(() => fire('zoomend'))
      expect(screen.getByRole('button', { name: /zoom in/i })).toBeDisabled()
      expect(screen.getByRole('button', { name: /zoom out/i })).not.toBeDisabled()

      mockZoom = 10
      act(() => fire('zoomend'))
      expect(screen.getByRole('button', { name: /zoom out/i })).toBeDisabled()
      expect(screen.getByRole('button', { name: /zoom in/i })).not.toBeDisabled()
    })

    it('unsubscribes its zoomend handler on unmount, alongside LabelVisibility', () => {
      const { unmount } = render(<MapView markers={[]} />)
      // ZoomControl's own `update` handler plus LabelVisibility's `recompute` handler.
      expect(handlers.get('zoomend')?.size).toBe(2)

      unmount()
      expect(handlers.get('zoomend')?.size).toBe(0)
    })
  })

  it("positions the Locate/zoom control stack's top offset from the measured --filter-overlay-height CSS variable (KTD3), so it always clears the filter overlay regardless of its rendered height", () => {
    render(<MapView markers={[]} />)
    const stack = screen.getByRole('button', { name: /center on my location/i }).parentElement
    expect(stack?.className).toContain('--filter-overlay-height')
  })

  it('shares the same right offset (--filter-overlay-gap) as the desktop filter overlay, so the two right-align instead of drifting apart', () => {
    render(<MapView markers={[]} />)
    const stack = screen.getByRole('button', { name: /center on my location/i }).parentElement
    expect(stack).toHaveClass('right-3', 'md:right-[var(--filter-overlay-gap)]')
  })

  it("stops 'dblclick' and 'wheel' from bubbling out of the Locate/zoom control stack, so interacting with these buttons can't also reach the map's own doubleClickZoom/scrollWheelZoom handling", () => {
    const { container } = render(<MapView markers={[]} />)
    const onDblClick = vi.fn()
    const onWheel = vi.fn()
    container.addEventListener('dblclick', onDblClick)
    container.addEventListener('wheel', onWheel)

    const zoomInButton = screen.getByRole('button', { name: /zoom in/i })
    zoomInButton.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
    zoomInButton.dispatchEvent(new WheelEvent('wheel', { bubbles: true }))

    expect(onDblClick).not.toHaveBeenCalled()
    expect(onWheel).not.toHaveBeenCalled()
  })

  describe('tooltip content (U3 R4, R5, KTD5)', () => {
    const visitedMarker: MapMarker = {
      id: 'v',
      lat: 3,
      lng: 3,
      name: 'Visited Place',
      pending: false,
      visitCount: 3,
      latestVerdict: 'go_back',
      cuisine: 'Italian',
      color: '#333333',
      dimmed: false,
    }
    const toTryMarker: MapMarker = {
      id: 't',
      lat: 4,
      lng: 4,
      name: 'To Try Place',
      pending: false,
      visitCount: 0,
      latestVerdict: null,
      color: '#444444',
      dimmed: false,
    }

    it("shows the visited restaurant's status badge text and visit-count text", () => {
      render(<MapView markers={[visitedMarker]} />)
      const tooltip = screen.getByTestId('tooltip')
      expect(within(tooltip).getByText('Go back')).toBeInTheDocument()
      expect(within(tooltip).getByText('3 visits')).toBeInTheDocument()
    })

    it("shows a to-try restaurant's status badge with no visit-count text", () => {
      render(<MapView markers={[toTryMarker]} />)
      const tooltip = screen.getByTestId('tooltip')
      expect(within(tooltip).getByText('To try')).toBeInTheDocument()
      expect(within(tooltip).queryByText(/visit/i)).not.toBeInTheDocument()
    })

    it('shows the cuisine emoji and name when set, and the uncategorized emoji/label when not set', () => {
      render(<MapView markers={[visitedMarker, toTryMarker]} />)
      const [visitedTooltip, toTryTooltip] = screen.getAllByTestId('tooltip')
      expect(within(visitedTooltip).getByText('🍝')).toBeInTheDocument()
      expect(within(visitedTooltip).getByText('Italian')).toBeInTheDocument()
      expect(within(toTryTooltip).getByText('🍽️')).toBeInTheDocument()
      expect(within(toTryTooltip).getByText('Uncategorized')).toBeInTheDocument()
    })

    it('gives the tooltip element the marker-tooltip wrapping CSS class (KTD5)', () => {
      render(<MapView markers={[visitedMarker]} />)
      expect(screen.getByTestId('tooltip')).toHaveClass('marker-tooltip')
    })
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
      { id: 'x', lat: 5, lng: 5, name: dangerousName, pending: false, visitCount: 0, latestVerdict: null, color: '#444444', dimmed: false },
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

  it('feeds the hovered marker\'s larger icon radius into label placement, same as a selected marker (U2 KTD3 parity)', () => {
    mockZoom = LABEL_ZOOM_FLOOR
    const onChange = vi.fn()
    const { rerender } = render(<LabelVisibility markers={MARKERS} onChange={onChange} />)
    expect(vi.mocked(computeLabelPlacement).mock.calls[0][0]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'a', iconRadius: 12 }),
        expect.objectContaining({ id: 'b', iconRadius: 12 }),
      ]),
    )

    rerender(<LabelVisibility markers={MARKERS} hoveredId="a" onChange={onChange} />)
    expect(vi.mocked(computeLabelPlacement).mock.calls[1][0]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'a', iconRadius: 15 }),
        expect.objectContaining({ id: 'b', iconRadius: 12 }),
      ]),
    )
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
      { id: 'c', lat: 3, lng: 3, name: 'C', pending: false, visitCount: 0, latestVerdict: null, color: '#333333', dimmed: false },
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
