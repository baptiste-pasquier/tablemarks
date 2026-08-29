import { useMemo, useState } from 'react'
import { useRestaurants } from '../useRestaurants'
import { rollupLabel } from '../display'
import { decideCandidates, pickForMe, type Anchor, type Candidate } from './candidates'
import { Modal } from '../ui/Modal'

const RADIUS_PRESETS_KM = [0.5, 1, 5] as const
const DEFAULT_RADIUS_KM = 1

function formatDistance(m: number): string {
  return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`
}

function formatRadiusKm(km: number): string {
  return km < 1 ? `${km * 1000} m` : `${km} km`
}

/** Only http(s) links are safe to render as an href — guards against a pasted `javascript:` URL. */
function isHttpUrl(u: string | undefined): u is string {
  return !!u && /^https?:\/\//i.test(u)
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
    <Modal onClose={onClose} zIndexClassName="z-[1100]" panelClassName="flex max-h-[88vh] flex-col">
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
            {formatRadiusKm(km)}
          </button>
        ))}
      </div>

      {!anchor ? (
        <p className="text-sm text-gray-500">Move the map to choose an area.</p>
      ) : candidates.length === 0 ? (
        <div className="text-sm text-gray-500">
          <p>Nothing to try or worth a return within {formatRadiusKm(radiusKm)}.</p>
          {nextRadius && (
            <button
              type="button"
              onClick={() => setRadiusKm(nextRadius)}
              className="mt-1 font-medium text-brand underline"
            >
              Widen to {formatRadiusKm(nextRadius)}
            </button>
          )}
        </div>
      ) : (
        <>
          <button
            type="button"
            onClick={() => setPickedId(pickForMe(candidates)?.restaurant.id ?? null)}
            className="mb-3 w-full rounded-xl bg-brand px-3 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-strong"
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
                  {isHttpUrl(restaurant.mapsUrl) && (
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
    </Modal>
  )
}
