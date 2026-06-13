import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, it, expect, vi } from 'vitest'
import { freshDB } from '../../test/idb'
import { setGeocodeProvider } from '../../capture/geocode'
import { AddPlace } from './AddPlace'
import { allRestaurants, createRestaurant } from '../../data/restaurants'

const FULL_URL = 'https://www.google.com/maps/place/Chez+Marcel/@48.8566,2.3522,15z'

beforeEach(async () => {
  await freshDB()
  setGeocodeProvider({ search: async () => [], reverse: async () => '1 Rue de Rivoli, Paris' })
})

describe('AddPlace', () => {
  it('creates a place from a pasted full URL and closes', async () => {
    const onClose = vi.fn()
    render(<AddPlace onClose={onClose} onOpenExisting={() => {}} />)
    const user = userEvent.setup()

    await user.type(screen.getByLabelText(/paste a google maps link/i), FULL_URL)
    await user.click(screen.getByRole('button', { name: 'Add' }))

    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect((await allRestaurants()).map((r) => r.name)).toContain('Chez Marcel')
  })

  it('offers the existing place on a near-match duplicate', async () => {
    await createRestaurant({ name: 'Existing', lat: 48.8566, lng: 2.3522 })
    render(<AddPlace onClose={vi.fn()} onOpenExisting={() => {}} />)
    const user = userEvent.setup()

    await user.type(screen.getByLabelText(/paste a google maps link/i), FULL_URL)
    await user.click(screen.getByRole('button', { name: 'Add' }))

    expect(await screen.findByText(/already saved/i)).toBeInTheDocument()
    expect((await allRestaurants()).length).toBe(1)
  })
})
