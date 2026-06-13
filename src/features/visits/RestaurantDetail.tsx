import { useState } from 'react'
import { useRestaurantDetail } from './useRestaurantDetail'
import { createVisit, removeVisit } from '../../data/visits'
import { statusLabel } from '../display'
import { VERDICTS, VERDICT_LABELS, type Verdict } from '../../types/models'

function VerdictButtons({ onPick, disabled }: { onPick: (v: Verdict) => void; disabled?: boolean }) {
  return (
    <div className="flex flex-wrap gap-2">
      {VERDICTS.map((v) => (
        <button
          key={v}
          type="button"
          disabled={disabled}
          onClick={() => onPick(v)}
          className="rounded-full border border-gray-300 px-3 py-1 text-sm hover:bg-brand-soft disabled:opacity-50"
        >
          {VERDICT_LABELS[v]}
        </button>
      ))}
    </div>
  )
}

export function RestaurantDetail({
  restaurantId,
  onClose,
}: {
  restaurantId: string
  onClose: () => void
}) {
  const { restaurant, visits } = useRestaurantDetail(restaurantId)
  const [logging, setLogging] = useState(false)
  const [pastDate, setPastDate] = useState('')

  if (!restaurant) return null

  async function logNow(verdict: Verdict) {
    await createVisit({ restaurantId, verdict })
    setLogging(false)
  }

  async function logPast(verdict: Verdict) {
    if (!pastDate) return
    await createVisit({ restaurantId, date: pastDate, verdict })
    setPastDate('')
  }

  return (
    <div className="fixed inset-0 z-[1000] flex items-start justify-center bg-black/30 p-4 pt-16">
      <div className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl">
        <div className="mb-1 flex items-start justify-between">
          <h2 className="text-lg font-semibold">{restaurant.name}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="text-gray-400 hover:text-gray-600">
            ✕
          </button>
        </div>
        <p className="text-sm text-gray-500">
          {statusLabel(restaurant)}
          {restaurant.address ? ` · ${restaurant.address}` : ''}
        </p>

        <div className="mt-4">
          {logging ? (
            <div>
              <p className="mb-2 text-sm font-medium">How was it?</p>
              <VerdictButtons onPick={(v) => void logNow(v)} />
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setLogging(true)}
              className="rounded-md bg-brand px-3 py-2 text-sm font-medium text-white hover:opacity-90"
            >
              I’m here now
            </button>
          )}
        </div>

        <div className="mt-5">
          <h3 className="text-sm font-semibold text-gray-700">
            Visits {visits.length > 0 && <span className="font-normal text-gray-400">({visits.length})</span>}
          </h3>
          {visits.length === 0 ? (
            <p className="mt-1 text-sm text-gray-500">No visits yet — it’s on your to-try list.</p>
          ) : (
            <ul className="mt-1 divide-y divide-gray-100">
              {visits.map((v) => (
                <li key={v.id} className="flex items-center justify-between py-2 text-sm">
                  <span>
                    <span className="font-medium">{VERDICT_LABELS[v.verdict]}</span>
                    <span className="ml-2 text-gray-400">{v.date}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => void removeVisit(v.id)}
                    aria-label={`Delete visit on ${v.date}`}
                    className="text-gray-400 hover:text-red-600"
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <details className="mt-4">
          <summary className="cursor-pointer text-sm text-gray-600">Add a past visit</summary>
          <div className="mt-2 space-y-2">
            <input
              type="date"
              value={pastDate}
              onChange={(e) => setPastDate(e.target.value)}
              aria-label="Visit date"
              className="rounded-md border border-gray-300 p-1.5 text-sm"
            />
            <VerdictButtons onPick={(v) => void logPast(v)} disabled={!pastDate} />
          </div>
        </details>
      </div>
    </div>
  )
}
