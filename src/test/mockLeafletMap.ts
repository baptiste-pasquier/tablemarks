/**
 * Shared stub for react-leaflet's `useMap()` return value, used by both `App.test.tsx` (a static,
 * no-op shell — it only needs LabelVisibility's mount-time recompute not to throw) and
 * `MapView.test.tsx` (a stateful map — mutable zoom/projection knobs plus a `zoomend`/`moveend`
 * handler registry so tests can simulate Leaflet firing those events). Each test file keeps its
 * own `vi.mock('react-leaflet', ...)` call (that part can't be shared across files — vitest
 * hoists mock factories per file), but both build their `map` object from this one factory so a
 * future Leaflet-API addition only needs to land here, not by hand in two divergent copies.
 *
 * Every field is overridable so a caller can pass mutable-knob-backed closures (e.g.
 * `getZoom: () => mockZoom`) instead of a fixed value. Per vitest's mock-hoisting rules, any
 * `mock*`-prefixed variable a `vi.mock('react-leaflet', ...)` factory closes over must be read
 * lazily inside a function — exactly how every field below is already shaped — never assigned as
 * a bare property value (e.g. `invalidateSize: mockInvalidateSize` throws a TDZ
 * `ReferenceError`; `invalidateSize: () => mockInvalidateSize()` is safe).
 */

export interface MockLeafletMapOverrides {
  setView?: (center: [number, number], zoom: number) => void
  getZoom?: () => number
  getCenter?: () => { lat: number; lng: number }
  /** Container size in pixels, used by `LabelVisibility` to compute its view-center anchor. */
  getSize?: () => { x: number; y: number }
  latLngToContainerPoint?: (latlng: [number, number]) => { x: number; y: number }
  invalidateSize?: () => void
  on?: (event: string, handler: () => void) => void
  off?: (event: string, handler: () => void) => void
  /** Zoom-limit accessors and imperative zoom actions backing MapView's `ZoomControl` (U3 R3). */
  getMaxZoom?: () => number
  getMinZoom?: () => number
  zoomIn?: () => void
  zoomOut?: () => void
}

export interface MockLeafletMap {
  setView: (center: [number, number], zoom: number) => void
  getZoom: () => number
  getCenter: () => { lat: number; lng: number }
  getSize: () => { x: number; y: number }
  latLngToContainerPoint: (latlng: [number, number]) => { x: number; y: number }
  invalidateSize: () => void
  on: (event: string, handler: () => void) => void
  off: (event: string, handler: () => void) => void
  getMaxZoom: () => number
  getMinZoom: () => number
  zoomIn: () => void
  zoomOut: () => void
}

/** Builds a stubbed Leaflet `Map` instance for `useMap()` to return in tests. */
export function createMockLeafletMap(overrides: MockLeafletMapOverrides = {}): MockLeafletMap {
  return {
    setView: overrides.setView ?? (() => {}),
    getZoom: overrides.getZoom ?? (() => 12),
    getCenter: overrides.getCenter ?? (() => ({ lat: 0, lng: 0 })),
    getSize: overrides.getSize ?? (() => ({ x: 400, y: 400 })),
    latLngToContainerPoint:
      overrides.latLngToContainerPoint ?? (([lat, lng]) => ({ x: lng * 10, y: lat * 10 })),
    invalidateSize: overrides.invalidateSize ?? (() => {}),
    on: overrides.on ?? (() => {}),
    off: overrides.off ?? (() => {}),
    getMaxZoom: overrides.getMaxZoom ?? (() => 18),
    getMinZoom: overrides.getMinZoom ?? (() => 0),
    zoomIn: overrides.zoomIn ?? (() => {}),
    zoomOut: overrides.zoomOut ?? (() => {}),
  }
}
