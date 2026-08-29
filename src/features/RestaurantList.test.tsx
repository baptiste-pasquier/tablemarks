import { render, screen, within } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { RestaurantList } from './RestaurantList'
import { VERDICT_ICON, VERDICT_LABELS, VERDICTS, type Restaurant } from '../types/models'

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

  it('renders each verdict\'s own assigned icon as a separate aria-hidden node from the label text', () => {
    render(
      <RestaurantList
        items={VERDICTS.map((v, i) => r({ id: `v${i}`, name: `Place ${i}`, visitCount: 1, latestVerdict: v }))}
      />,
    )

    for (const v of VERDICTS) {
      const label = screen.getByText(VERDICT_LABELS[v])
      const badge = label.parentElement
      expect(badge).not.toBeNull()
      const icon = within(badge as HTMLElement).getByText(VERDICT_ICON[v])
      expect(icon).toHaveAttribute('aria-hidden', 'true')
    }
  })

  it('shows a cuisine-tinted card with a top-right cuisine badge, and the verdict chip plus visit count in the card body, not beside the name', () => {
    render(
      <RestaurantList
        items={[r({ id: 'a', name: 'Baan Thaï', cuisine: 'Thai', visitCount: 3, latestVerdict: 'go_back' })]}
      />,
    )

    const card = screen.getByRole('button', { name: /Baan Thaï/ })
    expect(card).toHaveStyle({ background: 'color-mix(in srgb, #7c3aed 16%, #fdfaf6)' })

    const name = screen.getByText('Baan Thaï')
    const cuisineBadge = screen.getByText('Thai')
    expect(within(cuisineBadge).getByText('🍜')).toHaveAttribute('aria-hidden', 'true')
    // The cuisine badge shares the header row with the name (R10) ...
    expect(name.parentElement).toBe(cuisineBadge.parentElement)

    // ... while the verdict chip and visit count live in the card body, not that header row (R11).
    const verdictChip = screen.getByText('Go back')
    expect(name.parentElement).not.toBe(verdictChip.closest('div'))
    expect(screen.getByText('3 visits')).toBeInTheDocument()
  })

  it('shows a to-try restaurant with no visit count', () => {
    render(<RestaurantList items={[r({ id: 'a', name: 'New place', cuisine: 'French' })]} />)
    expect(screen.getByText('To try')).toBeInTheDocument()
    expect(screen.queryByText(/visits?$/)).not.toBeInTheDocument()
  })

  it('shows a pending/provisional restaurant with no visit count, regardless of its stored visit count', () => {
    render(
      <RestaurantList
        items={[r({ id: 'a', name: 'Pending place', pending: true, lat: null, lng: null, visitCount: 5 })]}
      />,
    )
    expect(screen.getByText('Resolving…')).toBeInTheDocument()
    expect(screen.queryByText(/visits?$/)).not.toBeInTheDocument()
  })

  it('renders the uncategorized tint and emoji for a restaurant with no cuisine, not a blank badge', () => {
    render(<RestaurantList items={[r({ id: 'a', name: 'No cuisine place' })]} />)

    const badge = screen.getByText('Uncategorized')
    expect(within(badge).getByText('🍽️')).toHaveAttribute('aria-hidden', 'true')

    const card = screen.getByRole('button', { name: /No cuisine place/ })
    expect(card).toHaveStyle({ background: 'color-mix(in srgb, #9ca3af 16%, #fdfaf6)' })
  })

  it('renders white badge text against a low-luminance cuisine color and near-black against a high-luminance one', () => {
    render(
      <RestaurantList
        items={[
          // Thai (#7c3aed) is low-luminance -> white badge text.
          r({ id: 'a', name: 'Dark cuisine', cuisine: 'Thai' }),
          // Mexican (#ca8a04) is high-luminance -> near-black badge text.
          r({ id: 'b', name: 'Light cuisine', cuisine: 'Mexican' }),
        ]}
      />,
    )
    expect(screen.getByText('Thai')).toHaveStyle({ color: '#ffffff' })
    expect(screen.getByText('Mexican')).toHaveStyle({ color: '#000000' })
  })

  it('shows "Uncategorized" (not a blank label) for a whitespace-only cuisine', () => {
    render(<RestaurantList items={[r({ id: 'a', name: 'Whitespace cuisine place', cuisine: '   ' })]} />)
    expect(screen.getByText('Uncategorized')).toBeInTheDocument()
  })
})
