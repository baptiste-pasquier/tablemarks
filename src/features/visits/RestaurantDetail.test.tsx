import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest'
import { freshDB } from '../../test/idb'
import { RestaurantDetail } from './RestaurantDetail'
import { createRestaurant, getRestaurant, mutateRestaurant } from '../../data/restaurants'
import { createVisit } from '../../data/visits'
import { instantToLocalDay } from '../../lib/dates'

beforeEach(freshDB)
afterEach(() => vi.unstubAllEnvs())

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
    // "Once was enough" appears twice: once in the header's fused status badge (the latest
    // verdict), once in the per-visit badge for that same visit's row. (The collapsed "Add a
    // past visit" section also has a disabled "Once was enough" button, always in the DOM.)
    expect(screen.getAllByText('Once was enough')).toHaveLength(3)
    expect(screen.getByText('2026-06-01')).toBeInTheDocument()
  })

  it('flips a to-try place to visited with one-tap "I\'m here now"', async () => {
    const r = await createRestaurant({ name: 'New place', lat: 1, lng: 1 })
    render(<RestaurantDetail restaurantId={r.id} onClose={vi.fn()} />)
    const user = userEvent.setup()

    expect(await screen.findByText('To try')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /here now/i }))
    await user.click(enabled(screen.getAllByRole('button', { name: 'Go back' })))

    // "Go back" now appears three times once logged: the header's fused status badge (showing
    // the latest — and only — verdict), the per-visit badge for that visit's row, and the
    // disabled "Go back" button in the collapsed "Add a past visit" section (always in the DOM).
    await waitFor(() => expect(screen.getAllByText('Go back')).toHaveLength(3))
    expect(screen.getByText('(1)')).toBeInTheDocument()
  })

  it('renders the verdict-picker buttons through the shared Button secondary variant', async () => {
    const r = await createRestaurant({ name: 'New place', lat: 1, lng: 1 })
    render(<RestaurantDetail restaurantId={r.id} onClose={vi.fn()} />)
    const user = userEvent.setup()

    expect(await screen.findByText('To try')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /here now/i }))
    const button = enabled(await screen.findAllByRole('button', { name: 'Go back' }))
    expect(button).toHaveClass('hover:bg-gray-100', 'active:bg-gray-200', 'py-1.5')
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

  it('pre-fills the notes textarea with an existing note', async () => {
    const r = await createRestaurant({ name: 'Chez Marcel', lat: 1, lng: 1, note: 'Great terrace' })
    render(<RestaurantDetail restaurantId={r.id} onClose={vi.fn()} />)

    expect(await screen.findByLabelText('Notes')).toHaveValue('Great terrace')
  })

  it('edits and persists the note on blur', async () => {
    const r = await createRestaurant({ name: 'Chez Marcel', lat: 1, lng: 1 })
    render(<RestaurantDetail restaurantId={r.id} onClose={vi.fn()} />)
    const user = userEvent.setup()

    await user.type(await screen.findByLabelText('Notes'), 'Ask for the corner table')
    await user.tab() // blur commits the edit

    await waitFor(async () =>
      expect((await getRestaurant(r.id))?.note).toBe('Ask for the corner table'),
    )
  })

  it('renders an empty notes textarea when there is no existing note, with no leftover placeholder text after typing', async () => {
    const r = await createRestaurant({ name: 'X', lat: 1, lng: 1 })
    render(<RestaurantDetail restaurantId={r.id} onClose={vi.fn()} />)
    const user = userEvent.setup()

    const textarea = await screen.findByLabelText('Notes')
    expect(textarea).toHaveValue('')

    await user.type(textarea, 'Loud on weekends')
    expect(textarea).toHaveValue('Loud on weekends')
  })

  it('inserts a newline on Enter in the notes textarea instead of saving', async () => {
    const r = await createRestaurant({ name: 'X', lat: 1, lng: 1 })
    render(<RestaurantDetail restaurantId={r.id} onClose={vi.fn()} />)
    const user = userEvent.setup()

    const textarea = await screen.findByLabelText('Notes')
    await user.type(textarea, 'Line one{enter}Line two')

    expect(textarea).toHaveValue('Line one\nLine two')
    // No blur happened, so nothing should have been persisted yet.
    expect((await getRestaurant(r.id))?.note).toBeUndefined()
  })

  it('keeps in-progress unsaved note text when an external store write lands while the field is focused', async () => {
    const r = await createRestaurant({ name: 'X', lat: 1, lng: 1, note: 'original note' })
    render(<RestaurantDetail restaurantId={r.id} onClose={vi.fn()} />)
    const user = userEvent.setup()

    const textarea = await screen.findByLabelText('Notes')
    await user.click(textarea) // focus, without blurring
    await user.type(textarea, ' plus my edit')

    // Simulate a rollup/check-in-triggered write landing on the same restaurant while the user is
    // still typing an unsaved note — e.g. a visit-triggered rollup recompute racing the edit.
    await mutateRestaurant(
      r.id,
      (existing) => (existing ? { ...existing, note: 'external note from rollup' } : existing),
      'store',
    )

    // The textarea must still show what the user typed, not the external value, and must not have
    // been remounted out from under them.
    await waitFor(() => expect(textarea).toHaveValue('original note plus my edit'))
    expect(screen.getByLabelText('Notes')).toBe(textarea)
  })

  it('renders the visit history most-recent-first regardless of creation order', async () => {
    const r = await createRestaurant({ name: 'Chez Marcel', lat: 1, lng: 1 })
    // Created out of chronological order: the older visit is logged second.
    await createVisit({ restaurantId: r.id, date: '2024-01-01', verdict: 'go_back' })
    await createVisit({ restaurantId: r.id, date: '2026-06-01', verdict: 'once_was_enough' })

    render(<RestaurantDetail restaurantId={r.id} onClose={vi.fn()} />)

    const dates = (await screen.findAllByText(/^\d{4}-\d{2}-\d{2}$/)).map((el) => el.textContent)
    expect(dates).toEqual(['2026-06-01', '2024-01-01'])
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

  it('links "Google Maps" to a valid mapsUrl as-is', async () => {
    const r = await createRestaurant({
      name: 'X',
      lat: 1,
      lng: 1,
      mapsUrl: 'https://maps.google.com/?q=1,1',
    })
    render(<RestaurantDetail restaurantId={r.id} onClose={vi.fn()} />)

    const link = (await screen.findByRole('link', { name: /google maps/i })) as HTMLAnchorElement
    expect(link.href).toBe('https://maps.google.com/?q=1,1')
  })

  it('shows "Google Maps" but hides "Go to" when only mapsUrl is known, with no address or coordinates', async () => {
    const r = await createRestaurant({ name: 'X', mapsUrl: 'https://maps.google.com/?q=1,1' })
    render(<RestaurantDetail restaurantId={r.id} onClose={vi.fn()} />)

    const link = (await screen.findByRole('link', { name: /google maps/i })) as HTMLAnchorElement
    expect(link.href).toBe('https://maps.google.com/?q=1,1')
    expect(screen.queryByRole('link', { name: /go to/i })).not.toBeInTheDocument()
  })

  it('falls back "Google Maps" to a search URL built from the address when mapsUrl is absent', async () => {
    const r = await createRestaurant({ name: 'X', lat: 1, lng: 1, address: '1 Rue de Paris' })
    render(<RestaurantDetail restaurantId={r.id} onClose={vi.fn()} />)

    const link = (await screen.findByRole('link', { name: /google maps/i })) as HTMLAnchorElement
    expect(link.href).toBe(
      `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent('1 Rue de Paris')}`,
    )
  })

  it('shows both coordinate-based links when there is no mapsUrl or address', async () => {
    const r = await createRestaurant({ name: 'X', lat: 48.85, lng: 2.35 })
    render(<RestaurantDetail restaurantId={r.id} onClose={vi.fn()} />)

    const destination = '48.85,2.35'
    const mapsLink = (await screen.findByRole('link', {
      name: /google maps/i,
    })) as HTMLAnchorElement
    const goToLink = screen.getByRole('link', { name: /go to/i }) as HTMLAnchorElement

    expect(mapsLink.href).toBe(
      `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(destination)}`,
    )
    expect(goToLink.href).toBe(
      `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`,
    )
  })

  it('links "Go to" to a directions URL for the address regardless of mapsUrl', async () => {
    const r = await createRestaurant({
      name: 'X',
      lat: 1,
      lng: 1,
      address: '1 Rue de Paris',
      mapsUrl: 'https://maps.google.com/?q=1,1',
    })
    render(<RestaurantDetail restaurantId={r.id} onClose={vi.fn()} />)

    const link = (await screen.findByRole('link', { name: /go to/i })) as HTMLAnchorElement
    expect(link.href).toBe(
      `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent('1 Rue de Paris')}`,
    )
  })

  it('renders neither location link when there is no mapsUrl, address, or coordinates', async () => {
    const r = await createRestaurant({ name: 'X' })
    render(<RestaurantDetail restaurantId={r.id} onClose={vi.fn()} />)

    await screen.findByText('X')
    expect(screen.queryByRole('link', { name: /google maps/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /go to/i })).not.toBeInTheDocument()
  })

  it('shows the distance from the current position when both it and the restaurant coordinates are known', async () => {
    const r = await createRestaurant({ name: 'X', lat: 48.8566, lng: 2.3522 })
    render(
      <RestaurantDetail
        restaurantId={r.id}
        onClose={vi.fn()}
        currentPosition={{ lat: 48.8606, lng: 2.3376 }}
      />,
    )

    // Same formatting the main list uses for identical inputs (formatDistance/haversineMeters).
    expect(await screen.findByText('1.2 km')).toBeInTheDocument()
  })

  it('renders no distance when there is no current position', async () => {
    const r = await createRestaurant({ name: 'X', lat: 48.8566, lng: 2.3522 })
    render(<RestaurantDetail restaurantId={r.id} onClose={vi.fn()} />)

    await screen.findByText('X')
    expect(screen.queryByText(/\d+(\.\d+)? (m|km)$/)).not.toBeInTheDocument()
  })

  it('renders no distance for a pending restaurant with unresolved coordinates, even with a current position', async () => {
    const r = await createRestaurant({ name: 'X', pending: true })
    render(
      <RestaurantDetail
        restaurantId={r.id}
        onClose={vi.fn()}
        currentPosition={{ lat: 48.8606, lng: 2.3376 }}
      />,
    )

    await screen.findByText('X')
    expect(screen.queryByText(/\d+(\.\d+)? (m|km)$/)).not.toBeInTheDocument()
  })

  it("shows the added date as the viewer's local calendar day, not the UTC slice (AE1)", async () => {
    vi.stubEnv('TZ', 'America/Bogota') // UTC-5, no DST
    // 2026-08-30T23:30:00Z in UTC-5 is still local calendar day 2026-08-30, not 2026-08-31 — the
    // UTC slice of this instant would wrongly read 2026-08-31.
    const r = await createRestaurant({ name: 'X', lat: 1, lng: 1 })
    await mutateRestaurant(r.id, (existing) =>
      existing ? { ...existing, added: '2026-08-30T23:30:00Z' } : existing,
    )

    render(<RestaurantDetail restaurantId={r.id} onClose={vi.fn()} />)

    expect(await screen.findByText(/2026-08-30/)).toBeInTheDocument()
    expect(screen.queryByText(/2026-08-31/)).not.toBeInTheDocument()
  })

  it('renders no added-date line for a pre-existing restaurant with no recorded added field', async () => {
    const r = await createRestaurant({ name: 'X', lat: 1, lng: 1 })
    // Simulate a restaurant that existed before the `added` field did — strip it entirely rather
    // than leaving it undefined-in-name-only, mirroring a genuinely pre-existing local record.
    await mutateRestaurant(r.id, (existing) => {
      if (!existing) return existing
      const { added: _added, ...rest } = existing
      return rest as typeof existing
    })

    render(<RestaurantDetail restaurantId={r.id} onClose={vi.fn()} />)

    await screen.findByText('X')
    expect(screen.queryByText(new RegExp(instantToLocalDay(r.added!)))).not.toBeInTheDocument()
  })

  it('renders no added-date line for a restaurant backfilled with an empty-string added value', async () => {
    const r = await createRestaurant({ name: 'X', lat: 1, lng: 1 })
    const originalDatePart = instantToLocalDay(r.added!)
    await mutateRestaurant(r.id, (existing) => (existing ? { ...existing, added: '' } : existing))

    render(<RestaurantDetail restaurantId={r.id} onClose={vi.fn()} />)

    await screen.findByText('X')
    expect(screen.queryByText(new RegExp(originalDatePart))).not.toBeInTheDocument()
  })

  it('treats an invalid mapsUrl as absent, falling back to the synthesized search link', async () => {
    const r = await createRestaurant({
      name: 'X',
      address: '1 Rue de Paris',
      mapsUrl: 'javascript:alert(1)',
    })
    render(<RestaurantDetail restaurantId={r.id} onClose={vi.fn()} />)

    const link = (await screen.findByRole('link', { name: /google maps/i })) as HTMLAnchorElement
    expect(link.href).toBe(
      `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent('1 Rue de Paris')}`,
    )
  })
})
