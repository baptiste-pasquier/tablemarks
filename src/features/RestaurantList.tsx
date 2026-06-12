import { rollupLabel, statusLabel } from './display'
import type { Restaurant } from '../types/models'

export function RestaurantList({
  items,
  onSelect,
}: {
  items: Restaurant[]
  onSelect?: (id: string) => void
}) {
  if (items.length === 0) {
    return <p className="p-4 text-sm text-gray-500">No places yet. Add one to get started.</p>
  }

  return (
    <ul className="divide-y divide-gray-100">
      {items.map((r) => (
        <li key={r.id}>
          <button
            type="button"
            onClick={() => onSelect?.(r.id)}
            className="flex w-full flex-col items-start gap-0.5 px-4 py-3 text-left hover:bg-brand-soft"
          >
            <span className="flex w-full items-center justify-between gap-2">
              <span className="font-medium">{r.name}</span>
              <span className="shrink-0 text-xs text-gray-500">{statusLabel(r)}</span>
            </span>
            <span className="text-sm text-gray-600">{rollupLabel(r)}</span>
          </button>
        </li>
      ))}
    </ul>
  )
}
