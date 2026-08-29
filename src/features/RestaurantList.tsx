import { StatusBadge } from './StatusBadge'
import { colorForCuisine } from './facets/cuisines'
import type { Restaurant } from '../types/models'

export function RestaurantList({
  items,
  onSelect,
}: {
  items: Restaurant[]
  onSelect?: (id: string) => void
}) {
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
        <span aria-hidden="true" className="text-4xl">
          🍽️
        </span>
        <p className="font-display text-lg font-semibold text-gray-900">No places yet</p>
        <p className="max-w-[16rem] text-sm text-gray-500">
          Save a spot you love or one you want to try — paste a Google Maps link or search a name.
        </p>
      </div>
    )
  }

  return (
    <ul className="divide-y divide-gray-100">
      {items.map((r) => (
        <li key={r.id}>
          <button
            type="button"
            onClick={() => onSelect?.(r.id)}
            className="flex w-full items-start gap-3 px-4 py-3 text-left transition hover:bg-brand-soft/40"
          >
            <span
              aria-hidden="true"
              className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full shadow ring-2 ring-white"
              style={{ background: colorForCuisine(r.cuisine) }}
            />
            <span className="min-w-0 flex-1">
              <span className="flex w-full items-center justify-between gap-2">
                <span className="truncate font-medium text-gray-900">{r.name}</span>
                <StatusBadge restaurant={r} />
              </span>
              {r.cuisine && <span className="mt-0.5 block truncate text-sm text-gray-500">{r.cuisine}</span>}
            </span>
          </button>
        </li>
      ))}
    </ul>
  )
}
