import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, it, expect, vi } from 'vitest'
import { freshDB } from '../../test/idb'
import { setGeocodeProvider } from '../../capture/geocode'
import { AddPlace } from './AddPlace'
import { allRestaurants, createRestaurant } from '../../data/restaurants'
import { setBackendPresence } from '../../sync/backendStatus'
import { mockI18n } from '../../test/setup'

const FULL_URL = 'https://www.google.com/maps/place/Chez+Marcel/@48.8566,2.3522,15z'
const SHORT_URL = 'https://maps.app.goo.gl/abc'

beforeEach(async () => {
  await freshDB()
  setBackendPresence({ status: 'configured', pocketbaseUrl: 'https://pb.example.test' })
  setGeocodeProvider({ search: async () => [], reverse: async () => '1 Rue de Rivoli, Paris' })
})

async function pasteAndSubmit(text: string): Promise<void> {
  const user = userEvent.setup()
  await user.type(screen.getByLabelText(/paste a google maps link/i), text)
  await user.click(screen.getByRole('button', { name: 'Add' }))
}

describe('AddPlace', () => {
  it('renders the submit button through the shared Button primary variant', () => {
    render(<AddPlace onClose={vi.fn()} onOpenExisting={() => {}} />)

    expect(screen.getByRole('button', { name: 'Add' })).toHaveClass('py-2.5', 'bg-brand')
  })

  it('creates a place from a pasted full URL and closes', async () => {
    const onClose = vi.fn()
    render(<AddPlace onClose={onClose} onOpenExisting={() => {}} />)
    const user = userEvent.setup()

    await user.type(screen.getByLabelText(/paste a google maps link/i), FULL_URL)
    await user.click(screen.getByRole('button', { name: 'Add' }))

    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect((await allRestaurants()).map((r) => r.name)).toContain('Chez Marcel')
  })

  it('persists a chosen (custom) cuisine on the created place', async () => {
    render(<AddPlace onClose={vi.fn()} onOpenExisting={() => {}} />)
    const user = userEvent.setup()

    await user.type(screen.getByLabelText(/paste a google maps link/i), FULL_URL)
    await user.type(screen.getByLabelText(/cuisine/i), 'Ramen') // non-curated, free-typed
    await user.click(screen.getByRole('button', { name: 'Add' }))

    await waitFor(async () => {
      const r = (await allRestaurants()).find((x) => x.name === 'Chez Marcel')
      expect(r?.cuisine).toBe('Ramen')
    })
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

  describe('with no backend in this deployment (R5)', () => {
    beforeEach(() => {
      setBackendPresence({ status: 'absent' })
    })

    it('refuses a pasted short link on its own surface, not the shared red error paragraph', async () => {
      const onClose = vi.fn()
      const { container } = render(<AddPlace onClose={onClose} onOpenExisting={() => {}} />)

      await pasteAndSubmit(SHORT_URL)

      const note = await screen.findByRole('note')
      expect(note).toHaveTextContent(/can only be opened by a server/i)
      expect(container.querySelector('.text-red-600')).toBeNull()
      expect(onClose).not.toHaveBeenCalled()
      expect(await allRestaurants()).toEqual([])
    })

    it('names both paths that still work: searching by name and a full Maps URL', async () => {
      render(<AddPlace onClose={vi.fn()} onOpenExisting={() => {}} />)

      await pasteAndSubmit(SHORT_URL)

      const note = await screen.findByRole('note')
      expect(note).toHaveTextContent(/type the place name/i)
      expect(note).toHaveTextContent(/full google maps link/i)
    })

    it('renders the refusal in French', async () => {
      await mockI18n.changeLanguage('fr')
      render(<AddPlace onClose={vi.fn()} onOpenExisting={() => {}} />)
      const user = userEvent.setup()

      await user.type(screen.getByLabelText(/collez un lien google maps/i), SHORT_URL)
      await user.click(screen.getByRole('button', { name: 'Ajouter' }))

      const note = await screen.findByRole('note')
      expect(note).toHaveTextContent(/ne peuvent être ouverts que par un serveur/i)
      expect(note).toHaveTextContent(/nom du lieu/i)
      expect(note).toHaveTextContent(/lien Google Maps complet/i)
    })

    it('still creates a place from a full Maps URL', async () => {
      const onClose = vi.fn()
      render(<AddPlace onClose={onClose} onOpenExisting={() => {}} />)

      await pasteAndSubmit(FULL_URL)

      await waitFor(() => expect(onClose).toHaveBeenCalled())
      expect((await allRestaurants()).map((r) => r.name)).toContain('Chez Marcel')
      expect(screen.queryByRole('note')).toBeNull()
    })
  })

  describe('search failures', () => {
    it('tells an empty result set apart from a failed search, and offers the full-URL fallback', async () => {
      setGeocodeProvider({ search: async () => [], reverse: async () => undefined })
      const { unmount } = render(<AddPlace onClose={vi.fn()} onOpenExisting={() => {}} />)
      await pasteAndSubmit('Chez Marcel Paris')
      const empty = await screen.findByText(/no matching places found/i)
      expect(empty).toHaveClass('text-red-600')
      unmount()

      setGeocodeProvider({
        search: async () => {
          throw new Error('provider down')
        },
        reverse: async () => undefined,
      })
      render(<AddPlace onClose={vi.fn()} onOpenExisting={() => {}} />)
      await pasteAndSubmit('Chez Marcel Paris')
      const failed = await screen.findByText(/search failed/i)
      expect(failed).toHaveTextContent(/full google maps link/i)
      expect(screen.queryByText(/no matching places found/i)).toBeNull()
    })
  })
})
