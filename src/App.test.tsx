import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { freshDB } from './test/idb'
import { createMockLeafletMap } from './test/mockLeafletMap'
import { useAuth } from './auth/useAuth'

vi.mock('./auth/useAuth', () => ({
  useAuth: vi.fn(),
}))

const mockUseAuth = vi.mocked(useAuth)

// Leaflet needs real DOM dimensions jsdom doesn't provide; stub the map for the shell test.
vi.mock('react-leaflet', () => {
  // Stable map instance — real react-leaflet's useMap() returns the same object across renders;
  // a fresh object each call would make effects keyed on `map` loop forever. This suite doesn't
  // fire zoomend/moveend, it just needs LabelVisibility's mount-time recompute (which calls
  // getSize/latLngToContainerPoint/invalidateSize) not to throw — so the shared factory's static
  // defaults are enough, no mutable knobs or handler registry needed here (see MapView.test.tsx
  // for those).
  const map = createMockLeafletMap()
  return {
    MapContainer: ({ children }: { children?: React.ReactNode }) => <div data-testid="map">{children}</div>,
    TileLayer: () => null,
    Marker: () => null,
    Popup: () => null,
    useMap: () => map,
  }
})

import App from './App.tsx'

beforeEach(async () => {
  await freshDB()
  mockUseAuth.mockReturnValue({ signedIn: false, email: null, signIn: vi.fn(), signOut: vi.fn() })
})

describe('App shell', () => {
  it('renders the app name and the empty list state', async () => {
    render(<App />)
    expect(screen.getByRole('heading', { name: 'Tablemarks' })).toBeInTheDocument()
    expect(await screen.findByText(/no places yet/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /add a place/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /where to eat/i })).toBeInTheDocument()
  })

  it('no longer renders the standalone Export/Import button (U4)', async () => {
    render(<App />)
    await screen.findByText(/no places yet/i)
    expect(screen.queryByRole('button', { name: /export.*import/i })).not.toBeInTheDocument()
  })

  it('shows a settings button with a translated accessible name that opens the Settings panel, when signed out', async () => {
    const user = userEvent.setup()
    render(<App />)
    await screen.findByText(/no places yet/i)
    const settingsButton = screen.getByRole('button', { name: /settings|paramètres/i })
    expect(screen.queryByRole('heading', { name: 'Settings' })).not.toBeInTheDocument()

    await user.click(settingsButton)
    expect(screen.getByRole('heading', { name: 'Settings' })).toBeInTheDocument()
  })

  it('shows the settings button (not nested in the auth ternary) and opens Settings, when signed in', async () => {
    mockUseAuth.mockReturnValue({
      signedIn: true,
      email: 'person@example.com',
      signIn: vi.fn(),
      signOut: vi.fn(),
    })
    const user = userEvent.setup()
    render(<App />)
    await screen.findByText(/no places yet/i)
    const settingsButton = screen.getByRole('button', { name: /settings|paramètres/i })

    await user.click(settingsButton)
    expect(screen.getByRole('heading', { name: 'Settings' })).toBeInTheDocument()
  })

  it('switches the mobile view toggle between list and map', async () => {
    const user = userEvent.setup()
    render(<App />)
    const listButton = screen.getByRole('button', { name: /^list$/i })
    const mapButton = screen.getByRole('button', { name: /^map$/i })
    expect(listButton).toHaveAttribute('aria-pressed', 'true')
    expect(mapButton).toHaveAttribute('aria-pressed', 'false')
    expect(screen.queryByRole('button', { name: 'Add a place' })).not.toBeInTheDocument()

    await user.click(mapButton)

    expect(listButton).toHaveAttribute('aria-pressed', 'false')
    expect(mapButton).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Add a place' })).toBeInTheDocument()

    await user.click(listButton)

    expect(listButton).toHaveAttribute('aria-pressed', 'true')
    expect(mapButton).toHaveAttribute('aria-pressed', 'false')
    expect(screen.queryByRole('button', { name: 'Add a place' })).not.toBeInTheDocument()
  })
})
