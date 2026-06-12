import { useEffect, useState } from 'react'
import { allRestaurants } from '../data/restaurants'
import { onStoreChange } from '../data/events'
import type { Restaurant } from '../types/models'

/** Live list of non-deleted restaurants, refreshed on any store change (user or sync). */
export function useRestaurants(): Restaurant[] {
  const [items, setItems] = useState<Restaurant[]>([])

  useEffect(() => {
    let active = true
    const load = () => {
      void allRestaurants().then((r) => {
        if (active) setItems(r)
      })
    }
    load()
    const off = onStoreChange(load)
    return () => {
      active = false
      off()
    }
  }, [])

  return items
}
