import { useEffect, useRef } from 'react'
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet'
import L from 'leaflet'
import type { MapMarker } from './markers'

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

const pin = L.divIcon({
  className: '',
  html: '<div style="width:14px;height:14px;border-radius:9999px;background:#d4561f;border:2px solid #fff;box-shadow:0 0 0 1px rgba(0,0,0,.3)"></div>',
  iconSize: [14, 14],
  iconAnchor: [7, 7],
})

const DEFAULT_CENTER: [number, number] = [48.8566, 2.3522]

export function MapView({
  markers,
  onSelect,
}: {
  markers: MapMarker[]
  onSelect?: (id: string) => void
}) {
  const center: [number, number] = markers.length
    ? [markers[0].lat, markers[0].lng]
    : DEFAULT_CENTER

  return (
    <MapContainer center={center} zoom={12} className="h-full w-full">
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <Recenter markers={markers} />
      {markers.map((m) => (
        <Marker
          key={m.id}
          position={[m.lat, m.lng]}
          icon={pin}
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
  )
}
