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

const iconCache = new Map<string, L.DivIcon>()

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
 * A teardrop pin in the cuisine color (cached per color+selected+label), with a brand halo when
 * selected and, when `labelText` is given, a name label rendered beside the pin (R1/R3). The
 * label is baked directly into the icon's HTML (rather than a separate react-leaflet Tooltip) so
 * it moves and z-index-stacks with the marker for free, and so `aria-hidden` can be hand-written
 * into the markup — the label is decorative only, the accessible name lives in the marker's
 * Popup (KTD7).
 */
function iconForColor(color: string, selected: boolean, labelText?: string): L.DivIcon {
  const key = `${color}:${selected ? 1 : 0}:${labelText ?? ''}`
  let icon = iconCache.get(key)
  if (!icon) {
    const size = selected ? 30 : 24
    const shadow = selected
      ? `box-shadow:0 0 0 5px ${color}33, 0 3px 6px rgba(0,0,0,.4);`
      : `box-shadow:0 2px 4px rgba(0,0,0,.35);`
    const label = labelText
      ? `<span aria-hidden="true" style="position:absolute;top:50%;left:100%;transform:translateY(-50%);margin-left:6px;padding:1px 6px;border-radius:4px;background:rgba(255,255,255,.92);box-shadow:0 1px 3px rgba(0,0,0,.3);font-size:11px;line-height:1.5;color:#1f2937;white-space:nowrap;pointer-events:none;">${escapeHtml(labelText)}</span>`
      : ''
    icon = L.divIcon({
      className: '',
      html: `<span style="position:relative;display:block;width:${size}px;height:${size}px;"><span style="position:absolute;inset:0;display:block;border-radius:50% 50% 50% 0;background:${color};border:2px solid #fff;transform:rotate(-45deg);${shadow}"><span style="position:absolute;top:50%;left:50%;width:7px;height:7px;margin:-3.5px 0 0 -3.5px;border-radius:9999px;background:rgba(255,255,255,.92)"></span></span>${label}</span>`,
      iconSize: [size, size],
      iconAnchor: [size / 2, size],
      popupAnchor: [0, -size],
    })
    iconCache.set(key, icon)
  }
  return icon
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
 * `map.getSize()` — owning both calls in one effect here, rather than splitting them across this
 * component and `MapView`'s own effect, keeps that order guaranteed instead of relying on two
 * components' effects racing.
 *
 * Exported (rather than kept private) so tests can render it directly and observe what it
 * reports via `onChange`, without needing to reach into `MapView`'s own state.
 */
export function LabelVisibility({
  markers,
  active,
  onChange,
}: {
  markers: MapMarker[]
  active?: boolean
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
      return { id: m.id, x: point.x, y: point.y, name: m.name, dimmed: m.dimmed }
    })
    const next = computeLabelPlacement(candidates, viewCenter, zoomFloorMet)
    const prev = lastReportedRef.current
    const changed = prev === null || next.size !== prev.size || [...next].some((id) => !prev.has(id))
    if (changed) {
      lastReportedRef.current = next
      onChange?.(next)
    }
  }, [map, markers, onChange])

  useEffect(() => {
    recompute() // initial computation, so labels aren't absent when already past the zoom floor
    map.on('zoomend', recompute)
    map.on('moveend', recompute)
    return () => {
      map.off('zoomend', recompute)
      map.off('moveend', recompute)
    }
  }, [map, recompute])

  const wasActiveRef = useRef(active)
  useEffect(() => {
    const becameActive = active && !wasActiveRef.current
    wasActiveRef.current = active
    if (becameActive) {
      map.invalidateSize()
      recompute()
    }
  }, [active, map, recompute])

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
        <LabelVisibility markers={markers} active={active} onChange={setVisibleLabelIds} />
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
              visibleLabelIds.has(m.id) && !m.dimmed ? m.name : undefined,
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
