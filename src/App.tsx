import { useState } from 'react'
import { useRestaurants } from './features/useRestaurants'
import { useAuth } from './auth/useAuth'
import { RestaurantList } from './features/RestaurantList'
import { MapView } from './features/map/MapView'
import { toMarkers } from './features/map/markers'
import { AddPlace } from './features/capture/AddPlace'
import { RestaurantDetail } from './features/visits/RestaurantDetail'
import { DecidePanel } from './features/decide/DecidePanel'
import type { GeoPoint } from './features/decide/geolocate'

export default function App() {
  const restaurants = useRestaurants()
  const { signedIn, email, signIn, signOut } = useAuth()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [deciding, setDeciding] = useState(false)
  const [anchor, setAnchor] = useState<GeoPoint | null>(null)
  const markers = toMarkers(restaurants)

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
        <h1 className="text-lg font-bold text-brand">Tablemarks</h1>
        {signedIn ? (
          <div className="flex items-center gap-3 text-sm">
            <span className="text-gray-500">{email}</span>
            <button
              type="button"
              onClick={signOut}
              className="rounded-md border border-gray-300 px-3 py-1.5 hover:bg-gray-50"
            >
              Sign out
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => void signIn()}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50"
          >
            Sign in with Google
          </button>
        )}
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="flex w-80 flex-col border-r border-gray-200">
          <div className="border-b border-gray-100 p-3">
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="w-full rounded-md bg-brand px-3 py-2 text-sm font-medium text-white hover:opacity-90"
            >
              + Add a place
            </button>
            <button
              type="button"
              onClick={() => setDeciding(true)}
              className="mt-2 w-full rounded-md border border-brand px-3 py-2 text-sm font-medium text-brand hover:bg-brand-soft"
            >
              Where to eat?
            </button>
          </div>
          <div className="flex-1 overflow-y-auto">
            <RestaurantList items={restaurants} onSelect={setSelectedId} />
          </div>
        </aside>

        <main className="flex-1">
          <MapView markers={markers} onSelect={setSelectedId} onCenterChange={setAnchor} />
        </main>
      </div>

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

      {selectedId && (
        <RestaurantDetail restaurantId={selectedId} onClose={() => setSelectedId(null)} />
      )}
    </div>
  )
}
