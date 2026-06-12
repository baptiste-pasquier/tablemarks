import { useState } from 'react'
import { useRestaurants } from './features/useRestaurants'
import { useAuth } from './auth/useAuth'
import { RestaurantList } from './features/RestaurantList'
import { MapView } from './features/map/MapView'
import { toMarkers } from './features/map/markers'

export default function App() {
  const restaurants = useRestaurants()
  const { signedIn, email, signIn, signOut } = useAuth()
  const [, setSelectedId] = useState<string | null>(null)
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
              className="w-full rounded-md bg-brand px-3 py-2 text-sm font-medium text-white hover:opacity-90"
            >
              + Add a place
            </button>
          </div>
          <div className="flex-1 overflow-y-auto">
            <RestaurantList items={restaurants} onSelect={setSelectedId} />
          </div>
        </aside>

        <main className="flex-1">
          <MapView markers={markers} onSelect={setSelectedId} />
        </main>
      </div>
    </div>
  )
}
