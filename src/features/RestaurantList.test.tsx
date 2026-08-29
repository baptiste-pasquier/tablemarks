import { render, screen, within } from '@testing-library/react'
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
    ...over,
  }
}

describe('RestaurantList', () => {
  it('shows an empty state with no items', () => {
    render(<RestaurantList items={[]} />)
    expect(screen.getByText(/no places yet/i)).toBeInTheDocument()
  })

  it('renders the fused status/verdict badge per place, including provisional rows', () => {
    render(
      <RestaurantList
        items={[
          r({ id: 'a', name: 'Visited place', visitCount: 2, latestVerdict: 'go_back' }),
          r({ id: 'b', name: 'New place' }),
          r({ id: 'c', name: 'Pending place', pending: true, lat: null, lng: null }),
        ]}
      />,
    )
    // The badge shows only the latest verdict, never a "· N visits" suffix.
    expect(screen.getByText('Go back')).toBeInTheDocument()
    expect(screen.getByText('To try')).toBeInTheDocument()
    expect(screen.getByText('Resolving…')).toBeInTheDocument()
  })

  it('renders the verdict icon as a separate aria-hidden node from the label text', () => {
    render(<RestaurantList items={[r({ id: 'a', name: 'Visited place', visitCount: 1, latestVerdict: 'go_back' })]} />)

    const label = screen.getByText('Go back')
    const badge = label.parentElement
    expect(badge).not.toBeNull()
    const icon = within(badge as HTMLElement).getByText('↩️')
    expect(icon).toHaveAttribute('aria-hidden', 'true')
  })

  it('shows the cuisine as a subtitle when set, omitted when not', () => {
    render(
      <RestaurantList
        items={[
          r({ id: 'a', name: 'Categorized', cuisine: 'Ramen' }),
          r({ id: 'b', name: 'Uncategorized' }),
        ]}
      />,
    )
    expect(screen.getByText('Ramen')).toBeInTheDocument()

    const uncategorizedRow = screen.getByText('Uncategorized').closest('li')
    expect(uncategorizedRow).not.toBeNull()
    expect(within(uncategorizedRow as HTMLElement).queryByText('Ramen')).not.toBeInTheDocument()
  })
})
