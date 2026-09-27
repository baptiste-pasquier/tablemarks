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
import type { GeoCandidate } from '../../capture/geocode'

// Partial mock: the real module apart from the network call, so `pb` and the error class the
// component's branch tests with `instanceof` are the genuine ones.
vi.mock('../../sync/pocketbase', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../sync/pocketbase')>()
  return { ...actual, resolveShortLink: vi.fn() }
})

// Partial mock: real by default (`vi.fn(actual.createRestaurant)` delegates), so only the one test
// that holds the commit on a deferred promise needs to override it for a single call.
vi.mock('../../data/restaurants', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../data/restaurants')>()
  return { ...actual, createRestaurant: vi.fn(actual.createRestaurant) }
})

const FULL_URL = 'https://www.google.com/maps/place/Chez+Marcel/@48.8566,2.3522,15z'
const SHORT_URL = 'https://maps.app.goo.gl/abc'

const OSM = {
  type: 'node' as const,
  id: 1,
  checkedAt: '2026-09-26T10:00:00.000Z',
  city: 'Paris',
  postcode: '75004',
  street: '34 Rue des Rosiers',
}

const FALAFEL: GeoCandidate = {
  name: 'L’As du Fallafel',
  lat: 48.857,
  lng: 2.359,
  osmClass: 'amenity=restaurant',
  cuisineTag: 'falafel;israeli',
  osm: OSM,
}

const LEATHER: GeoCandidate = {
  name: 'Chez Aline',
  lat: 48.86,
  lng: 2.38,
  osmClass: 'shop=leather',
  osm: { ...OSM, id: 2, postcode: '75011' },
}

function provide({ search = [], near = [] }: { search?: GeoCandidate[]; near?: GeoCandidate[] }) {
  setGeocodeProvider({
    search: async (_q, options) => (options?.near ? near : search),
    reverse: async () => '1 Rue de Rivoli, Paris',
    lookup: async () => null,
  })
}

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
  await user.click(screen.getByRole('button', { name: 'Search' }))
}

async function pasteAndAdd(text: string): Promise<void> {
  await pasteAndSubmit(text)
  await userEvent.setup().click(await screen.findByRole('button', { name: 'Add' }))
}

describe('AddPlace', () => {
  it('renders the submit button through the shared Button primary variant', () => {
    render(<AddPlace onClose={vi.fn()} onOpenExisting={() => {}} />)

    expect(screen.getByRole('button', { name: 'Search' })).toHaveClass('py-2.5', 'bg-brand')
  })

  it('creates a place from a pasted full URL and closes', async () => {
    const onClose = vi.fn()
    render(<AddPlace onClose={onClose} onOpenExisting={() => {}} />)

    await pasteAndAdd(FULL_URL)

    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect((await allRestaurants()).map((r) => r.name)).toContain('Chez Marcel')
  })

  it('submits on Enter from the single-line link field', async () => {
    render(<AddPlace onClose={vi.fn()} onOpenExisting={() => {}} />)
    const user = userEvent.setup()

    await user.type(screen.getByLabelText(/paste a google maps link/i), `${FULL_URL}{Enter}`)
    await screen.findByRole('button', { name: 'Add' })
    expect(await allRestaurants()).toEqual([])
    await user.type(screen.getByLabelText(/paste a google maps link/i), '{Enter}')

    await waitFor(async () =>
      expect((await allRestaurants()).map((r) => r.name)).toContain('Chez Marcel'),
    )
  })

  it('persists a chosen (custom) cuisine on the created place', async () => {
    render(<AddPlace onClose={vi.fn()} onOpenExisting={() => {}} />)
    const user = userEvent.setup()

    await pasteAndSubmit(FULL_URL)
    await user.click(await screen.findByRole('button', { name: 'Category: Uncategorized' }))
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

    await pasteAndSubmit(FULL_URL)
    await user.click(await screen.findByRole('button', { name: 'Category: Uncategorized' }))
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

    await pasteAndSubmit(FULL_URL)

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
      await user.click(screen.getByRole('button', { name: 'Rechercher' }))

      const note = await screen.findByRole('note')
      expect(note).toHaveTextContent(/ne peuvent être ouverts que par un serveur/i)
      expect(note).toHaveTextContent(/nom du lieu/i)
      expect(note).toHaveTextContent(/lien Google Maps complet/i)
    })

    it('still creates a place from a full Maps URL', async () => {
      const onClose = vi.fn()
      render(<AddPlace onClose={onClose} onOpenExisting={() => {}} />)

      await pasteAndAdd(FULL_URL)

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

  describe('search, select, category, add', () => {
    it('shows no category picker before a place is identified', () => {
      render(<AddPlace onClose={vi.fn()} onOpenExisting={() => {}} />)
      expect(screen.queryByRole('button', { name: /^Category:/ })).toBeNull()
      expect(screen.getByRole('button', { name: 'Search' })).toBeDisabled()
    })

    it('selects a result, pre-fills its category, and adds it with its snapshot', async () => {
      provide({ search: [FALAFEL] })
      const onClose = vi.fn()
      render(<AddPlace onClose={onClose} onOpenExisting={() => {}} />)
      const user = userEvent.setup()

      await pasteAndSubmit('As du Fallafel')
      await user.click(await screen.findByRole('button', { name: /^L’As du Fallafel/ }))

      expect(screen.getByRole('button', { name: /^L’As du Fallafel/ })).toHaveAttribute(
        'aria-pressed',
        'true',
      )
      expect(screen.getByRole('button', { name: 'Category: Lebanese' })).toBeInTheDocument()
      expect(screen.getByText('Suggested by OpenStreetMap')).toBeInTheDocument()
      expect(await allRestaurants()).toEqual([])

      await user.click(screen.getByRole('button', { name: 'Add' }))
      await waitFor(() => expect(onClose).toHaveBeenCalled())
      expect((await allRestaurants())[0]).toMatchObject({ cuisine: 'lebanese', osm: OSM })
    })

    it('keeps a category the user chose when another result is selected', async () => {
      provide({
        search: [
          FALAFEL,
          { ...FALAFEL, name: 'Le Fallafel 17e', osm: { ...OSM, id: 3 }, cuisineTag: 'kebab' },
        ],
      })
      render(<AddPlace onClose={vi.fn()} onOpenExisting={() => {}} />)
      const user = userEvent.setup()

      await pasteAndSubmit('Fallafel')
      await user.click(await screen.findByRole('button', { name: /^L’As du Fallafel/ }))
      await user.click(screen.getByRole('button', { name: 'Category: Lebanese' }))
      await user.click(screen.getByRole('button', { name: 'Other…' }))
      await user.type(screen.getByLabelText('Other category'), 'Ramen{Enter}')
      await user.click(screen.getByRole('button', { name: /^Le Fallafel 17e/ }))

      expect(screen.getByRole('button', { name: 'Category: Ramen' })).toBeInTheDocument()
      expect(screen.queryByText('Suggested by OpenStreetMap')).toBeNull()
    })

    it('goes back to Search when the text changes after a selection', async () => {
      provide({ search: [FALAFEL] })
      render(<AddPlace onClose={vi.fn()} onOpenExisting={() => {}} />)
      const user = userEvent.setup()

      await pasteAndSubmit('As du Fallafel')
      await user.click(await screen.findByRole('button', { name: /^L’As du Fallafel/ }))
      await user.type(screen.getByLabelText(/paste a google maps link/i), 'x')

      expect(screen.getByRole('button', { name: 'Search' })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Add' })).toBeNull()
      expect(screen.queryByRole('button', { name: /^L’As du Fallafel/ })).toBeNull()
    })

    it('folds results that are not eateries, and says when there is no eatery at all', async () => {
      provide({ search: [LEATHER] })
      render(<AddPlace onClose={vi.fn()} onOpenExisting={() => {}} />)
      const user = userEvent.setup()

      await pasteAndSubmit('Chez Aline')
      expect(await screen.findByText(/no restaurant, café or bar/i)).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /Chez Aline/ })).toBeNull()

      await user.click(screen.getByRole('button', { name: '1 other result' }))
      expect(screen.getByRole('button', { name: /Chez Aline/ })).toBeInTheDocument()
    })

    it('previews a pasted link with its OSM match, and drops it on "Not this one"', async () => {
      provide({ near: [{ ...FALAFEL, name: 'Chez Marcel', lat: 48.8566, lng: 2.3522 }] })
      render(<AddPlace onClose={vi.fn()} onOpenExisting={() => {}} />)
      const user = userEvent.setup()

      await pasteAndSubmit(FULL_URL)
      expect(await screen.findByText(/Found on OpenStreetMap/)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Category: Lebanese' })).toBeInTheDocument()
      expect(await allRestaurants()).toEqual([])

      await user.click(screen.getByRole('button', { name: 'Not this one' }))
      expect(screen.getByText('No OpenStreetMap data')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Category: Uncategorized' })).toBeInTheDocument()

      await user.click(screen.getByRole('button', { name: 'Add' }))
      await waitFor(async () => expect(await allRestaurants()).toHaveLength(1))
      expect((await allRestaurants())[0].osm).toBeUndefined()
    })

    it('reports a duplicate found at commit for a picked result', async () => {
      await createRestaurant({ name: 'Existing', lat: FALAFEL.lat, lng: FALAFEL.lng })
      provide({ search: [FALAFEL] })
      render(<AddPlace onClose={vi.fn()} onOpenExisting={() => {}} />)
      const user = userEvent.setup()

      await pasteAndSubmit('As du Fallafel')
      await user.click(await screen.findByRole('button', { name: /^L’As du Fallafel/ }))
      await user.click(screen.getByRole('button', { name: 'Add' }))

      expect(await screen.findByText(/already saved/i)).toBeInTheDocument()
      expect(await allRestaurants()).toHaveLength(1)
    })

    it('keeps the category picker hidden while results are listed but none is selected', async () => {
      provide({ search: [FALAFEL] })
      render(<AddPlace onClose={vi.fn()} onOpenExisting={() => {}} />)

      await pasteAndSubmit('As du Fallafel')
      await screen.findByRole('button', { name: /^L’As du Fallafel/ })

      expect(screen.queryByRole('button', { name: /^Category:/ })).toBeNull()
    })

    it('re-suggests the OSM category once the input changes and a new place is selected', async () => {
      provide({ search: [FALAFEL] })
      render(<AddPlace onClose={vi.fn()} onOpenExisting={() => {}} />)
      const user = userEvent.setup()

      await pasteAndSubmit('As du Fallafel')
      await user.click(await screen.findByRole('button', { name: /^L’As du Fallafel/ }))
      await user.click(screen.getByRole('button', { name: 'Category: Lebanese' }))
      await user.click(screen.getByRole('button', { name: 'Other…' }))
      await user.type(screen.getByLabelText('Other category'), 'Ramen{Enter}')
      expect(screen.getByRole('button', { name: 'Category: Ramen' })).toBeInTheDocument()

      await user.clear(screen.getByLabelText(/paste a google maps link/i))
      await pasteAndSubmit('As du Fallafel')
      await user.click(await screen.findByRole('button', { name: /^L’As du Fallafel/ }))

      expect(screen.getByRole('button', { name: 'Category: Lebanese' })).toBeInTheDocument()
      expect(screen.getByText('Suggested by OpenStreetMap')).toBeInTheDocument()
    })

    it('drops a stale search result once the input has changed', async () => {
      let release: (found: GeoCandidate[]) => void = () => {}
      const pending = new Promise<GeoCandidate[]>((resolve) => {
        release = resolve
      })
      setGeocodeProvider({
        search: async () => pending,
        reverse: async () => '1 Rue de Rivoli, Paris',
        lookup: async () => null,
      })
      render(<AddPlace onClose={vi.fn()} onOpenExisting={() => {}} />)
      const user = userEvent.setup()

      await user.type(screen.getByLabelText(/paste a google maps link/i), 'Fallafel')
      await user.click(screen.getByRole('button', { name: 'Search' }))
      await user.type(screen.getByLabelText(/paste a google maps link/i), 'x')

      release([FALAFEL])
      await new Promise((resolve) => setTimeout(resolve, 50))

      expect(screen.queryByRole('button', { name: /^L’As du Fallafel/ })).toBeNull()
      expect(screen.getByRole('button', { name: 'Search' })).toBeInTheDocument()
    })

    it('shows the OSM-unavailable variant when the OSM match lookup fails', async () => {
      setGeocodeProvider({
        search: async (_q, options) => {
          if (options?.near) throw new Error('nominatim down')
          return []
        },
        reverse: async () => '1 Rue de Rivoli, Paris',
        lookup: async () => null,
      })
      render(<AddPlace onClose={vi.fn()} onOpenExisting={() => {}} />)

      await pasteAndSubmit(FULL_URL)

      expect(await screen.findByText(/OpenStreetMap unavailable/)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Category: Uncategorized' })).toBeInTheDocument()
    })

    it('ignores a result click while a place is being added', async () => {
      const OTHER: GeoCandidate = { ...FALAFEL, name: 'Le Fallafel 17e', osm: { ...OSM, id: 3 } }
      provide({ search: [FALAFEL, OTHER] })
      let release: () => void = () => {}
      const gate = new Promise<void>((resolve) => {
        release = resolve
      })
      vi.mocked(createRestaurant).mockImplementationOnce(async (input) => {
        await gate
        const { createRestaurant: real } =
          await vi.importActual<typeof import('../../data/restaurants')>('../../data/restaurants')
        return real(input)
      })
      render(<AddPlace onClose={vi.fn()} onOpenExisting={() => {}} />)
      const user = userEvent.setup()

      await pasteAndSubmit('Fallafel')
      await user.click(await screen.findByRole('button', { name: /^L’As du Fallafel/ }))
      await user.click(screen.getByRole('button', { name: 'Add' }))

      // Busy: a click on the other card must be a no-op — the first place is still the one saved.
      await user.click(screen.getByRole('button', { name: /^Le Fallafel 17e/ }))
      expect(screen.getByRole('button', { name: /^L’As du Fallafel/ })).toHaveAttribute(
        'aria-pressed',
        'true',
      )
      expect(screen.getByRole('button', { name: /^Le Fallafel 17e/ })).toHaveAttribute(
        'aria-pressed',
        'false',
      )

      release()
      await waitFor(async () =>
        expect((await allRestaurants()).map((r) => r.name)).toEqual(['L’As du Fallafel']),
      )
    })

    it('previews a provisional record when the short link resolver is unreachable', async () => {
      vi.mocked(resolveShortLink).mockRejectedValue(new Error('network down'))
      render(<AddPlace onClose={vi.fn()} onOpenExisting={() => {}} />)

      await pasteAndSubmit(SHORT_URL)

      expect(await screen.findByText('Position resolved later')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Category: Uncategorized' })).toBeInTheDocument()
    })

    it('keeps the text fixed while a place is being added, so onAdded still fires (review #1)', async () => {
      provide({ search: [FALAFEL] })
      let release: () => void = () => {}
      const gate = new Promise<void>((resolve) => {
        release = resolve
      })
      vi.mocked(createRestaurant).mockImplementationOnce(async (input) => {
        await gate
        const { createRestaurant: real } =
          await vi.importActual<typeof import('../../data/restaurants')>('../../data/restaurants')
        return real(input)
      })
      const onClose = vi.fn()
      render(<AddPlace onClose={onClose} onOpenExisting={() => {}} />)
      const user = userEvent.setup()

      await pasteAndSubmit('Fallafel')
      await user.click(await screen.findByRole('button', { name: /^L’As du Fallafel/ }))
      await user.click(screen.getByRole('button', { name: 'Add' }))

      const input = screen.getByLabelText(/paste a google maps link/i)
      expect(input).toHaveAttribute('readonly')
      await user.type(input, 'x')
      expect(input).toHaveValue('Fallafel')

      release()
      await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
      expect((await allRestaurants()).map((r) => r.name)).toEqual(['L’As du Fallafel'])
    })

    it('ignores "Not this one" while a place is being added, so the saved record keeps its match (review #3)', async () => {
      provide({ near: [{ ...FALAFEL, name: 'Chez Marcel', lat: 48.8566, lng: 2.3522 }] })
      let release: () => void = () => {}
      const gate = new Promise<void>((resolve) => {
        release = resolve
      })
      vi.mocked(createRestaurant).mockImplementationOnce(async (input) => {
        await gate
        const { createRestaurant: real } =
          await vi.importActual<typeof import('../../data/restaurants')>('../../data/restaurants')
        return real(input)
      })
      render(<AddPlace onClose={vi.fn()} onOpenExisting={() => {}} />)
      const user = userEvent.setup()

      await pasteAndSubmit(FULL_URL)
      await screen.findByText(/Found on OpenStreetMap/)
      await user.click(screen.getByRole('button', { name: 'Add' }))

      const rejectButton = screen.getByRole('button', { name: 'Not this one' })
      expect(rejectButton).toBeDisabled()
      await user.click(rejectButton)
      expect(screen.getByText(/Found on OpenStreetMap/)).toBeInTheDocument()

      release()
      await waitFor(async () => expect(await allRestaurants()).toHaveLength(1))
      expect((await allRestaurants())[0].osm).toEqual(OSM)
    })
  })
})
