import { useEffect, useState } from 'react'
import { getRestaurant } from '../../data/restaurants'
import { visitsForRestaurant } from '../../data/visits'
import { onStoreChange } from '../../data/events'
import type { Restaurant, Visit } from '../../types/models'

export interface RestaurantDetail {
  restaurant: Restaurant | null
  visits: Visit[]
}

/** A restaurant plus its visits, refreshed on any store change. */
export function useRestaurantDetail(id: string | null): RestaurantDetail {
  const [detail, setDetail] = useState<RestaurantDetail>({ restaurant: null, visits: [] })

  useEffect(() => {
    if (!id) {
      setDetail({ restaurant: null, visits: [] })
      return
    }
    let active = true
    const load = () => {
      void Promise.all([getRestaurant(id), visitsForRestaurant(id)]).then(([restaurant, visits]) => {
        if (active) setDetail({ restaurant: restaurant ?? null, visits })
      })
    }
    load()
    const off = onStoreChange(load)
    return () => {
      active = false
      off()
    }
  }, [id])

  return detail
}
