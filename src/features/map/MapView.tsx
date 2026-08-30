import { useEffect, useRef, useState } from 'react'
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

/** A teardrop pin in the cuisine color (cached per color+selected), with a brand halo when selected. */
function iconForColor(color: string, selected: boolean): L.DivIcon {
  const key = `${color}:${selected ? 1 : 0}`
  let icon = iconCache.get(key)
  if (!icon) {
    const size = selected ? 30 : 24
    const shadow = selected
      ? `box-shadow:0 0 0 5px ${color}33, 0 3px 6px rgba(0,0,0,.4);`
      : `box-shadow:0 2px 4px rgba(0,0,0,.35);`
    icon = L.divIcon({
      className: '',
      html: `<span style="position:relative;display:block;width:${size}px;height:${size}px;border-radius:50% 50% 50% 0;background:${color};border:2px solid #fff;transform:rotate(-45deg);${shadow}"><span style="position:absolute;top:50%;left:50%;width:7px;height:7px;margin:-3.5px 0 0 -3.5px;border-radius:9999px;background:rgba(255,255,255,.92)"></span></span>`,
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
 * set to the consumer. Modeled on `CenterReporter`, but deliberately does NOT hold `markers`/
 * `active` in a ref (KTD2 sanctioned simplification): recompute must react to a facet-filter
 * toggle, a restaurant add/delete/edit/import, or the mobile List pane switching back to Map
 * (KTD10) — none of these fire a Leaflet event, so `markers`/`active` are listed directly in the
 * effect's own dependency array instead. `onChange` is not ref-optimized either: `MapView`
 * passes a `useState` setter, which is referentially stable across renders, so calling it
 * directly is safe and simpler.
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

  useEffect(() => {
    const recompute = () => {
      const zoomFloorMet = map.getZoom() >= LABEL_ZOOM_FLOOR
      const size = map.getSize()
      // Geometric pane center in container-pixel space, not adjusted for overlay UI (KTD7).
      const viewCenter: ScreenPoint = { x: size.x / 2, y: size.y / 2 }
      const candidates: LabelCandidate[] = markers.map((m) => {
        const point = map.latLngToContainerPoint([m.lat, m.lng])
        return { id: m.id, x: point.x, y: point.y, name: m.name, dimmed: m.dimmed }
      })
      onChange?.(computeLabelPlacement(candidates, viewCenter, zoomFloorMet))
    }
    recompute() // initial computation, so labels aren't absent when already past the zoom floor
    map.on('zoomend', recompute)
    map.on('moveend', recompute)
    return () => {
      map.off('zoomend', recompute)
      map.off('moveend', recompute)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onChange (a useState setter) is stable
  }, [map, markers, active])

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
  // Not yet consumed by the marker-rendering loop below — that's a later unit's job. This
  // reference only keeps `noUnusedLocals` quiet until that unit wires it in.
  void visibleLabelIds

  // The mobile List/Map toggle keeps this pane mounted but hidden (display:none) while
  // inactive. A display:none -> block transition fires no resize event, so Leaflet never
  // recomputes its tile grid until the pane becomes visible — nudge it once it does.
  useEffect(() => {
    if (map && active) map.invalidateSize()
  }, [map, active])

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
            icon={iconForColor(m.color, m.id === selectedId)}
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
