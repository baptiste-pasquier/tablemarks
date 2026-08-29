import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest'
import { freshDB } from '../../test/idb'
import { PortabilityPanel } from './PortabilityPanel'
import { createRestaurant, getRestaurant, allRestaurants } from '../../data/restaurants'

// This suite doesn't drive a real i18next instance (see i18n/config.test.ts for that coverage)
// — a passthrough keeps ModalHeader's `t('common.close')` call quiet instead of warning.
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => (key === 'common.close' ? 'Close' : key) }),
}))

beforeEach(freshDB)
afterEach(() => vi.restoreAllMocks())

const validEnvelope = {
  format: 'tablemarks-export',
  schemaVersion: 1,
  exportedAt: '2026-06-13T00:00:00Z',
  records: {
    restaurants: [
      { id: 'r1', name: 'Imported', lat: 1, lng: 2, pending: false, latestVerdict: null, latestVisitDate: null, visitCount: 0, updated: '2026-05-01T00:00:00Z', deleted: false },
    ],
    visits: [],
  },
}

function jsonFile(obj: unknown, name = 'backup.json'): File {
  return new File([JSON.stringify(obj)], name, { type: 'application/json' })
}

describe('PortabilityPanel', () => {
  it('exports the collection as a downloadable JSON envelope and revokes the URL (AE1)', async () => {
    await createRestaurant({ name: 'Chez Marcel', lat: 48, lng: 2, cuisine: 'French' })
    let captured: Blob | null = null
    // jsdom doesn't implement these URL methods — assign mocks directly rather than spyOn.
    const revoke = vi.fn()
    URL.createObjectURL = vi.fn((b: Blob | MediaSource) => {
      captured = b as Blob
      return 'blob:test'
    }) as typeof URL.createObjectURL
    URL.revokeObjectURL = revoke as typeof URL.revokeObjectURL
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

    render(<PortabilityPanel onClose={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: /export collection/i }))

    await waitFor(() => expect(captured).not.toBeNull())
    const env = JSON.parse(await captured!.text())
    expect(env.format).toBe('tablemarks-export')
    expect(env.records.restaurants.map((r: { name: string }) => r.name)).toContain('Chez Marcel')
    // revoke is deferred (setTimeout) so the browser can start the download first.
    await waitFor(() => expect(revoke).toHaveBeenCalled(), { timeout: 2000 })
  })

  it('imports a valid file after confirmation and shows a summary', async () => {
    render(<PortabilityPanel onClose={vi.fn()} />)
    const user = userEvent.setup()

    await user.upload(screen.getByLabelText(/import a backup file/i), jsonFile(validEnvelope))
    await user.click(await screen.findByRole('button', { name: /confirm import/i }))

    await waitFor(async () => expect((await getRestaurant('r1'))?.name).toBe('Imported'))
    expect(await screen.findByText(/1 added/i)).toBeInTheDocument()
  })

  it('reports a malformed file and leaves the store untouched (AE3)', async () => {
    render(<PortabilityPanel onClose={vi.fn()} />)
    const user = userEvent.setup()

    await user.upload(screen.getByLabelText(/import a backup file/i), new File(['{not valid json'], 'bad.json', { type: 'application/json' }))

    expect(await screen.findByText(/valid json/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /confirm import/i })).toBeNull()
    expect(await allRestaurants()).toHaveLength(0)
  })

  it('reports an all-unchanged re-import of an already-present record', async () => {
    await createRestaurant({ id: 'r1', name: 'Imported', lat: 1, lng: 2, note: undefined })
    // Make the local copy newer so the older file record loses LWW -> unchanged.
    render(<PortabilityPanel onClose={vi.fn()} />)
    const user = userEvent.setup()

    await user.upload(screen.getByLabelText(/import a backup file/i), jsonFile(validEnvelope))
    await user.click(await screen.findByRole('button', { name: /confirm import/i }))

    expect(await screen.findByText(/0 added/i)).toBeInTheDocument()
  })

  it('renders as a headless section — no backdrop or dialog chrome of its own — when not wrapped in a Modal (KTD3)', async () => {
    const { container } = render(<PortabilityPanel onClose={vi.fn()} />)

    expect(await screen.findByRole('heading', { name: /export/i })).toBeInTheDocument()
    expect(container.querySelector('[role="dialog"]')).toBeNull()
    // Modal's backdrop is a `fixed inset-0 ... bg-black/50` div — none of that chrome exists here.
    expect(container.innerHTML).not.toContain('bg-black/50')
    expect(container.innerHTML).not.toContain('fixed inset-0')
  })
})
