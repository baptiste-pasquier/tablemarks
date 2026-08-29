import { useMemo, useState } from 'react'
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
import { PortabilityPanel } from './features/portability/PortabilityPanel'
import { ReloadPrompt } from './features/pwa/ReloadPrompt'
import { SyncStatusIndicator } from './features/sync/SyncStatusIndicator'
import type { GeoPoint } from './lib/geolocate'
import { DEFAULT_MAP_CENTER } from './lib/geo'

type MobileView = 'list' | 'map'

export default function App() {
  const restaurants = useRestaurants()
  const { signedIn, email, signIn, signOut } = useAuth()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [deciding, setDeciding] = useState(false)
  const [portability, setPortability] = useState(false)
  const [anchor, setAnchor] = useState<GeoPoint | null>(DEFAULT_MAP_CENTER)
  const [filter, setFilter] = useState(emptyFilter())
  // Reset on every reload/relaunch (KTD5) — no persistence beyond component state.
  const [view, setView] = useState<MobileView>('list')
  // App re-renders on every map pan/zoom (anchor state); memoize so the list and markers
  // aren't recomputed against every restaurant on each move.
  const visible = useMemo(() => restaurants.filter((r) => matches(r, filter)), [restaurants, filter])
  const markers = useMemo(() => toMarkers(restaurants, filter), [restaurants, filter])

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
            <h1 className="font-display text-2xl font-semibold tracking-tight text-gray-900">Tablemarks</h1>
            <p className="mt-0.5 hidden text-xs text-gray-500 sm:block">Your map of places worth a table</p>
          </div>
        </div>
        {signedIn ? (
          <div className="flex items-center gap-3 text-sm">
            <SyncStatusIndicator />
            <span className="hidden max-w-[10rem] truncate text-gray-500 sm:block">{email}</span>
            <button
              type="button"
              onClick={signOut}
              className="rounded-full border border-gray-300 px-3 py-1.5 font-medium transition hover:bg-gray-100"
            >
              Sign out
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => void signIn()}
            className="rounded-full border border-gray-300 px-3 py-1.5 text-sm font-medium transition hover:bg-gray-100"
          >
            Sign in<span className="hidden sm:inline"> with Google</span>
          </button>
        )}
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
              className="w-full rounded-xl bg-brand px-3 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-strong"
            >
              + Add a place
            </button>
            <button
              type="button"
              onClick={() => setDeciding(true)}
              className="w-full rounded-xl border border-brand/30 px-3 py-2.5 text-sm font-semibold text-brand transition hover:bg-brand-soft"
            >
              Where to eat?
            </button>
            <button
              type="button"
              onClick={() => setPortability(true)}
              className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm font-medium text-gray-600 transition hover:bg-gray-100"
            >
              Export / Import
            </button>
          </div>
          <FilterBar restaurants={restaurants} filter={filter} onChange={setFilter} />
          <div className="min-h-0 flex-1 overflow-y-auto">
            <RestaurantList items={visible} onSelect={setSelectedId} />
          </div>
        </aside>

        <main
          className={`relative min-h-0 flex-1 pb-[calc(var(--spacing-toggle-bar)+env(safe-area-inset-bottom))] md:pb-0 ${
            view === 'map' ? 'block' : 'hidden'
          } md:block`}
        >
          <MapView markers={markers} onSelect={setSelectedId} onCenterChange={setAnchor} />
          {/* On mobile the add action lives in the list pane, so surface it on the map too. */}
          {view === 'map' && (
            <button
              type="button"
              onClick={() => setAdding(true)}
              aria-label="Add a place"
              className="absolute bottom-[calc(var(--spacing-toggle-bar)+env(safe-area-inset-bottom)+1rem)] right-5 z-[1000] grid h-14 w-14 place-items-center rounded-full bg-brand text-3xl leading-none text-white shadow-lg ring-1 ring-black/10 transition hover:bg-brand-strong md:hidden"
            >
              +
            </button>
          )}
        </main>
      </div>

      {/* Mobile-only view switch, fixed to the viewport bottom (R5) so it stays reachable
          regardless of scroll/pan position in either pane. */}
      <nav
        aria-label="View"
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
            {v}
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

      {portability && <PortabilityPanel onClose={() => setPortability(false)} />}

      {selectedId && (
        <RestaurantDetail restaurantId={selectedId} onClose={() => setSelectedId(null)} />
      )}

      <ReloadPrompt />
    </div>
  )
}
