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
import {
  readSortPreference,
  writeSortPreference,
  type SortPreference,
  type SortCriterion,
} from './lib/sortPreference'
import { AddPlace } from './features/capture/AddPlace'
import { RestaurantDetail } from './features/visits/RestaurantDetail'
import { DecidePanel } from './features/decide/DecidePanel'
import { SettingsPanel } from './features/settings/SettingsPanel'
import { Modal } from './features/ui/Modal'
import { Button } from './features/ui/Button'
import { Badge } from './features/ui/Badge'
import { ReloadPrompt } from './features/pwa/ReloadPrompt'
import { AccountMenu } from './features/account/AccountMenu'
import { badgeColorClassName, pillToneClassName } from './features/sync/syncStatusPresentation'
import { useBackendStatus } from './sync/useBackendStatus'
import { backendAddressIsKnown, backendIsAbsent, backendIsUnreachable } from './sync/backendStatus'
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

/**
 * Same `hidden sm:inline` gate the Sign in button's " with Google" suffix uses just below, and for
 * the same reason: the header's right-hand group is `shrink-0` by deliberate bug fix (see the
 * comment on the title group), so anything that widens it pushes the row past a ~320px viewport.
 * Passed through `Badge`'s own `labelClassName` rather than reached at with a descendant selector.
 */
const INDICATOR_LABEL_GATE = 'hidden sm:inline'

/**
 * Header indicator for a backend that belongs to this deployment but cannot be used right now
 * (R6, KD7) — a configured instance that is down, or a configuration that could not be read at
 * all. Reported to signed-out visitors too: a private instance that is merely down must never read
 * as a deliberately backend-free build.
 *
 * Copy lives under its own `backend` namespace rather than reusing `sync.*`: the sync wording
 * promises the app will keep retrying in the background, which no signed-out visitor has a
 * controller running to make true. Tone and shape come from the sync presentation helper and the
 * `Badge` primitive so this pill can never drift from the account menu's status chip.
 *
 * The accessible name is explicit because the visible label is `display: none` below `sm`, which
 * would otherwise leave a bare colored dot with no name at all.
 */
function BackendUnreachableIndicator() {
  const { t } = useTranslation()
  const label = t('backend.unreachable')
  return (
    <span
      role="status"
      aria-label={label}
      title={t('backend.unreachableDetail')}
      className="inline-flex shrink-0 items-center"
    >
      <Badge
        text={label}
        tint
        tone={pillToneClassName('problem')}
        dotClassName={badgeColorClassName('problem')}
        labelClassName={INDICATOR_LABEL_GATE}
      />
    </span>
  )
}

export default function App() {
  const { t } = useTranslation()
  const restaurants = useRestaurants()
  const { signedIn, email, avatarUrl, signIn, signOut } = useAuth()
  // Two separate signals, resolved in that order (KD3): presence answers "is a backend part of
  // this build?" and comes back immediately from a local file; reachability answers "did it
  // answer?" and lands later. Read through the module-singleton store (KTD2) — no context.
  const backend = useBackendStatus()
  const backendAbsent = backendIsAbsent(backend)
  // A dead control is worse than a missing one, so the *presence* signal alone decides whether
  // Sign in exists (R4) and the *reachability* signal alone decides whether it works.
  const signInDisabled = !backendAddressIsKnown(backend)
  // Deliberately not `!backendAbsent`: while presence is `configured` and reachability is still
  // `unknown`, neither claim is true, so nothing renders (the helper is already false there).
  const showBackendProblem = backendIsUnreachable(backend)
  // KTD3: after signing out from the dropdown, the avatar trigger no longer exists (the signed-out
  // header mounts in its place), so focus moves to the "Se connecter" button once it mounts.
  const handleSignOut = () => {
    signOut()
    requestAnimationFrame(() => {
      document.getElementById('shell-signin-button')?.focus()
    })
  }
  // The signed-in check is a local token check, so it can still be true on a build that ships no
  // backend at all — and the account menu would then render a sync chip reading "all synced" while
  // nothing syncs, the one place the app makes a false backup claim. Clearing the session removes
  // that state rather than adding a distinct one; local data is retained by design (auth.signOut),
  // so the only visible effect is a session that does not survive losing the backend.
  useEffect(() => {
    if (signedIn && backendAbsent) signOut()
  }, [signedIn, backendAbsent, signOut])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  // Sibling to `selectedId`, same prop-threading pattern (U2 KTD1): desktop-only hover highlight
  // for the corresponding map pin, fed by RestaurantList's onHover and consumed by MapView's
  // hoveredId prop. No explicit desktop-only gate is added here — see MapView.tsx's own comment
  // on `hoveredId` for why the mobile list/map pane toggle already makes this a no-op on mobile.
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  // Closing RestaurantDetail's Modal restores focus to the list card that opened it (Modal.tsx's
  // `previouslyFocused?.focus()` cleanup), which fires RestaurantList's onFocus handler as if the
  // user were newly hovering it -- even though nothing is actually under the pointer. That restore
  // runs as a passive-effect cleanup, strictly after the onClose handler's own state updates
  // commit, so clearing hoveredId in onClose alone can't survive it (the later, focus-triggered
  // call always wins). Set right before closing, this flag suppresses exactly that one
  // programmatic re-fire in handleHover below, then clears itself so every later genuine hover
  // behaves normally (code-review finding, KTD2 phantom-halo guard).
  const suppressNextHoverRef = useRef(false)
  function handleHover(id: string | null) {
    if (suppressNextHoverRef.current) {
      suppressNextHoverRef.current = false
      return
    }
    setHoveredId(id)
  }
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
  const visible = useMemo(
    () => restaurants.filter((r) => matches(r, filter)),
    [restaurants, filter],
  )
  // Drives the mobile "Filtres · N" pill badge (U4, KTD5) — reuses U2's activeFilterCount rather
  // than re-deriving the count from `filter` here.
  const activeCount = activeFilterCount(filter)
  // Distance is selectable only once a position is known (R1). Until then, the effective
  // criterion falls back to Date regardless of what's persisted — this is what AE1 and AE6 render
  // as "active" and what R11's sort step actually uses.
  const distanceSelectable = currentPosition !== null
  const effectiveSortCriterion: SortCriterion = distanceSelectable
    ? sortPreference.criterion
    : 'date'
  const effectiveSortDirection =
    effectiveSortCriterion === 'distance'
      ? sortPreference.directions.distance
      : sortPreference.directions.date
  // Only the Distance path reads `position` (KTD7's date-rule branch ignores it entirely), so
  // don't re-run the sort every time it changes while Date is active.
  const positionForSort = effectiveSortCriterion === 'distance' ? currentPosition : null
  const sorted = useMemo(
    () => sortRestaurants(visible, effectiveSortCriterion, effectiveSortDirection, positionForSort),
    [visible, effectiveSortCriterion, effectiveSortDirection, positionForSort],
  )
  // A hovered restaurant that drops out of the filtered/sorted list (e.g. a filter change) unmounts
  // its RestaurantList card with no mouseleave/blur to clear hoveredId, since React doesn't fire
  // either on unmount — its dimmed, filtered-out map pin would otherwise keep the hover halo lit
  // indefinitely with no card left to hover away from it.
  useEffect(() => {
    if (hoveredId && !sorted.some((r) => r.id === hoveredId)) setHoveredId(null)
  }, [sorted, hoveredId])

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
    const next = {
      ...sortPreference,
      directions: toggledDirections(effectiveSortCriterion, sortPreference.directions),
    }
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
    <div className="flex h-full flex-col bg-canvas text-gray-900">
      <header
        ref={headerRef}
        className="sticky top-0 z-20 flex items-center justify-between bg-canvas/85 px-4 py-3 backdrop-blur"
      >
        {/* min-w-0/flex-1 + truncate (bug fix): without a shrink target, this group's natural width
            plus the right group's (sign-in/settings) forced the header wider than a narrow phone
            viewport (~320-375px), overflowing the whole page horizontally — visible as a
            scrollbar/white gutter on the right with the settings button pushed toward or past the
            edge. Letting this group shrink (and truncate its one-word title on the narrowest
            screens) keeps the row within the viewport instead; the right group stays `shrink-0`
            since its buttons shouldn't truncate. */}
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          {/* The app's own mark, not a stand-in for it: this tile is the one piece of brand on
              screen at all times, and a generic emoji on a brand-colored square said nothing the
              installed icon says. Served from BASE_URL because the demo lives on a repo subpath. */}
          <img
            src={`${import.meta.env.BASE_URL}logo.svg`}
            alt=""
            aria-hidden="true"
            width={36}
            height={36}
            className="h-9 w-9 shrink-0"
          />
          <div className="min-w-0 leading-none">
            <h1 className="truncate text-2xl font-bold tracking-tight text-gray-900">
              {t('app.title')}
            </h1>
            <p className="mt-0.5 hidden text-xs text-gray-600 sm:block">{t('shell.tagline')}</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {showBackendProblem && <BackendUnreachableIndicator />}
          {signedIn ? (
            <AccountMenu
              email={email}
              avatarUrl={avatarUrl}
              onOpenSettings={() => setSettingsOpen(true)}
              onSignOut={handleSignOut}
            />
          ) : (
            /* A fragment carrying both controls, and only the Sign in half is gated: gating the
               fragment would take Settings — and with it the language switcher — off the demo
               entirely (R21). */
            <>
              {!backendAbsent && (
                <Button
                  id="shell-signin-button"
                  variant="secondary"
                  // Present but inert when the configuration itself could not be read (KTD9): there
                  // is no address, so an active control would open an authentication window against
                  // the visitor's own machine. A known address that is merely down keeps working —
                  // retrying can succeed there.
                  disabled={signInDisabled}
                  title={signInDisabled ? t('backend.signInUnavailable') : undefined}
                  onClick={() => void signIn()}
                >
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
            </>
          )}
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <aside
          className={cn(
            'min-h-0 flex-1 flex-col border-gray-200 bg-canvas md:flex md:w-[var(--sidebar-width)] md:flex-none md:border-r',
            view === 'list' ? 'flex' : 'hidden',
          )}
        >
          <div className="space-y-2 p-3">
            <Button variant="primary" className="w-full" onClick={() => setAdding(true)}>
              {t('shell.addPlace')}
            </Button>
            <button
              type="button"
              onClick={() => setDeciding(true)}
              className="w-full rounded-full bg-white px-3 py-2.5 text-sm font-semibold text-brand-strong shadow-chip transition hover:bg-brand-soft active:bg-brand-soft"
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
              'hidden md:fixed md:top-[var(--filter-overlay-top)] md:right-[var(--filter-overlay-right)] md:left-[var(--filter-overlay-left)] md:z-[900] md:block md:max-h-[50vh] md:overflow-y-auto',
              restaurants.length > 0 && 'md:rounded-card md:bg-white md:shadow-lg',
            )}
          >
            <FilterBar
              restaurants={restaurants}
              filter={filter}
              onChange={setFilter}
              layout="inline"
            />
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
            <RestaurantList
              items={sorted}
              onSelect={setSelectedId}
              onHover={handleHover}
              currentPosition={currentPosition}
            />
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
          className={cn('relative min-h-0 flex-1', view === 'map' ? 'block' : 'hidden', 'md:block')}
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
            hoveredId={hoveredId}
            active={view === 'map'}
          />
          {/* On mobile the add action lives in the list pane, so surface it on the map too. */}
          {view === 'map' && (
            <button
              type="button"
              onClick={() => setAdding(true)}
              aria-label={t('shell.addPlaceAria')}
              className="absolute right-5 bottom-[calc(var(--safe-area-floating-offset)+0.5rem)] z-[1000] grid h-14 w-14 place-items-center rounded-full bg-brand text-3xl leading-none text-white shadow-lg ring-1 ring-black/10 transition hover:bg-brand-strong active:bg-brand-strong active:shadow-md md:hidden"
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
        // --z-nav (index.css): now that the map fills <main> fully (no reserved bottom gap),
        // Leaflet's own internal panes/controls (tile pane z-200, attribution/.leaflet-bottom
        // z-1000 — see node_modules/leaflet/dist/leaflet.css) extend into this same screen
        // region. Leaflet's container doesn't establish its own stacking context, so those
        // z-index values compare directly against this nav — anything at or below 1000 (the old
        // z-30 included) render underneath them and disappear entirely.
        className="fixed inset-x-0 bottom-0 z-[var(--z-nav)] flex gap-1 border-t border-gray-200 bg-white/95 p-1.5 pb-[calc(0.375rem+env(safe-area-inset-bottom))] backdrop-blur md:hidden"
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
          Modal already renders — the "See results" button below is a fourth, explicit way in.
          `initialFocus="panel"` (bug fix): with no ModalHeader, FilterBar's own first focusable
          descendant is a filter-mutating control ("Clear all" when a filter is active, else the
          first cuisine chip) — focusing the panel itself on open instead of that first control
          stops a reflexive Enter/Space keypress from silently changing the filter. The
          FilterBar/SortBar pair renders inside its own scrollable box, capped below the always-
          visible "See results" button (bug fix): FilterBar's "+N more" cuisine overflow can grow
          past one screen, and without this split the button — the only labeled close affordance
          left after removing ModalHeader — could scroll out of reach with it. */}
      {filtersOpen && (
        <Modal
          onClose={() => setFiltersOpen(false)}
          panelClassName="flex max-h-[90vh] flex-col overflow-hidden"
          initialFocus="panel"
        >
          <div className="min-h-0 flex-1 overflow-y-auto">
            <FilterBar
              restaurants={restaurants}
              filter={filter}
              onChange={setFilter}
              layout="stacked"
            />
            <SortBar
              criterion={effectiveSortCriterion}
              direction={effectiveSortDirection}
              distanceSelectable={distanceSelectable}
              onCriterionChange={handleSortCriterionChange}
              onDirectionToggle={handleSortDirectionToggle}
              divider={false}
            />
          </div>
          <Button
            variant="primary"
            className="mt-2 w-full shrink-0"
            onClick={() => setFiltersOpen(false)}
          >
            {t('filters.seeResults')}
          </Button>
        </Modal>
      )}

      {selectedId && (
        <RestaurantDetail
          restaurantId={selectedId}
          // Also clears hoveredId defensively and arms suppressNextHoverRef (see its declaration
          // above) so Modal's focus-restore-on-close can't relight this restaurant's hover halo —
          // on both desktop (visible map pane) and mobile (hidden, not unmounted, so a stale
          // hoveredId would surface the moment the user switches to Map).
          onClose={() => {
            suppressNextHoverRef.current = true
            setSelectedId(null)
            setHoveredId(null)
          }}
          currentPosition={currentPosition}
        />
      )}

      <ReloadPrompt />
    </div>
  )
}
