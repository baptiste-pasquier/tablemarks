import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, it, expect, vi } from 'vitest'
import { freshDB } from '../../test/idb'
import { setGeocodeProvider } from '../../capture/geocode'
import { AddPlace } from './AddPlace'
import { allRestaurants, createRestaurant } from '../../data/restaurants'
import { setBackendPresence } from '../../sync/backendStatus'
import { mockI18n } from '../../test/setup'
import { UnresolvableShortLink, resolveShortLink } from '../../sync/pocketbase'

// Partial mock: the real module apart from the network call, so `pb` and the error class the
// component's branch tests with `instanceof` are the genuine ones.
vi.mock('../../sync/pocketbase', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../sync/pocketbase')>()
  return { ...actual, resolveShortLink: vi.fn() }
})

const FULL_URL = 'https://www.google.com/maps/place/Chez+Marcel/@48.8566,2.3522,15z'
const SHORT_URL = 'https://maps.app.goo.gl/abc'

beforeEach(async () => {
  await freshDB()
  vi.mocked(resolveShortLink).mockReset()
  setBackendPresence({ status: 'configured', pocketbaseUrl: 'https://pb.example.test' })
  setGeocodeProvider({
    search: async () => [],
    reverse: async () => '1 Rue de Rivoli, Paris',
    lookup: async () => null,
  })
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

  it('submits on Enter from the single-line link field', async () => {
    render(<AddPlace onClose={vi.fn()} onOpenExisting={() => {}} />)
    const user = userEvent.setup()

    await user.type(screen.getByLabelText(/paste a google maps link/i), `${FULL_URL}{Enter}`)

    await waitFor(async () =>
      expect((await allRestaurants()).map((r) => r.name)).toContain('Chez Marcel'),
    )
  })

  it('persists a chosen (custom) cuisine on the created place', async () => {
    render(<AddPlace onClose={vi.fn()} onOpenExisting={() => {}} />)
    const user = userEvent.setup()

    await user.type(screen.getByLabelText(/paste a google maps link/i), FULL_URL)
    await user.click(screen.getByRole('button', { name: 'Category: Uncategorized' }))
    await user.click(screen.getByRole('button', { name: 'Other…' }))
    await user.type(screen.getByLabelText('Other category'), 'Ramen{Enter}') // non-curated
    await user.click(screen.getByRole('button', { name: 'Add' }))

    await waitFor(async () => {
      const r = (await allRestaurants()).find((x) => x.name === 'Chez Marcel')
      expect(r?.cuisine).toBe('Ramen')
    })
  })

  it('keeps a typed "Other…" category when Add is clicked without OK', async () => {
    render(<AddPlace onClose={vi.fn()} onOpenExisting={() => {}} />)
    const user = userEvent.setup()

    await user.type(screen.getByLabelText(/paste a google maps link/i), FULL_URL)
    await user.click(screen.getByRole('button', { name: 'Category: Uncategorized' }))
    await user.click(screen.getByRole('button', { name: 'Other…' }))
    await user.type(screen.getByLabelText('Other category'), 'Ramen')
    await user.click(screen.getByRole('button', { name: 'Add' }))

    await waitFor(async () => {
      const r = (await allRestaurants()).find((x) => x.name === 'Chez Marcel')
      expect(r?.cuisine).toBe('Ramen')
    })
  })

  it('does not submit on Enter while an input method is still composing', async () => {
    render(<AddPlace onClose={vi.fn()} onOpenExisting={() => {}} />)
    const input = screen.getByLabelText(/paste a google maps link/i)

    fireEvent.change(input, { target: { value: FULL_URL } })
    fireEvent.keyDown(input, { key: 'Enter', isComposing: true })

    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(await allRestaurants()).toHaveLength(0)
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

    it('says this deployment has no server, permanently', async () => {
      render(<AddPlace onClose={vi.fn()} onOpenExisting={() => {}} />)

      await pasteAndSubmit(SHORT_URL)

      const note = await screen.findByRole('note')
      expect(note).toHaveTextContent(/runs without one/i)
      expect(note).not.toHaveTextContent(/right now/i)
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

  describe('when the resolver refuses the link on its merits', () => {
    it('says so on the same surface, and creates nothing', async () => {
      // Reachable backend, 400 from the hook. Before this the paste became a placeholder named by
      // the raw URL, with no pin, retried forever.
      vi.mocked(resolveShortLink).mockRejectedValue(new UnresolvableShortLink(400))
      render(<AddPlace onClose={vi.fn()} onOpenExisting={() => {}} />)

      await pasteAndSubmit(SHORT_URL)

      const note = await screen.findByRole('note')
      expect(note).toHaveTextContent(/could not be opened as a place/i)
      expect(note).not.toHaveTextContent(/runs without one/i)
      expect(note).toHaveTextContent(/type the place name/i)
      expect(await allRestaurants()).toEqual([])
    })
  })

  describe('with a backend whose address could not be read', () => {
    beforeEach(() => {
      setBackendPresence({ status: 'unavailable', reason: 'config fetch failed' })
    })

    it('says the server is unreachable, not that the app has none (review #13)', async () => {
      render(<AddPlace onClose={vi.fn()} onOpenExisting={() => {}} />)

      await pasteAndSubmit(SHORT_URL)

      const note = await screen.findByRole('note')
      // The header is already showing "Server unreachable" next to this. Claiming the app "runs
      // without one" would contradict it, and would send the user away from something transient.
      expect(note).toHaveTextContent(/cannot be reached right now/i)
      expect(note).not.toHaveTextContent(/runs without one/i)
    })

    it('still names both paths that work in the meantime', async () => {
      render(<AddPlace onClose={vi.fn()} onOpenExisting={() => {}} />)

      await pasteAndSubmit(SHORT_URL)

      const note = await screen.findByRole('note')
      expect(note).toHaveTextContent(/type the place name/i)
      expect(note).toHaveTextContent(/full google maps link/i)
    })
  })

  describe('search failures', () => {
    it('tells an empty result set apart from a failed search, and offers the full-URL fallback', async () => {
      setGeocodeProvider({
        search: async () => [],
        reverse: async () => undefined,
        lookup: async () => null,
      })
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
        lookup: async () => null,
      })
      render(<AddPlace onClose={vi.fn()} onOpenExisting={() => {}} />)
      await pasteAndSubmit('Chez Marcel Paris')
      const failed = await screen.findByText(/search failed/i)
      expect(failed).toHaveTextContent(/full google maps link/i)
      expect(screen.queryByText(/no matching places found/i)).toBeNull()
    })
  })
})
