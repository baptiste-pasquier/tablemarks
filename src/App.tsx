import { useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { useTranslation } from 'react-i18next'
import { Settings } from 'lucide-react'
import { useRestaurants } from './features/useRestaurants'
import { useAuth } from './auth/useAuth'
import { RestaurantList } from './features/RestaurantList'
import { MapView } from './features/map/MapView'
import { toMarkers, pickMostRecentRestaurantCenter } from './features/map/markers'
import { FilterBar } from './features/facets/FilterBar'
import { activeFilterCount, emptyFilter, matches } from './features/facets/filter'
import { SortBar } from './features/facets/SortBar'
import { sortRestaurants } from './features/facets/sort'
import { readSortPreference, writeSortPreference, type SortPreference, type SortCriterion } from './lib/sortPreference'
import { AddPlace } from './features/capture/AddPlace'
import { RestaurantDetail } from './features/visits/RestaurantDetail'
import { DecidePanel } from './features/decide/DecidePanel'
import { SettingsPanel } from './features/settings/SettingsPanel'
import { Modal } from './features/ui/Modal'
import { Button } from './features/ui/Button'
import { ReloadPrompt } from './features/pwa/ReloadPrompt'
import { SyncStatusIndicator } from './features/sync/SyncStatusIndicator'
import { geolocate, type GeoPoint } from './lib/geolocate'
import { DEFAULT_MAP_CENTER } from './lib/geo'
import { cn } from './lib/cn'

type MobileView = 'list' | 'map'

// R1/R4 default: Date active, nearest-first/newest-first the first time each criterion is ever
// chosen. `currentPosition` is always null at mount (the on-load geolocation fetch resolves
// asynchronously after first render), so there is no reachable "position already known at mount"
// branch to special-case here.
const DEFAULT_SORT_PREFERENCE: SortPreference = {
  criterion: 'date',
  directions: { distance: 'nearest', date: 'newest' },
}

/** Direction, flipped for whichever criterion is currently active. */
function toggledDirections(
  criterion: SortCriterion,
  directions: SortPreference['directions'],
): SortPreference['directions'] {
  if (criterion === 'distance') {
    return { ...directions, distance: directions.distance === 'nearest' ? 'farthest' : 'nearest' }
  }
  return { ...directions, date: directions.date === 'newest' ? 'oldest' : 'newest' }
}

/**
 * Measures `ref`'s rendered height live (via ResizeObserver) and writes it to `document
 * .documentElement`'s `varName` CSS custom property. Used for two targets that a hardcoded
 * `index.css` constant can't reliably stand in for: the header (font metrics/locale text length
 * make its true height unknowable from CSS alone) and the desktop filter overlay (grows with the
 * cuisine row's "+N autres" expansion). Written straight to the DOM, not React state: a
 * ResizeObserver can fire on every frame during a resize, and only CSS consumers elsewhere ever
 * need to read these values, so routing them through setState would re-render the whole App tree
 * on every tick for no consumer that needs a React re-render.
 */
function useMeasuredHeightVar(ref: RefObject<HTMLElement | null>, varName: string) {
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const applyHeight = (height: number) => {
      document.documentElement.style.setProperty(varName, `${height}px`)
    }
    // A forced layout read is the point of useLayoutEffect here: this call has to happen
    // synchronously before paint, before `observe()` below can report anything.
    applyHeight(el.getBoundingClientRect().height)
    // No-op (rather than throwing) where ResizeObserver isn't available — the initial
    // `applyHeight()` call above still runs, it just won't track later resizes.
    if (typeof ResizeObserver === 'undefined') return
    // Reads the size the browser already computed for this notification, rather than forcing
    // another layout read via getBoundingClientRect() on every resize tick.
    const observer = new ResizeObserver(([entry]) => applyHeight(entry.borderBoxSize[0].blockSize))
    observer.observe(el)
    return () => observer.disconnect()
  }, [ref, varName])
}

/** Mobile-only "Filtres · N" pill (U4, R4). Rendered once from each pane so exactly one is ever
 *  mounted at a time (see the two call sites below); both share this one class string/label. */
function FiltersPill({ count, onOpen }: { count: number; onOpen: () => void }) {
  const { t } = useTranslation()
  return (
    <button
      type="button"
      onClick={onOpen}
      className="fixed bottom-[calc(var(--safe-area-floating-offset)+0.5rem)] left-1/2 z-[1000] -translate-x-1/2 rounded-full bg-brand px-5 py-2.5 text-sm font-semibold text-white shadow-xl ring-1 ring-black/10 transition hover:bg-brand-strong active:bg-brand-strong active:shadow-md md:hidden"
    >
      {t('filters.mobilePillLabel', { count })}
    </button>
  )
}

export default function App() {
  const { t } = useTranslation()
  const restaurants = useRestaurants()
  const { signedIn, email, signIn, signOut } = useAuth()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [deciding, setDeciding] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  // Gates the mobile filters/sort bottom sheet (U4, KTD6) — a sibling of the other panel-open
  // flags above, not a new `MobileView` variant: the sheet opens regardless of whether `view` is
  // 'list' or 'map', and while open it blocks the rest of the UI including the bottom nav, exactly
  // like every other Modal-hosted panel in this app.
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [anchor, setAnchor] = useState<GeoPoint | null>(DEFAULT_MAP_CENTER)
  // Sibling to `anchor`, deliberately not merged with it (KTD1): `anchor` is pan-driven and
  // belongs to the Decide flow, while `currentPosition` is fed only by the on-load geolocation
  // fetch (F1) and the "Localiser" tap (F2, wired via MapView's onLocate).
  const [currentPosition, setCurrentPosition] = useState<GeoPoint | null>(null)
  const [filter, setFilter] = useState(emptyFilter())
  // Reset on every reload/relaunch (KTD5) — no persistence beyond component state.
  const [view, setView] = useState<MobileView>('list')
  // Persisted sort criterion + each criterion's own direction (R9, U1). Holds the user's raw
  // preference even while Distance isn't selectable — `effectiveSortCriterion` below is what
  // actually renders and sorts, so a returning Distance user's preference survives the gap before
  // a position resolves and reapplies automatically the moment it does (R2), with no extra write.
  const [sortPreference, setSortPreference] = useState<SortPreference>(
    () => readSortPreference() ?? DEFAULT_SORT_PREFERENCE,
  )
  // App re-renders on every map pan/zoom (anchor state); memoize so the list and markers
  // aren't recomputed against every restaurant on each move.
  const visible = useMemo(() => restaurants.filter((r) => matches(r, filter)), [restaurants, filter])
  // Drives the mobile "Filtres · N" pill badge (U4, KTD5) — reuses U2's activeFilterCount rather
  // than re-deriving the count from `filter` here.
  const activeCount = activeFilterCount(filter)
  // Distance is selectable only once a position is known (R1). Until then, the effective
  // criterion falls back to Date regardless of what's persisted — this is what AE1 and AE6 render
  // as "active" and what R11's sort step actually uses.
  const distanceSelectable = currentPosition !== null
  const effectiveSortCriterion: SortCriterion = distanceSelectable ? sortPreference.criterion : 'date'
  const effectiveSortDirection =
    effectiveSortCriterion === 'distance' ? sortPreference.directions.distance : sortPreference.directions.date
  // Only the Distance path reads `position` (KTD7's date-rule branch ignores it entirely), so
  // don't re-run the sort every time it changes while Date is active.
  const positionForSort = effectiveSortCriterion === 'distance' ? currentPosition : null
  const sorted = useMemo(
    () => sortRestaurants(visible, effectiveSortCriterion, effectiveSortDirection, positionForSort),
    [visible, effectiveSortCriterion, effectiveSortDirection, positionForSort],
  )

  // `next` is computed from the current `sortPreference` closure value and `writeSortPreference`
  // runs once here, rather than inside a `setSortPreference` updater — React StrictMode
  // double-invokes updater functions in development, which would otherwise double-write to
  // localStorage on every change.
  function handleSortCriterionChange(criterion: SortCriterion) {
    if (criterion === 'distance' && !distanceSelectable) return
    // Compare against what's actually displayed as active, not the raw persisted value: while
    // Distance isn't selectable, the Date segment renders active even if the stored preference is
    // still 'distance' (R2) — clicking that already-active-looking button must stay a no-op rather
    // than overwriting and losing the stashed Distance preference.
    if (criterion === effectiveSortCriterion) return
    const next = { ...sortPreference, criterion }
    writeSortPreference(next)
    setSortPreference(next)
  }

  function handleSortDirectionToggle() {
    const next = { ...sortPreference, directions: toggledDirections(effectiveSortCriterion, sortPreference.directions) }
    writeSortPreference(next)
    setSortPreference(next)
  }
  // Markers carry raw data (status, verdict, visit count, cuisine), not pre-translated text —
  // StatusBadge, translateVisitsCount, and emojiForCuisine translate at render time inside
  // MapView and react to a language switch on their own, so no `i18n.language` dependency here.
  const markers = useMemo(() => toMarkers(restaurants, filter), [restaurants, filter])
  // Fallback map center (R2/R5): the most-recently added-or-visited restaurant among the full,
  // unfiltered restaurant list — deliberately keyed on `restaurants` alone, not `filter`/`visible`,
  // so an active facet filter never changes where the map falls back to.
  const fallbackCenter = useMemo(() => pickMostRecentRestaurantCenter(restaurants), [restaurants])

  // Generation token (KTD3): the on-load fetch (F1) and the "Localiser" tap (F2) can overlap,
  // and whichever resolves first should win regardless of which one started first. Each fetch
  // tags itself via beginLocate() and commitLocate() only applies a result whose generation is
  // still the latest, so a slower fetch can never clobber a fresher one that already landed.
  const positionGenerationRef = useRef(0)

  function beginLocate(): number {
    positionGenerationRef.current += 1
    return positionGenerationRef.current
  }

  function commitLocate(point: GeoPoint, generation: number) {
    if (generation === positionGenerationRef.current) setCurrentPosition(point)
  }

  // On-load fetch (F1, R1). A failed/unavailable fix resolves null and is ignored (KTD3's
  // null-guard) rather than overwriting `currentPosition`, which starts null anyway (R6).
  useEffect(() => {
    const generation = beginLocate()
    void geolocate().then((point) => {
      if (point) commitLocate(point, generation)
    })
  }, [])

  // The header's real rendered height feeds --filter-overlay-top (index.css) so the overlay's top
  // gap actually matches its left gap (both computed from --filter-overlay-gap) instead of
  // drifting apart whenever the header's true height differs from index.css's hardcoded fallback.
  const headerRef = useRef<HTMLElement>(null)
  useMeasuredHeightVar(headerRef, '--header-height')

  // Desktop filter overlay (U3 KTD2/KTD3): FilterBar stays authored here in <aside> (R7's tab
  // order) but renders as a `position: fixed` floating card pinned over <main>'s map on desktop,
  // so it reserves no flow space MapView's Locate/zoom control stack could rely on to stay below
  // it. Its measured height feeds a CSS custom property that stack's `top` offset reads (in
  // MapView.tsx), so it always clears the overlay regardless of how tall the cuisine row's "+N
  // autres" expansion grows it.
  const filterOverlayRef = useRef<HTMLDivElement>(null)
  useMeasuredHeightVar(filterOverlayRef, '--filter-overlay-height')

  // If the viewport crosses into desktop width while the mobile filters sheet is open, close it:
  // desktop already shows FilterBar/SortBar in the floating overlay/sidebar, so leaving the sheet
  // open would stack a second, now-redundant copy on top of that layout. No-ops when matchMedia
  // isn't available, same feature-detection style as the ResizeObserver guard above.
  useEffect(() => {
    if (!filtersOpen || typeof window.matchMedia !== 'function') return
    const mql = window.matchMedia('(min-width: 768px)')
    const handleChange = (e: MediaQueryListEvent) => {
      if (e.matches) setFiltersOpen(false)
    }
    mql.addEventListener('change', handleChange)
    return () => mql.removeEventListener('change', handleChange)
  }, [filtersOpen])

  return (
    <div className="flex h-full flex-col bg-gray-50 text-gray-900">
      <header
        ref={headerRef}
        className="sticky top-0 z-20 flex items-center justify-between border-b border-gray-200 bg-white/85 px-4 py-3 backdrop-blur"
      >
        <div className="flex items-center gap-2.5">
          <span
            aria-hidden="true"
            className="grid h-9 w-9 place-items-center rounded-xl bg-brand text-lg shadow-sm ring-1 ring-brand-strong/20"
          >
            🍴
          </span>
          <div className="leading-none">
            <h1 className="font-display text-2xl font-semibold tracking-tight text-gray-900">{t('app.title')}</h1>
            <p className="mt-0.5 hidden text-xs text-gray-500 sm:block">{t('shell.tagline')}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {signedIn ? (
            <div className="flex items-center gap-3 text-sm">
              <SyncStatusIndicator />
              <span className="hidden max-w-[10rem] truncate text-gray-500 sm:block">{email}</span>
              <Button variant="secondary" onClick={signOut}>
                {t('shell.signOut')}
              </Button>
            </div>
          ) : (
            <Button variant="secondary" onClick={() => void signIn()}>
              {t('shell.signIn')}
              <span className="hidden sm:inline"> {t('shell.withGoogle')}</span>
            </Button>
          )}
          <Button
            variant="secondary"
            iconOnly
            onClick={() => setSettingsOpen(true)}
            aria-label={t('settings.openAria')}
          >
            <Settings className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <aside
          className={`min-h-0 flex-1 flex-col border-gray-200 bg-white md:flex md:w-80 md:flex-none md:border-r ${
            view === 'list' ? 'flex' : 'hidden'
          }`}
        >
          <div className="space-y-2 border-b border-gray-100 p-3">
            <Button variant="primary" className="w-full" onClick={() => setAdding(true)}>
              {t('shell.addPlace')}
            </Button>
            <button
              type="button"
              onClick={() => setDeciding(true)}
              className="w-full rounded-xl border border-brand/30 px-3 py-2.5 text-sm font-semibold text-brand transition hover:bg-brand-soft active:bg-brand-soft"
            >
              {t('shell.whereToEat')}
            </button>
          </div>
          {/* Desktop (KTD2): floating card pinned atop the map, `position: fixed` since this div
              is authored inside <aside> but must render visually over <main>. Below md, FilterBar
              no longer renders inline here at all (U4) — its mobile home is the "Filtres · N"
              pill's bottom sheet instead, so this wrapper (and SortBar just below it) is hidden
              entirely below md. Spans the full width of the map pane (`left`/`right`, no `width`
              — see --filter-overlay-right in index.css) rather than a fixed card width, matching
              the confirmed prototype; the Locate/zoom control stack simply floats on top of the
              overlay's top-right corner (its z-index is already higher). `layout="inline"` puts
              each group's label to the left of its own wrapping chip row instead of above it, so
              that width is actually put to use. The card chrome (border/bg/shadow) is gated on
              `restaurants.length` — this div itself must stay mounted unconditionally so
              `filterOverlayRef` never goes stale, but FilterBar renders nothing when empty, so
              without this gate an empty app would still float a blank white card over the map. */}
          <div
            ref={filterOverlayRef}
            className={cn(
              'hidden md:block md:fixed md:z-[900] md:top-[var(--filter-overlay-top)] md:left-[var(--filter-overlay-left)] md:right-[var(--filter-overlay-right)] md:max-h-[50vh] md:overflow-y-auto',
              restaurants.length > 0 && 'md:rounded-2xl md:border md:border-gray-200 md:bg-white md:shadow-lg',
            )}
          >
            <FilterBar restaurants={restaurants} filter={filter} onChange={setFilter} layout="inline" />
          </div>
          <div className="hidden md:block">
            <SortBar
              criterion={effectiveSortCriterion}
              direction={effectiveSortDirection}
              distanceSelectable={distanceSelectable}
              onCriterionChange={handleSortCriterionChange}
              onDirectionToggle={handleSortDirectionToggle}
            />
          </div>
          {/* pb-[safe-area-floating-offset] lives on the scrollable box itself, not on <aside>
              (bug fix): padding on a non-scrolling ancestor shrinks the box and leaves a plain,
              always-visible gap between the list and the bottom nav — wrong, since the floating
              "Filtres · N" pill below is `position: fixed` and needs no flow space reserved for
              it either. Padding on the *scrollable* box instead becomes part of its scrollable
              content, invisible until actually scrolled to the end, so the list — and the pill
              floating over it — both extend the full height with no dead strip. */}
          <div className="min-h-0 flex-1 overflow-y-auto pb-[var(--safe-area-floating-offset)] md:pb-0">
            <RestaurantList items={sorted} onSelect={setSelectedId} currentPosition={currentPosition} />
          </div>
          {/* Mobile-only "Filtres · N" pill (U4, R4): opens the filters/sort bottom sheet.
              Rendered only while this pane is the active mobile view (mirrors the map pane's "Add
              a place" FAB below), and only once there's something to filter (mirrors FilterBar's
              own `restaurants.length === 0` guard) so it never floats over the empty-list state. */}
          {view === 'list' && restaurants.length > 0 && (
            <FiltersPill count={activeCount} onOpen={() => setFiltersOpen(true)} />
          )}
        </aside>

        {/* No pb-[safe-area-floating-offset] here (same bug/fix as <aside> above): it shrank the
            box MapView fills, leaving a plain gap between the map and the bottom nav. The map has
            no scrollable content to move the padding into — it just fills <main> fully, and the
            "+" FAB/nav bar float above it via their own fixed/absolute positioning regardless. */}
        <main
          className={`relative min-h-0 flex-1 ${view === 'map' ? 'block' : 'hidden'} md:block`}
        >
          <MapView
            markers={markers}
            onSelect={setSelectedId}
            onCenterChange={setAnchor}
            beginLocate={beginLocate}
            onLocate={commitLocate}
            currentPosition={currentPosition}
            fallbackCenter={fallbackCenter}
            selectedId={selectedId}
            active={view === 'map'}
          />
          {/* On mobile the add action lives in the list pane, so surface it on the map too. */}
          {view === 'map' && (
            <button
              type="button"
              onClick={() => setAdding(true)}
              aria-label={t('shell.addPlaceAria')}
              className="absolute bottom-[calc(var(--safe-area-floating-offset)+0.5rem)] right-5 z-[1000] grid h-14 w-14 place-items-center rounded-full bg-brand text-3xl leading-none text-white shadow-lg ring-1 ring-black/10 transition hover:bg-brand-strong active:bg-brand-strong active:shadow-md md:hidden"
            >
              +
            </button>
          )}
          {/* Mobile-only "Filtres · N" pill (U4, R4) — same trigger, same position, and the same
              empty-list guard as the list pane's pill above; only one of the two is ever mounted
              at a time since each is gated on the currently active mobile view. */}
          {view === 'map' && restaurants.length > 0 && (
            <FiltersPill count={activeCount} onOpen={() => setFiltersOpen(true)} />
          )}
        </main>
      </div>

      {/* Mobile-only view switch, fixed to the viewport bottom (R5) so it stays reachable
          regardless of scroll/pan position in either pane. */}
      <nav
        aria-label={t('shell.viewNav')}
        // z-[1100]: now that the map fills <main> fully (no reserved bottom gap), Leaflet's own
        // internal panes/controls (tile pane z-200, attribution/.leaflet-bottom z-1000 — see
        // node_modules/leaflet/dist/leaflet.css) extend into this same screen region. Leaflet's
        // container doesn't establish its own stacking context, so those z-index values compare
        // directly against this nav — anything at or below 1000 (the old z-30 included) render
        // underneath them and disappear entirely.
        className="fixed inset-x-0 bottom-0 z-[1100] flex gap-1 border-t border-gray-200 bg-white/95 p-1.5 pb-[calc(0.375rem+env(safe-area-inset-bottom))] backdrop-blur md:hidden"
      >
        {(['list', 'map'] as const).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => setView(v)}
            aria-pressed={view === v}
            className={`flex-1 rounded-lg px-3 py-1.5 text-sm font-semibold capitalize transition ${
              view === v ? 'bg-brand text-white shadow-sm' : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            {t(`shell.view.${v}`)}
          </button>
        ))}
      </nav>

      {adding && (
        <AddPlace
          onClose={() => setAdding(false)}
          onOpenExisting={(id) => {
            setAdding(false)
            setSelectedId(id)
          }}
        />
      )}

      {deciding && (
        <DecidePanel
          anchor={anchor}
          onClose={() => setDeciding(false)}
          onOpenRestaurant={(id) => {
            setDeciding(false)
            setSelectedId(id)
          }}
        />
      )}

      {settingsOpen && (
        <Modal onClose={() => setSettingsOpen(false)} panelClassName="max-h-[90vh] overflow-y-auto">
          <SettingsPanel onClose={() => setSettingsOpen(false)} />
        </Modal>
      )}

      {/* Mobile filters/sort bottom sheet (U4, KTD4/KTD6): reuses FilterBar/SortBar as-is —
          same `filter`/`onChange` and sort state/callbacks as the desktop overlay above, no
          re-derivation — so a toggle here updates the same `visible`/`sorted` lists the panes
          already read from (R6). No ModalHeader/title here (design revision): FilterBar already
          renders its own "Filters"/"Filtres" eyebrow plus a clear-all action, so an outer title
          bar was redundant. Closing still works via the backdrop, Escape, and the drag handle
          Modal already renders — the "See results" button below is a fourth, explicit way in. */}
      {filtersOpen && (
        <Modal onClose={() => setFiltersOpen(false)} panelClassName="max-h-[90vh] overflow-y-auto">
          <FilterBar restaurants={restaurants} filter={filter} onChange={setFilter} layout="stacked" />
          <SortBar
            criterion={effectiveSortCriterion}
            direction={effectiveSortDirection}
            distanceSelectable={distanceSelectable}
            onCriterionChange={handleSortCriterionChange}
            onDirectionToggle={handleSortDirectionToggle}
            divider={false}
          />
          <Button variant="primary" className="mt-2 w-full" onClick={() => setFiltersOpen(false)}>
            {t('filters.seeResults')}
          </Button>
        </Modal>
      )}

      {selectedId && (
        <RestaurantDetail
          restaurantId={selectedId}
          onClose={() => setSelectedId(null)}
          currentPosition={currentPosition}
        />
      )}

      <ReloadPrompt />
    </div>
  )
}
