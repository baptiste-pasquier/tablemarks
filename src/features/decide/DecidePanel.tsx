import { useMemo, useState } from 'react'
import { useRestaurants } from '../useRestaurants'
import { rollupLabel } from '../display'
import { decideCandidates, pickForMe, type Anchor, type Candidate } from './candidates'

const RADIUS_PRESETS_KM = [0.5, 1, 5] as const
const DEFAULT_RADIUS_KM = 1

function formatDistance(m: number): string {
  return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`
}

export function DecidePanel({
  anchor,
  onClose,
  onOpenRestaurant,
}: {
  anchor: Anchor | null
  onClose: () => void
  onOpenRestaurant: (id: string) => void
}) {
  const restaurants = useRestaurants()
  const [radiusKm, setRadiusKm] = useState<number>(DEFAULT_RADIUS_KM)
  const [pickedId, setPickedId] = useState<string | null>(null)

  const candidates = useMemo<Candidate[]>(
    () => (anchor ? decideCandidates(restaurants, anchor, radiusKm * 1000) : []),
    [restaurants, anchor, radiusKm],
  )

  const nextRadius = RADIUS_PRESETS_KM.find((r) => r > radiusKm)

  return (
    <div className="fixed inset-0 z-[1100] flex items-start justify-center bg-black/30 p-4 pt-16">
      <div className="flex max-h-[80vh] w-full max-w-md flex-col rounded-lg bg-white p-5 shadow-xl">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-base font-semibold">Where to eat?</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="text-gray-400 hover:text-gray-600">
            ✕
          </button>
        </div>

        <div className="mb-3 flex items-center gap-2 text-sm">
          <span className="text-gray-500">Within</span>
          {RADIUS_PRESETS_KM.map((km) => (
            <button
              key={km}
              type="button"
              onClick={() => {
                setRadiusKm(km)
                setPickedId(null)
              }}
              aria-pressed={km === radiusKm}
              className={`rounded-full border px-2.5 py-0.5 ${
                km === radiusKm ? 'border-brand bg-brand-soft text-brand' : 'border-gray-300'
              }`}
            >
              {km < 1 ? `${km * 1000} m` : `${km} km`}
            </button>
          ))}
        </div>

        {!anchor ? (
          <p className="text-sm text-gray-500">Move the map to choose an area.</p>
        ) : candidates.length === 0 ? (
          <div className="text-sm text-gray-500">
            <p>Nothing to try or worth a return within {radiusKm < 1 ? `${radiusKm * 1000} m` : `${radiusKm} km`}.</p>
            {nextRadius && (
              <button
                type="button"
                onClick={() => setRadiusKm(nextRadius)}
                className="mt-1 font-medium text-brand underline"
              >
                Widen to {nextRadius < 1 ? `${nextRadius * 1000} m` : `${nextRadius} km`}
              </button>
            )}
          </div>
        ) : (
          <>
            <button
              type="button"
              onClick={() => setPickedId(pickForMe(candidates)?.restaurant.id ?? null)}
              className="mb-3 w-full rounded-md bg-brand px-3 py-2 text-sm font-medium text-white hover:opacity-90"
            >
              🎲 Pick for me
            </button>
            <ul className="-mx-1 divide-y divide-gray-100 overflow-y-auto">
              {candidates.map(({ restaurant, distanceM }) => (
                <li
                  key={restaurant.id}
                  className={pickedId === restaurant.id ? 'rounded-md bg-brand-soft' : ''}
                >
                  <div className="flex items-center justify-between gap-2 px-1 py-2">
                    <button
                      type="button"
                      onClick={() => onOpenRestaurant(restaurant.id)}
                      className="flex-1 text-left"
                    >
                      <span className="font-medium">{restaurant.name}</span>
                      <span className="block text-xs text-gray-500">
                        {rollupLabel(restaurant)} · {formatDistance(distanceM)}
                      </span>
                    </button>
                    {restaurant.mapsUrl && (
                      <a
                        href={restaurant.mapsUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="shrink-0 text-xs font-medium text-brand underline"
                      >
                        Directions
                      </a>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  )
}
