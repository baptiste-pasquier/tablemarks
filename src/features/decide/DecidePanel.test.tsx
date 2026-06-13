import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, it, expect, vi } from 'vitest'
import { freshDB } from '../../test/idb'
import { DecidePanel } from './DecidePanel'
import { createRestaurant } from '../../data/restaurants'
import { createVisit } from '../../data/visits'
import type { Anchor } from './candidates'

const ANCHOR: Anchor = { lat: 48.8566, lng: 2.3522 }

beforeEach(freshDB)

describe('DecidePanel', () => {
  it('lists to-try and Go-back candidates with verdict + distance, excludes lower verdicts', async () => {
    await createRestaurant({ name: 'New Spot', lat: 48.8566, lng: 2.3522 })
    const fav = await createRestaurant({ name: 'Old Favorite', lat: 48.8566, lng: 2.3522 })
    await createVisit({ restaurantId: fav.id, verdict: 'go_back' })
    const meh = await createRestaurant({ name: 'Meh Place', lat: 48.8566, lng: 2.3522 })
    await createVisit({ restaurantId: meh.id, verdict: 'once_was_enough' })

    render(<DecidePanel anchor={ANCHOR} onClose={vi.fn()} onOpenRestaurant={vi.fn()} />)

    expect(await screen.findByText('New Spot')).toBeInTheDocument()
    expect(screen.getByText('Old Favorite')).toBeInTheDocument()
    expect(screen.queryByText('Meh Place')).not.toBeInTheDocument()
    expect(screen.getByText(/Go back · 1 visit/)).toBeInTheDocument()
  })

  it('picks a candidate when "Pick for me" is tapped', async () => {
    await createRestaurant({ name: 'A', lat: 48.8566, lng: 2.3522 })
    await createRestaurant({ name: 'B', lat: 48.8566, lng: 2.3522 })
    const { container } = render(
      <DecidePanel anchor={ANCHOR} onClose={vi.fn()} onOpenRestaurant={vi.fn()} />,
    )
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: /pick for me/i }))

    expect(container.querySelector('.bg-brand-soft')).not.toBeNull()
  })

  it('shows an empty state and widens the radius', async () => {
    // ~2 km north of the anchor: outside the 1 km default, inside 5 km
    await createRestaurant({ name: 'Far Spot', lat: 48.875, lng: 2.3522 })
    render(<DecidePanel anchor={ANCHOR} onClose={vi.fn()} onOpenRestaurant={vi.fn()} />)
    const user = userEvent.setup()

    expect(await screen.findByText(/nothing to try/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /widen to 5 km/i }))
    expect(await screen.findByText('Far Spot')).toBeInTheDocument()
  })

  it('opens a candidate detail on tap', async () => {
    await createRestaurant({ name: 'Pick Me', lat: 48.8566, lng: 2.3522 })
    const onOpen = vi.fn()
    render(<DecidePanel anchor={ANCHOR} onClose={vi.fn()} onOpenRestaurant={onOpen} />)
    const user = userEvent.setup()

    await user.click(await screen.findByText('Pick Me'))
    expect(onOpen).toHaveBeenCalledTimes(1)
  })
})
