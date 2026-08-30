import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet'
import L from 'leaflet'
import type { MapMarker } from './markers'
import { geolocate, type GeoPoint } from '../../lib/geolocate'
import { DEFAULT_MAP_CENTER } from '../../lib/geo'
import { computeLabelPlacement, type LabelCandidate, type ScreenPoint } from './labelPlacement'

/**
 * Minimum zoom level at which restaurant name labels become eligible to show (R1/R2). Tunable —
 * start near 14 and retune once real device testing shows how much room labels actually need.
 */
export const LABEL_ZOOM_FLOOR = 14

/**
 * Restaurant names longer than this are truncated with an ellipsis for the on-map label only
 * (the Popup always shows the full name) — an unbounded name would otherwise render as an
 * unclipped banner that can cover most of the map. 24 is a judgment call, not a design spec.
 */
const MAX_LABEL_CHARS = 24

/** Truncates a name for on-map label display only — never for the Popup's full name. */
function truncateLabel(name: string): string {
  return name.length > MAX_LABEL_CHARS ? `${name.slice(0, MAX_LABEL_CHARS - 1)}…` : name
}

/**
 * Cache of just the teardrop pin's own HTML fragment, keyed on `color:selected` only — bounded by
 * (distinct cuisine colors) x 2, so many same-color/selection markers share one cached string
 * regardless of restaurant name. Deliberately does NOT include `labelText` in the key: that used
 * to make this cache grow unbounded with restaurant-name cardinality.
 */
const pinHtmlCache = new Map<string, string>()

function pinHtml(color: string, selected: boolean): string {
  const key = `${color}:${selected ? 1 : 0}`
  let html = pinHtmlCache.get(key)
  if (!html) {
    const shadow = selected
      ? `box-shadow:0 0 0 5px ${color}33, 0 3px 6px rgba(0,0,0,.4);`
      : `box-shadow:0 2px 4px rgba(0,0,0,.35);`
    html = `<span style="position:absolute;inset:0;display:block;border-radius:50% 50% 50% 0;background:${color};border:2px solid #fff;transform:rotate(-45deg);${shadow}"><span style="position:absolute;top:50%;left:50%;width:7px;height:7px;margin:-3.5px 0 0 -3.5px;border-radius:9999px;background:rgba(255,255,255,.92)"></span></span>`
    pinHtmlCache.set(key, html)
  }
  return html
}

/** Escapes text for safe interpolation into a raw HTML string (restaurant names are user data). */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * A teardrop pin in the cuisine color, with a brand halo when selected and, when `labelText` is
 * given, a name label rendered beside the pin (R1/R3). The label is baked directly into the
 * icon's HTML (rather than a separate react-leaflet Tooltip) so it moves and z-index-stacks with
 * the marker for free, and so `aria-hidden` can be hand-written into the markup — the label is
 * decorative only, the accessible name lives in the marker's Popup (KTD7).
 *
 * Only the pin's own HTML fragment is cached (see `pinHtml`, keyed on color+selected only); this
 * function itself builds a fresh `L.divIcon` per call so a per-restaurant-name `labelText` never
 * grows an unbounded cache — constructing the wrapper/label markup and the `L.divIcon` object is
 * cheap, so there's no caching benefit to lose there.
 */
function iconForColor(color: string, selected: boolean, labelText?: string): L.DivIcon {
  const size = selected ? 30 : 24
  const label = labelText
    ? `<span aria-hidden="true" style="position:absolute;top:50%;left:100%;transform:translateY(-50%);margin-left:6px;padding:1px 6px;border-radius:4px;background:rgba(255,255,255,.92);box-shadow:0 1px 3px rgba(0,0,0,.3);font-size:11px;line-height:1.5;font-family:system-ui, sans-serif;color:#1f2937;white-space:nowrap;pointer-events:none;">${escapeHtml(labelText)}</span>`
    : ''
  return L.divIcon({
    className: '',
    html: `<span style="position:relative;display:block;width:${size}px;height:${size}px;">${pinHtml(color, selected)}${label}</span>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size],
    popupAnchor: [0, -size],
  })
}

const DEFAULT_CENTER: [number, number] = [DEFAULT_MAP_CENTER.lat, DEFAULT_MAP_CENTER.lng]

/**
 * MapContainer's center/zoom apply only on initial render. When the map first renders empty
 * (no markers yet) and markers load afterward, recenter once on the first marker.
 */
function Recenter({ markers }: { markers: MapMarker[] }) {
  const map = useMap()
  const centered = useRef(false)
  useEffect(() => {
    if (!centered.current && markers.length > 0) {
      map.setView([markers[0].lat, markers[0].lng], map.getZoom())
      centered.current = true
    }
  }, [markers, map])
  return null
}

/** Report the map's center to the consumer on mount and on every move, so it can serve as an anchor. */
function CenterReporter({ onChange }: { onChange?: (center: GeoPoint) => void }) {
  const map = useMap()
  // Keep the latest onChange in a ref so the effect depends only on `map` (stable) — no
  // stale closure, and `moveend` is subscribed once per map rather than re-bound each render.
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  useEffect(() => {
    const emit = () => {
      const c = map.getCenter()
      onChangeRef.current?.({ lat: c.lat, lng: c.lng })
    }
    emit() // initial center
    map.on('moveend', emit)
    return () => {
      map.off('moveend', emit)
    }
  }, [map])
  return null
}

/**
 * Recomputes which markers' name labels should be visible (R1-R4) and reports the accepted id
 * set to the consumer — only when it actually changed, since a same-shape result is a no-op
 * update, not a fresh state push. Modeled on `CenterReporter`, but deliberately does NOT hold
 * `markers` in a ref (KTD2 sanctioned simplification): recompute must react to a facet-filter
 * toggle or a restaurant add/delete/edit/import, neither of which fires a Leaflet event, so
 * `markers` is listed directly in `recompute`'s own dependency array instead. `onChange` is not
 * ref-optimized either: `MapView` passes a `useState` setter, which is referentially stable
 * across renders, so depending on it directly is safe and simpler.
 *
 * Also owns the mobile List-pane-restore nudge (KTD10): that pane switch keeps this component
 * mounted but hidden (`display:none`) while inactive, a transition that fires no resize event, so
 * both Leaflet's own tile grid and this component's screen-space projections go stale until the
 * pane becomes visible again. `invalidateSize()` must run before the next `recompute()` reads
 * `map.getSize()` — both calls (plus the zoomend/moveend subscription and the initial compute)
 * live in one single effect below, keyed on `[map, recompute, active]`, so there is exactly one
 * ordering path: the rising-edge check and its `invalidateSize()` always run first, before the
 * one `recompute()` call in that same effect execution, regardless of which prop changed. Two
 * separate effects that could both call `recompute()` in the same commit (e.g. one keyed on
 * `[map, recompute]`, another on `[active, map, recompute]`) would race whenever `markers` and
 * `active` change together, since `recompute`'s identity changes with `markers`.
 *
 * Exported (rather than kept private) so tests can render it directly and observe what it
 * reports via `onChange`, without needing to reach into `MapView`'s own state.
 */
export function LabelVisibility({
  markers,
  active,
  selectedId,
  onChange,
}: {
  markers: MapMarker[]
  active?: boolean
  /**
   * Used purely as a geometry input (which icon radius — 24 vs 30 — applies to the selected
   * marker), never to suppress/prioritize a label: visibility eligibility is still governed
   * solely by `visibleLabelIds`/`computeLabelPlacement`, no special-casing of `selectedId` here
   * (KTD7 — see MapView's own guard for the enforcement point).
   */
  selectedId?: string | null
  onChange?: (visible: Set<string>) => void
}) {
  const map = useMap()
  const lastReportedRef = useRef<Set<string> | null>(null)

  const recompute = useCallback(() => {
    const zoomFloorMet = map.getZoom() >= LABEL_ZOOM_FLOOR
    const size = map.getSize()
    // Geometric pane center in container-pixel space, not adjusted for overlay UI (KTD7).
    const viewCenter: ScreenPoint = { x: size.x / 2, y: size.y / 2 }
    const candidates: LabelCandidate[] = markers.map((m) => {
      const point = map.latLngToContainerPoint([m.lat, m.lng])
      return {
        id: m.id,
        x: point.x,
        y: point.y,
        name: truncateLabel(m.name),
        dimmed: m.dimmed,
        iconRadius: (m.id === selectedId ? 30 : 24) / 2,
      }
    })
    const next = computeLabelPlacement(candidates, viewCenter, zoomFloorMet)
    const prev = lastReportedRef.current
    const changed = prev === null || next.size !== prev.size || [...next].some((id) => !prev.has(id))
    if (changed) {
      lastReportedRef.current = next
      onChange?.(next)
    }
  }, [map, markers, onChange, selectedId])

  const wasActiveRef = useRef(active)
  useEffect(() => {
    const becameActive = active && !wasActiveRef.current
    wasActiveRef.current = active
    if (becameActive) {
      map.invalidateSize()
    }
    recompute() // initial computation, so labels aren't absent when already past the zoom floor
    map.on('zoomend', recompute)
    map.on('moveend', recompute)
    return () => {
      map.off('zoomend', recompute)
      map.off('moveend', recompute)
    }
  }, [map, recompute, active])

  return null
}

export function MapView({
  markers,
  onSelect,
  onCenterChange,
  selectedId,
  active,
}: {
  markers: MapMarker[]
  onSelect?: (id: string) => void
  onCenterChange?: (center: GeoPoint) => void
  selectedId?: string | null
  active?: boolean
}) {
  const { t } = useTranslation()
  const center: [number, number] = markers.length
    ? [markers[0].lat, markers[0].lng]
    : DEFAULT_CENTER
  const [map, setMap] = useState<L.Map | null>(null)
  const [locating, setLocating] = useState(false)
  const [visibleLabelIds, setVisibleLabelIds] = useState<Set<string>>(new Set())

  async function locate() {
    setLocating(true)
    const point = await geolocate()
    if (point && map) map.setView([point.lat, point.lng], map.getZoom())
    setLocating(false)
  }

  return (
    <div className="relative h-full w-full">
      <MapContainer ref={setMap} center={center} zoom={12} className="h-full w-full">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          // Fetch in CORS mode so the service-worker tile cache stores non-opaque (status 200)
          // responses — opaque responses are padded to ~7 MB each and would blow the cache bound.
          crossOrigin="anonymous"
        />
        <Recenter markers={markers} />
        <CenterReporter onChange={onCenterChange} />
        <LabelVisibility
          markers={markers}
          active={active}
          selectedId={selectedId}
          onChange={setVisibleLabelIds}
        />
        {markers.map((m) => (
          <Marker
            key={m.id}
            position={[m.lat, m.lng]}
            icon={iconForColor(
              m.color,
              m.id === selectedId,
              // Popups don't special-case labels (KTD7): visibility follows visibleLabelIds only,
              // never selectedId/popup-open state. !m.dimmed is defense-in-depth — the upstream
              // placement algorithm already excludes dimmed candidates — so this layer's own
              // guarantee doesn't silently rely on that upstream behavior.
              visibleLabelIds.has(m.id) && !m.dimmed ? truncateLabel(m.name) : undefined,
            )}
            opacity={m.dimmed ? 0.3 : 1}
            eventHandlers={onSelect ? { click: () => onSelect(m.id) } : undefined}
          >
            <Popup>
              <strong>{m.name}</strong>
              <br />
              {m.label}
            </Popup>
          </Marker>
        ))}
      </MapContainer>
      <button
        type="button"
        onClick={() => void locate()}
        disabled={locating}
        aria-label={t('map.locateAria')}
        className="absolute right-3 top-3 z-[1000] rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-sm shadow disabled:opacity-50"
      >
        {locating ? t('map.locating') : t('map.locate')}
      </button>
    </div>
  )
}
