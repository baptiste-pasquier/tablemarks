import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { RestaurantList } from './RestaurantList'
import { VERDICT_ICON, VERDICTS, translateVerdict, type Restaurant } from '../types/models'

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
      const label = screen.getByText(translateVerdict(v))
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
    const cuisineBadge = screen.getByText('Thai').parentElement as HTMLElement
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

    const badge = screen.getByText('Uncategorized').parentElement as HTMLElement
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

  it('shows no distance on any row when currentPosition is null', () => {
    render(
      <RestaurantList
        items={[r({ id: 'a', name: 'Place A', lat: 48.8566, lng: 2.3522 })]}
        currentPosition={null}
      />,
    )
    expect(screen.queryByText(/\d+ m$/)).not.toBeInTheDocument()
    expect(screen.queryByText(/\d+(\.\d+)? km$/)).not.toBeInTheDocument()
  })

  it("shows the formatted distance from currentPosition on a restaurant's row when it has resolved coordinates", () => {
    render(
      <RestaurantList
        items={[r({ id: 'a', name: 'Place A', lat: 48.8566, lng: 2.3522 })]}
        currentPosition={{ lat: 48.8566, lng: 2.3622 }}
      />,
    )
    // ~732m east along the same latitude.
    expect(screen.getByText('732 m')).toBeInTheDocument()
  })

  it('shows no distance for a provisional restaurant with null coordinates, even when currentPosition is set', () => {
    render(
      <RestaurantList
        items={[r({ id: 'a', name: 'Pending place', pending: true, lat: null, lng: null })]}
        currentPosition={{ lat: 48.8566, lng: 2.3522 }}
      />,
    )
    expect(screen.queryByText(/\d+ m$/)).not.toBeInTheDocument()
    expect(screen.queryByText(/\d+(\.\d+)? km$/)).not.toBeInTheDocument()
  })

  it('preserves the order of its items prop as given, independent of currentPosition (sorting happens upstream in App.tsx, not here)', () => {
    const items = [
      r({ id: 'a', name: 'Alpha', lat: 48.8566, lng: 2.3522 }),
      r({ id: 'b', name: 'Bravo', lat: 48.86, lng: 2.36 }),
      r({ id: 'c', name: 'Charlie', pending: true, lat: null, lng: null }),
    ]

    const { rerender } = render(<RestaurantList items={items} currentPosition={null} />)
    const namesWithout = screen.getAllByRole('button').map((btn) => btn.textContent)

    rerender(<RestaurantList items={items} currentPosition={{ lat: 48.8566, lng: 2.3522 }} />)
    const namesWith = screen.getAllByRole('button').map((btn) =>
      btn.textContent?.replace(/\d+(\.\d+)? (m|km)$/, ''),
    )

    expect(namesWithout.map((t) => t?.replace(/\d+(\.\d+)? (m|km)$/, ''))).toEqual(namesWith)
  })

  it('calls onHover with the restaurant id when its card is hovered', () => {
    const onHover = vi.fn()
    render(<RestaurantList items={[r({ id: 'a', name: 'Place A' })]} onHover={onHover} />)

    fireEvent.mouseEnter(screen.getByRole('button', { name: /Place A/ }))

    expect(onHover).toHaveBeenCalledWith('a')
  })

  it('calls onHover(null) when the mouse leaves the card', () => {
    const onHover = vi.fn()
    render(<RestaurantList items={[r({ id: 'a', name: 'Place A' })]} onHover={onHover} />)

    const card = screen.getByRole('button', { name: /Place A/ })
    fireEvent.mouseEnter(card)
    fireEvent.mouseLeave(card)

    expect(onHover).toHaveBeenLastCalledWith(null)
  })

  it('calls onHover with the restaurant id when its card is focused, and onHover(null) when it is blurred', () => {
    const onHover = vi.fn()
    render(<RestaurantList items={[r({ id: 'a', name: 'Place A' })]} onHover={onHover} />)

    const card = screen.getByRole('button', { name: /Place A/ })
    fireEvent.focus(card)
    expect(onHover).toHaveBeenLastCalledWith('a')

    fireEvent.blur(card)
    expect(onHover).toHaveBeenLastCalledWith(null)
  })

  it('calls both onSelect and onHover(null) when a card is clicked', () => {
    const onSelect = vi.fn()
    const onHover = vi.fn()
    render(<RestaurantList items={[r({ id: 'a', name: 'Place A' })]} onSelect={onSelect} onHover={onHover} />)

    fireEvent.click(screen.getByRole('button', { name: /Place A/ }))

    expect(onSelect).toHaveBeenCalledWith('a')
    expect(onHover).toHaveBeenCalledWith(null)
  })

  it('does not throw when onHover is omitted and a card is hovered, focused, blurred, or clicked', () => {
    render(<RestaurantList items={[r({ id: 'a', name: 'Place A' })]} />)

    const card = screen.getByRole('button', { name: /Place A/ })
    expect(() => {
      fireEvent.mouseEnter(card)
      fireEvent.mouseLeave(card)
      fireEvent.focus(card)
      fireEvent.blur(card)
      fireEvent.click(card)
    }).not.toThrow()
  })
})
