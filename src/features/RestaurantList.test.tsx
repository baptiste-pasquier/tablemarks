import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { RestaurantList } from './RestaurantList'
import { VERDICTS, translateVerdict, type Restaurant } from '../types/models'

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

  it("renders each verdict's own assigned icon as a separate aria-hidden node from the label text", () => {
    render(
      <RestaurantList
        items={VERDICTS.map((v, i) =>
          r({ id: `v${i}`, name: `Place ${i}`, visitCount: 1, latestVerdict: v }),
        )}
      />,
    )

    // Asserts the invariant rather than the glyph: four verdicts, four distinct drawn icons, each
    // hidden from assistive tech and none of them part of the label's text.
    const drawn = new Set<string>()
    for (const v of VERDICTS) {
      const label = screen.getByText(translateVerdict(v))
      const badge = label.parentElement
      expect(badge).not.toBeNull()
      const icon = (badge as HTMLElement).querySelector('[aria-hidden="true"]')
      expect(icon).not.toBeNull()
      expect(icon?.textContent).toBe('')
      drawn.add((icon as HTMLElement).innerHTML)
    }
    expect(drawn.size).toBe(VERDICTS.length)
  })

  it('leads each card with a cuisine avatar, puts the status beside the name, and the tinted cuisine name with the visit count on the line below', () => {
    render(
      <RestaurantList
        items={[
          r({
            id: 'a',
            name: 'Baan Thaï',
            cuisine: 'Thai',
            visitCount: 3,
            latestVerdict: 'go_back',
          }),
        ]}
      />,
    )

    const card = screen.getByRole('button', { name: /Baan Thaï/ })
    expect(card).toHaveClass('bg-white', 'rounded-card', 'shadow-card')
    expect(card.getAttribute('style')).toBeNull()

    // Thai is hue 281 on the wheel: the avatar takes the deeper avatar tint, decorative only.
    const avatar = within(card).getByText('🍜')
    expect(avatar).toHaveAttribute('aria-hidden', 'true')
    expect(avatar.getAttribute('style')).toContain('oklch(0.93 0.07 281)')

    // The name shares its line with the status badge alone ...
    const name = screen.getByText('Baan Thaï')
    const statusBadge = screen.getByText('Go back').parentElement as HTMLElement
    expect(statusBadge.parentElement).toBe(name.parentElement)

    // ... and the cuisine, set in its own text color, sits below with the visit count.
    const cuisine = screen.getByText('Thai')
    expect(cuisine.getAttribute('style')).toContain('oklch(0.4 0.13 281)')
    expect(cuisine.parentElement).toBe(screen.getByText('3 visits').parentElement)
    expect(cuisine.parentElement).not.toBe(name.parentElement)
  })

  it('puts the distance at the end of the cuisine line, behind a decorative pin icon', () => {
    render(
      <RestaurantList
        items={[r({ id: 'a', name: 'Place A', cuisine: 'French', lat: 48.8566, lng: 2.3522 })]}
        currentPosition={{ lat: 48.8566, lng: 2.3622 }}
      />,
    )

    const distance = screen.getByText('732 m')
    expect(distance.parentElement).toBe(screen.getByText('French').parentElement)
    const pin = distance.querySelector('svg')
    expect(pin).toHaveAttribute('aria-hidden', 'true')
  })

  it('shows a to-try restaurant with no visit count', () => {
    render(<RestaurantList items={[r({ id: 'a', name: 'New place', cuisine: 'French' })]} />)
    expect(screen.getByText('To try')).toBeInTheDocument()
    expect(screen.queryByText(/visits?$/)).not.toBeInTheDocument()
  })

  it('shows a pending/provisional restaurant with no visit count, regardless of its stored visit count', () => {
    render(
      <RestaurantList
        items={[
          r({ id: 'a', name: 'Pending place', pending: true, lat: null, lng: null, visitCount: 5 }),
        ]}
      />,
    )
    expect(screen.getByText('Resolving…')).toBeInTheDocument()
    expect(screen.queryByText(/visits?$/)).not.toBeInTheDocument()
  })

  it('renders the uncategorized avatar and label for a restaurant with no cuisine, achromatic rather than blank', () => {
    render(<RestaurantList items={[r({ id: 'a', name: 'No cuisine place' })]} />)

    const card = screen.getByRole('button', { name: /No cuisine place/ })
    const avatar = within(card).getByText('🍽️')
    expect(avatar).toHaveAttribute('aria-hidden', 'true')
    expect(avatar.getAttribute('style')).toContain('oklch(0.93 0 0)')
    expect(screen.getByText('Uncategorized').getAttribute('style')).toContain('oklch(0.4 0 0)')
  })

  it('shows "Uncategorized" (not a blank label) for a whitespace-only cuisine', () => {
    render(
      <RestaurantList items={[r({ id: 'a', name: 'Whitespace cuisine place', cuisine: '   ' })]} />,
    )
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
    const namesWith = screen
      .getAllByRole('button')
      .map((btn) => btn.textContent?.replace(/\d+(\.\d+)? (m|km)$/, ''))

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
    render(
      <RestaurantList
        items={[r({ id: 'a', name: 'Place A' })]}
        onSelect={onSelect}
        onHover={onHover}
      />,
    )

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
