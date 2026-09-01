import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { MapContainer, TileLayer, Marker, Tooltip, useMap } from 'react-leaflet'
import L from 'leaflet'
import type { MapMarker } from './markers'
import { geolocate, type GeoPoint } from '../../lib/geolocate'
import { DEFAULT_MAP_CENTER } from '../../lib/geo'
import { StatusBadge } from '../StatusBadge'
import { badgeState } from '../display'
import { cuisineDisplayName, emojiForCuisine } from '../facets/cuisines'
import { translateVisitsCount } from '../../types/models'
import { computeLabelPlacement, type LabelCandidate, type ScreenPoint } from './labelPlacement'

/**
 * Minimum zoom level at which restaurant name labels become eligible to show (R1/R2). Tunable —
 * start near 14 and retune once real device testing shows how much room labels actually need.
 */
export const LABEL_ZOOM_FLOOR = 14

/**
 * Restaurant names longer than this are truncated with an ellipsis for the on-map label only
 * (the tooltip always shows the full name) — an unbounded name would otherwise render as an
 * unclipped banner that can cover most of the map. 24 is a judgment call, not a design spec.
 */
const MAX_LABEL_CHARS = 24

/** Truncates a name for on-map label display only — never for the tooltip's full name. */
function truncateLabel(name: string): string {
  return name.length > MAX_LABEL_CHARS ? `${name.slice(0, MAX_LABEL_CHARS - 1)}…` : name
}

/**
 * Escapes a string for safe interpolation into an HTML attribute value (and text content) in a
 * raw HTML string handed to `L.divIcon`. Restaurant names are user-entered free text, unlike the
 * translated UI labels `currentPositionIcon` interpolates below, so they must not be trusted to
 * pass through unescaped into `aria-label="..."`.
 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * Cache of just the teardrop pin's own HTML fragment, keyed on `color:selected` only — bounded by
 * (distinct cuisine colors) x 2, so many same-color/selection markers share one cached string
 * regardless of restaurant name. Deliberately does NOT include the name/label text in the key:
 * that would make this cache grow unbounded with restaurant-name cardinality.
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

/**
 * A teardrop pin in the cuisine color, with a brand halo when selected. Always carries the
 * restaurant's name as an accessible name (`role="img" aria-label`, R6, mirroring
 * `currentPositionIcon` below) so keyboard/AT users focusing the marker can tell which restaurant
 * it is, now that the tooltip only reveals content on hover/focus. When `labelText` is given, an
 * always-visible decorative name label is also rendered beside the pin (R1/R3) — `aria-hidden`
 * since it's decorative only; the accessible name always comes from `name`/`aria-label`, never
 * from this label, so it stays correct whether or not the label is currently shown.
 *
 * Only the pin's own HTML fragment is cached (`pinHtml`, keyed on color+selected only, bounded);
 * this function builds a fresh wrapper + `L.divIcon` per call so per-restaurant `name`/`labelText`
 * never grows an unbounded cache.
 */
function iconForColor(color: string, selected: boolean, name: string, labelText?: string): L.DivIcon {
  const size = selected ? 30 : 24
  const label = labelText
    ? `<span aria-hidden="true" style="position:absolute;top:50%;left:100%;transform:translateY(-50%);margin-left:6px;padding:1px 6px;border-radius:4px;background:rgba(255,255,255,.92);box-shadow:0 1px 3px rgba(0,0,0,.3);font-size:11px;line-height:1.5;font-family:system-ui, sans-serif;color:#1f2937;white-space:nowrap;pointer-events:none;">${escapeHtml(labelText)}</span>`
    : ''
  return L.divIcon({
    className: '',
    html: `<span role="img" aria-label="${escapeHtml(name)}" style="position:relative;display:block;width:${size}px;height:${size}px;">${pinHtml(color, selected)}${label}</span>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size],
    // Tooltip reads `tooltipAnchor` (not `popupAnchor`) to position itself against the icon.
    tooltipAnchor: [0, -size],
  })
}

const currentPositionIconCache = new Map<string, L.DivIcon>()

/**
 * A plain dot marking the device's own position — a circle, not `iconForColor`'s teardrop, so it
 * can't be mistaken for a cuisine pin. Cached per accessible label so a locale change refreshes it.
 */
function currentPositionIcon(label: string): L.DivIcon {
  let icon = currentPositionIconCache.get(label)
  if (!icon) {
    const size = 16
    icon = L.divIcon({
      className: '',
      html: `<span role="img" aria-label="${label}" style="display:block;width:${size}px;height:${size}px;border-radius:9999px;background:#2563eb;border:3px solid #fff;box-shadow:0 0 0 2px rgba(37,99,235,.35),0 2px 4px rgba(0,0,0,.35);"></span>`,
      iconSize: [size, size],
      iconAnchor: [size / 2, size / 2],
    })
    currentPositionIconCache.set(label, icon)
  }
  return icon
}

const DEFAULT_CENTER: [number, number] = [DEFAULT_MAP_CENTER.lat, DEFAULT_MAP_CENTER.lng]

/** Centers `map` on `point` at its current zoom — shared by `Recenter`'s two tiers and `locate()`. */
function centerOn(map: L.Map, point: GeoPoint) {
  map.setView([point.lat, point.lng], map.getZoom())
}

/**
 * MapContainer's center/zoom apply only on initial render. This component performs the one-time
 * initial centering decision (R1-R4), via two independent once-only tiers rather than a single
 * shared guard:
 *
 * - Effect A (position tier): as soon as a live `currentPosition` fix is available, center on it.
 *   Fires once per app load, guarded by `positionCentered` alone — no dependency on whether the
 *   fallback tier already centered — so a fix that resolves *after* the fallback already showed
 *   still overrides it (R3).
 * - Effect B (fallback tier): centers on `fallbackCenter` (the most-recently-added-or-visited
 *   restaurant, R2) as soon as it's known, or on the first marker when there is no fallback
 *   (today's existing behavior, R4). Skipped entirely once either tier has already centered —
 *   checking `positionCentered` first is what lets a position resolved *before* markers/
 *   fallbackCenter are known permanently suppress the fallback tier (R1). When neither
 *   `fallbackCenter` nor any marker is available yet, it does nothing and leaves
 *   `fallbackCentered` false, so it can still fire once a source becomes available on a later
 *   render.
 */
function Recenter({
  markers,
  fallbackCenter,
  currentPosition,
}: {
  markers: MapMarker[]
  fallbackCenter?: GeoPoint | null
  currentPosition?: GeoPoint | null
}) {
  const map = useMap()
  const positionCentered = useRef(false)
  const fallbackCentered = useRef(false)

  useEffect(() => {
    if (currentPosition && !positionCentered.current) {
      centerOn(map, currentPosition)
      positionCentered.current = true
    }
  }, [currentPosition, map])

  useEffect(() => {
    if (positionCentered.current || fallbackCentered.current) return
    if (fallbackCenter) {
      centerOn(map, fallbackCenter)
      fallbackCentered.current = true
    } else if (markers.length > 0) {
      centerOn(map, markers[0])
      fallbackCentered.current = true
    }
  }, [fallbackCenter, markers, map])

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

/**
 * Zoom in/out control (KTD3) replacing Leaflet's own default zoom control — `MapView` passes
 * `zoomControl={false}` to `MapContainer` below so Leaflet's own top-left control isn't also
 * rendered. Mirrors `Recenter`/`CenterReporter`/`LabelVisibility`'s `useMap()`-driven pattern:
 * each button disables at the map's current zoom limit, tracked via a `zoomend` subscription
 * (mirroring `LabelVisibility`'s own `map.on`/`map.off` wiring) so the disabled state stays live
 * as the map is zoomed by any means (these buttons, a scroll-wheel, a pinch), matching the
 * disabled-at-limits affordance of the Leaflet default control it replaces.
 */
function ZoomControl() {
  const { t } = useTranslation()
  const map = useMap()
  const [zoom, setZoom] = useState(() => map.getZoom())

  useEffect(() => {
    const update = () => setZoom(map.getZoom())
    map.on('zoomend', update)
    return () => {
      map.off('zoomend', update)
    }
  }, [map])

  return (
    <div className="flex flex-col overflow-hidden rounded-md border border-gray-300 bg-white shadow">
      <button
        type="button"
        onClick={() => map.zoomIn()}
        disabled={zoom >= map.getMaxZoom()}
        aria-label={t('map.zoomInAria')}
        className="grid h-9 w-9 place-items-center text-base leading-none disabled:opacity-50"
      >
        +
      </button>
      <div aria-hidden="true" className="h-px bg-gray-200" />
      <button
        type="button"
        onClick={() => map.zoomOut()}
        disabled={zoom <= map.getMinZoom()}
        aria-label={t('map.zoomOutAria')}
        className="grid h-9 w-9 place-items-center text-base leading-none disabled:opacity-50"
      >
        −
      </button>
    </div>
  )
}

export function MapView({
  markers,
  onSelect,
  onCenterChange,
  beginLocate,
  onLocate,
  currentPosition,
  fallbackCenter,
  selectedId,
  active,
}: {
  markers: MapMarker[]
  onSelect?: (id: string) => void
  onCenterChange?: (center: GeoPoint) => void
  beginLocate?: () => number
  onLocate?: (p: GeoPoint, generation: number) => void
  currentPosition?: GeoPoint | null
  /** Fallback map center (R2/R5) — the most-recently-added-or-visited restaurant, consumed by `Recenter`'s fallback tier. */
  fallbackCenter?: GeoPoint | null
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
  // The Locate/zoom control stack renders as a JSX child of MapContainer (see the comment at its
  // JSX below), so its DOM lives inside Leaflet's own map container: a native 'dblclick' or
  // 'wheel' on these buttons would otherwise bubble up and also trigger the map's own
  // doubleClickZoom/scrollWheelZoom handling. Stopped with plain native listeners rather than
  // Leaflet's `L.DomEvent.disableClickPropagation` (what its own built-in controls use): that
  // helper also binds 'mousedown'/'touchstart', and on a touch-capable browser (`Browser.touch`)
  // Leaflet additionally simulates 'dblclick' from two 'click' events via its own native 'click'
  // listener — which ends up calling `stopPropagation()` on the *real* second click event itself
  // whenever two clicks anywhere in this stack land within 200ms, silently dropping React's
  // onClick for that second click (e.g. tapping zoom-in then zoom-out quickly). Only 'dblclick'
  // and 'wheel' are the events the map actually listens for here, so only those need stopping.
  const controlStackRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = controlStackRef.current
    if (!el) return
    const stopPropagation = (e: Event) => e.stopPropagation()
    el.addEventListener('dblclick', stopPropagation)
    el.addEventListener('wheel', stopPropagation, { passive: true })
    return () => {
      el.removeEventListener('dblclick', stopPropagation)
      el.removeEventListener('wheel', stopPropagation)
    }
  }, [])

  async function locate() {
    setLocating(true)
    // Generation token (KTD3): tags this fetch so App can drop it if a later-started fetch
    // (the mount effect, or another tap) resolves and commits first.
    const generation = beginLocate?.() ?? 0
    const point = await geolocate()
    // Null-guard (KTD3): a failed/timed-out retry must not erase a working currentPosition, so
    // only report a point when one actually comes back.
    if (point) {
      if (map) centerOn(map, point)
      onLocate?.(point, generation)
    }
    setLocating(false)
  }

  return (
    <div className="relative h-full w-full">
      <MapContainer ref={setMap} center={center} zoom={12} zoomControl={false} className="h-full w-full">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          // Fetch in CORS mode so the service-worker tile cache stores non-opaque (status 200)
          // responses — opaque responses are padded to ~7 MB each and would blow the cache bound.
          crossOrigin="anonymous"
        />
        <Recenter markers={markers} fallbackCenter={fallbackCenter} currentPosition={currentPosition} />
        <CenterReporter onChange={onCenterChange} />
        <LabelVisibility
          markers={markers}
          active={active}
          selectedId={selectedId}
          onChange={setVisibleLabelIds}
        />
        {markers.map((m) => {
          // R4/R5: badge + visit-count (only when visited, exactly like RestaurantList's row)
          // + cuisine emoji/label, joined with a middle dot — only present segments produce a
          // separator, so a to-try place (no visit-count segment) never shows a stray "· ·".
          const visited = badgeState(m).kind === 'visited'
          const metaParts: React.ReactNode[] = [<StatusBadge key="badge" restaurant={m} />]
          if (visited) metaParts.push(translateVisitsCount(m.visitCount))
          metaParts.push(
            <span key="cuisine">
              <span aria-hidden="true">{emojiForCuisine(m.cuisine)}</span>{' '}
              {cuisineDisplayName(m.cuisine, t('common.uncategorized'))}
            </span>,
          )

          return (
            <Marker
              key={m.id}
              position={[m.lat, m.lng]}
              icon={iconForColor(
                m.color,
                m.id === selectedId,
                m.name,
                // Labels don't special-case the tooltip/selection (KTD7): visibility follows
                // visibleLabelIds only, never selectedId/tooltip-open state. !m.dimmed is
                // defense-in-depth — the upstream placement algorithm already excludes dimmed
                // candidates — so this layer's own guarantee doesn't silently rely on that
                // upstream behavior.
                visibleLabelIds.has(m.id) && !m.dimmed ? truncateLabel(m.name) : undefined,
              )}
              opacity={m.dimmed ? 0.3 : 1}
              eventHandlers={
                onSelect
                  ? {
                      click: (event: L.LeafletMouseEvent) => {
                        const marker = event.target as L.Marker
                        // KTD3: Leaflet's Tooltip also opens on click internally — it's just
                        // another listener bound to this same 'click' event (via `bindTooltip`'s
                        // `_initTooltipInteractions`). Whether that internal listener or this one
                        // runs first for a given click depends on effect-mount order, which we
                        // must not rely on. Deferring past the synchronous listener-dispatch phase
                        // guarantees this always runs *after* every 'click' listener registered
                        // for this event — including Leaflet's own — regardless of which one it
                        // happened to invoke first, so the tooltip never survives past a click.
                        queueMicrotask(() => {
                          marker.closeTooltip()
                          // KTD4: blur before selecting, so RestaurantDetail's modal doesn't
                          // restore focus to the marker on close (which would re-trigger the
                          // tooltip's native focus listener and reopen it — R3).
                          marker.getElement()?.blur()
                          onSelect(m.id)
                          // KTD6: Leaflet's own internal tooltip-open click handler
                          // (`Tooltip.prototype._openTooltip`) does not open synchronously while
                          // the map is still coasting from an inertial pan/drag at the moment
                          // this click fires — it registers its own one-time
                          // `map.once('moveend', ...)` and opens later instead (see
                          // node_modules/leaflet/src/layer/Tooltip.js's `dragging.moving()`
                          // check). The `closeTooltip()` above can't cancel that later callback,
                          // so a click made mid-coast could otherwise pop the tooltip back open
                          // seconds afterward, once the pan settles, after the modal has already
                          // opened. Arm a matching one-time close on the same 'moveend' so it
                          // always wins. This check must stay inside this same queueMicrotask
                          // (not run synchronously alongside the `click` dispatch above): for the
                          // same reason KTD3 defers past the synchronous listener-dispatch phase,
                          // this guarantees our 'moveend' listener is always registered *after*
                          // Leaflet's own — regardless of which 'click' listener Leaflet happened
                          // to invoke first — so ours always runs last and wins.
                          // `L.Map['dragging']` is typed as the base `Handler` interface, which
                          // doesn't declare `moving()` — it's really an `L.Handler.MapDrag`
                          // instance at runtime, which does (see
                          // node_modules/leaflet/src/map/handler/Map.Drag.js), but @types/leaflet
                          // doesn't model that subtype, hence the cast.
                          const dragging = map?.dragging as { moving?: () => boolean } | undefined
                          if (dragging?.moving?.()) {
                            map?.once('moveend', () => marker.closeTooltip())
                          }
                        })
                      },
                    }
                  : undefined
              }
            >
              <Tooltip direction="top" className="marker-tooltip" opacity={1}>
                <span className="block font-display font-semibold text-gray-900">{m.name}</span>
                <span className="mt-0.5 block text-xs text-gray-600">
                  {metaParts.map((part, i) => (
                    <span key={i} className="inline-flex items-center gap-1 align-middle">
                      {i > 0 && <span aria-hidden="true" className="mx-1">·</span>}
                      {part}
                    </span>
                  ))}
                </span>
              </Tooltip>
            </Marker>
          )
        })}
        {currentPosition && (
          <Marker
            position={[currentPosition.lat, currentPosition.lng]}
            icon={currentPositionIcon(t('map.currentPositionAria'))}
            interactive={false}
            keyboard={false}
          />
        )}
        {/* Locate + zoom control stack (KTD2/KTD3): Locate above zoom, stacked on the map's right
            edge. Rendered as a plain child of MapContainer (not a sibling of it) purely so
            ZoomControl can call useMap() — react-leaflet renders children straight into the
            Leaflet container div (no portal), so this positions identically to a sibling would.
            `right-3`/`top-3` (mobile, unchanged from before this stack existed) are overridden at
            `md:`: `right` switches to the same `--filter-overlay-gap` the desktop filter overlay
            uses on its own right edge (index.css), so the two share one right edge instead of
            drifting apart by a few pixels; `top` reads the measured `--filter-overlay-height`
            custom property (KTD3) — the overlay is `position: fixed` and authored inside <aside>,
            not a flow-sibling of this stack, so it reserves no space this stack could rely on —
            App.tsx measures the overlay's real rendered height via a ResizeObserver and writes it
            to that property, so this stack always clears it regardless of how tall the cuisine
            row's "+N autres" expansion grows it. Also stops 'dblclick'/'wheel' propagation (see
            `controlStackRef` above) so interacting with these buttons doesn't also reach Leaflet's
            own container and trigger its native doubleClickZoom/scrollWheelZoom handling. */}
        <div
          ref={controlStackRef}
          className="absolute right-3 top-3 z-[1000] flex flex-col items-end gap-2 md:right-[var(--filter-overlay-gap)] md:top-[calc(var(--filter-overlay-height,0px)+2rem)]"
        >
          <button
            type="button"
            onClick={() => void locate()}
            disabled={locating}
            aria-label={t('map.locateAria')}
            className="rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-sm shadow disabled:opacity-50"
          >
            {locating ? t('map.locating') : t('map.locate')}
          </button>
          <ZoomControl />
        </div>
      </MapContainer>
    </div>
  )
}
