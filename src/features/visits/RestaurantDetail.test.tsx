import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, it, expect, vi } from 'vitest'
import { freshDB } from '../../test/idb'
import { RestaurantDetail } from './RestaurantDetail'
import { createRestaurant, getRestaurant } from '../../data/restaurants'
import { createVisit } from '../../data/visits'

beforeEach(freshDB)

function enabled(buttons: HTMLElement[]): HTMLElement {
  const found = buttons.find((b) => !(b as HTMLButtonElement).disabled)
  if (!found) throw new Error('no enabled button')
  return found
}

describe('RestaurantDetail', () => {
  it('shows the latest verdict label and visit count for a multi-visit place', async () => {
    const r = await createRestaurant({ name: 'Chez Marcel', lat: 1, lng: 1 })
    await createVisit({ restaurantId: r.id, date: '2024-01-01', verdict: 'go_back' })
    await createVisit({ restaurantId: r.id, date: '2026-06-01', verdict: 'once_was_enough' })

    render(<RestaurantDetail restaurantId={r.id} onClose={vi.fn()} />)

    expect(await screen.findByText('(2)')).toBeInTheDocument()
    expect(screen.getByText('Visited')).toBeInTheDocument()
    expect(screen.getByText('2026-06-01')).toBeInTheDocument()
  })

  it('flips a to-try place to visited with one-tap "I\'m here now"', async () => {
    const r = await createRestaurant({ name: 'New place', lat: 1, lng: 1 })
    render(<RestaurantDetail restaurantId={r.id} onClose={vi.fn()} />)
    const user = userEvent.setup()

    expect(await screen.findByText('To try')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /here now/i }))
    await user.click(enabled(screen.getAllByRole('button', { name: 'Go back' })))

    await waitFor(() => expect(screen.getByText('Visited')).toBeInTheDocument())
    expect(screen.getByText('(1)')).toBeInTheDocument()
  })

  it('edits and persists the cuisine', async () => {
    const r = await createRestaurant({ name: 'Chez Marcel', lat: 1, lng: 1 })
    render(<RestaurantDetail restaurantId={r.id} onClose={vi.fn()} />)
    const user = userEvent.setup()

    await user.type(await screen.findByLabelText('Cuisine'), 'French')
    await user.tab() // blur commits the edit

    await waitFor(async () => expect((await getRestaurant(r.id))?.cuisine).toBe('French'))
  })

  it('clears the cuisine, leaving the place uncategorized', async () => {
    const r = await createRestaurant({ name: 'X', lat: 1, lng: 1, cuisine: 'French' })
    render(<RestaurantDetail restaurantId={r.id} onClose={vi.fn()} />)
    const user = userEvent.setup()

    await user.clear(await screen.findByLabelText('Cuisine'))
    await user.tab()

    await waitFor(async () => expect((await getRestaurant(r.id))?.cuisine).toBeUndefined())
  })

  it('returns a place to to-try when its last visit is deleted', async () => {
    const r = await createRestaurant({ name: 'X', lat: 1, lng: 1 })
    await createVisit({ restaurantId: r.id, date: '2025-01-01', verdict: 'go_back' })
    render(<RestaurantDetail restaurantId={r.id} onClose={vi.fn()} />)
    const user = userEvent.setup()

    await user.click(await screen.findByLabelText(/delete visit on 2025-01-01/i))

    await waitFor(() => expect(screen.getByText('To try')).toBeInTheDocument())
    expect(screen.getByText(/no visits yet/i)).toBeInTheDocument()
  })
})
