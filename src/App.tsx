import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Settings } from 'lucide-react'
import { useRestaurants } from './features/useRestaurants'
import { useAuth } from './auth/useAuth'
import { RestaurantList } from './features/RestaurantList'
import { MapView } from './features/map/MapView'
import { toMarkers } from './features/map/markers'
import { FilterBar } from './features/facets/FilterBar'
import { emptyFilter, matches } from './features/facets/filter'
import { AddPlace } from './features/capture/AddPlace'
import { RestaurantDetail } from './features/visits/RestaurantDetail'
import { DecidePanel } from './features/decide/DecidePanel'
import { SettingsPanel } from './features/settings/SettingsPanel'
import { Modal } from './features/ui/Modal'
import { ReloadPrompt } from './features/pwa/ReloadPrompt'
import { SyncStatusIndicator } from './features/sync/SyncStatusIndicator'
import { geolocate, type GeoPoint } from './lib/geolocate'
import { DEFAULT_MAP_CENTER } from './lib/geo'

type MobileView = 'list' | 'map'

export default function App() {
  const { t } = useTranslation()
  const restaurants = useRestaurants()
  const { signedIn, email, signIn, signOut } = useAuth()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [deciding, setDeciding] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [anchor, setAnchor] = useState<GeoPoint | null>(DEFAULT_MAP_CENTER)
  // Sibling to `anchor`, deliberately not merged with it (KTD1): `anchor` is pan-driven and
  // belongs to the Decide flow, while `currentPosition` is fed only by the on-load geolocation
  // fetch (F1) and the "Localiser" tap (F2, wired via MapView's onLocate).
  const [currentPosition, setCurrentPosition] = useState<GeoPoint | null>(null)
  const [filter, setFilter] = useState(emptyFilter())
  // Reset on every reload/relaunch (KTD5) — no persistence beyond component state.
  const [view, setView] = useState<MobileView>('list')
  // App re-renders on every map pan/zoom (anchor state); memoize so the list and markers
  // aren't recomputed against every restaurant on each move.
  const visible = useMemo(() => restaurants.filter((r) => matches(r, filter)), [restaurants, filter])
  // Markers carry raw data (status, verdict, visit count, cuisine), not pre-translated text —
  // StatusBadge, translateVisitsCount, and emojiForCuisine translate at render time inside
  // MapView and react to a language switch on their own, so no `i18n.language` dependency here.
  const markers = useMemo(() => toMarkers(restaurants, filter), [restaurants, filter])

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

  return (
    <div className="flex h-full flex-col bg-gray-50 text-gray-900">
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-gray-200 bg-white/85 px-4 py-3 backdrop-blur">
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
              <button
                type="button"
                onClick={signOut}
                className="rounded-full border border-gray-300 px-3 py-1.5 font-medium transition hover:bg-gray-100 active:bg-gray-200"
              >
                {t('shell.signOut')}
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => void signIn()}
              className="rounded-full border border-gray-300 px-3 py-1.5 text-sm font-medium transition hover:bg-gray-100 active:bg-gray-200"
            >
              {t('shell.signIn')}
              <span className="hidden sm:inline"> {t('shell.withGoogle')}</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            aria-label={t('settings.openAria')}
            className="rounded-full border border-gray-300 p-1.5 transition hover:bg-gray-100 active:bg-gray-200"
          >
            <Settings className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <aside
          className={`min-h-0 flex-1 flex-col border-gray-200 bg-white pb-[calc(var(--spacing-toggle-bar)+env(safe-area-inset-bottom))] md:flex md:w-80 md:flex-none md:border-r md:pb-0 ${
            view === 'list' ? 'flex' : 'hidden'
          }`}
        >
          <div className="space-y-2 border-b border-gray-100 p-3">
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="w-full rounded-xl bg-brand px-3 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-strong active:bg-brand-strong active:shadow-none"
            >
              {t('shell.addPlace')}
            </button>
            <button
              type="button"
              onClick={() => setDeciding(true)}
              className="w-full rounded-xl border border-brand/30 px-3 py-2.5 text-sm font-semibold text-brand transition hover:bg-brand-soft active:bg-brand-soft"
            >
              {t('shell.whereToEat')}
            </button>
          </div>
          <FilterBar restaurants={restaurants} filter={filter} onChange={setFilter} />
          <div className="min-h-0 flex-1 overflow-y-auto">
            <RestaurantList items={visible} onSelect={setSelectedId} currentPosition={currentPosition} />
          </div>
        </aside>

        <main
          className={`relative min-h-0 flex-1 pb-[calc(var(--spacing-toggle-bar)+env(safe-area-inset-bottom))] md:pb-0 ${
            view === 'map' ? 'block' : 'hidden'
          } md:block`}
        >
          <MapView
            markers={markers}
            onSelect={setSelectedId}
            onCenterChange={setAnchor}
            beginLocate={beginLocate}
            onLocate={commitLocate}
            currentPosition={currentPosition}
            selectedId={selectedId}
            active={view === 'map'}
          />
          {/* On mobile the add action lives in the list pane, so surface it on the map too. */}
          {view === 'map' && (
            <button
              type="button"
              onClick={() => setAdding(true)}
              aria-label={t('shell.addPlaceAria')}
              className="absolute bottom-[calc(var(--spacing-toggle-bar)+env(safe-area-inset-bottom)+1rem)] right-5 z-[1000] grid h-14 w-14 place-items-center rounded-full bg-brand text-3xl leading-none text-white shadow-lg ring-1 ring-black/10 transition hover:bg-brand-strong active:bg-brand-strong active:shadow-md md:hidden"
            >
              +
            </button>
          )}
        </main>
      </div>

      {/* Mobile-only view switch, fixed to the viewport bottom (R5) so it stays reachable
          regardless of scroll/pan position in either pane. */}
      <nav
        aria-label={t('shell.viewNav')}
        className="fixed inset-x-0 bottom-0 z-30 flex gap-1 border-t border-gray-200 bg-white/95 p-1.5 pb-[calc(0.375rem+env(safe-area-inset-bottom))] backdrop-blur md:hidden"
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
