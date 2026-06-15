import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { RestaurantList } from './RestaurantList'
import type { Restaurant } from '../types/models'

function r(over: Partial<Restaurant> & Pick<Restaurant, 'id' | 'name'>): Restaurant {
  return {
    lat: 1,
    lng: 2,
    pending: false,
    latestVerdict: null,
    latestVisitDate: null,
    visitCount: 0,
    updated: '1',
    deleted: false,
    needsPush: false,
    ...over,
  }
}

describe('RestaurantList', () => {
  it('shows an empty state with no items', () => {
    render(<RestaurantList items={[]} />)
    expect(screen.getByText(/no places yet/i)).toBeInTheDocument()
  })

  it('renders status and rollup per place, including provisional rows', () => {
    render(
      <RestaurantList
        items={[
          r({ id: 'a', name: 'Visited place', visitCount: 2, latestVerdict: 'go_back' }),
          r({ id: 'b', name: 'New place' }),
          r({ id: 'c', name: 'Pending place', pending: true, lat: null, lng: null }),
        ]}
      />,
    )
    expect(screen.getByText('Go back · 2 visits')).toBeInTheDocument()
    expect(screen.getByText('Visited')).toBeInTheDocument()
    expect(screen.getByText('Resolving…')).toBeInTheDocument()
    // 'New place' is to-try
    expect(screen.getAllByText('To try').length).toBeGreaterThanOrEqual(1)
  })
})
