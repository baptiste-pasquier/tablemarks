import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { freshDB } from './test/idb'
import { createMockLeafletMap } from './test/mockLeafletMap'
import { useAuth } from './auth/useAuth'
import type { GeoPoint } from './lib/geolocate'

vi.mock('./auth/useAuth', () => ({
  useAuth: vi.fn(),
}))

const mockUseAuth = vi.mocked(useAuth)

// Controls the on-mount fetch (F1) and the "Localiser" tap (F2) — both call through this mock.
const mockGeolocate = vi.fn<() => Promise<GeoPoint | null>>()
vi.mock('./lib/geolocate', () => ({
  geolocate: () => mockGeolocate(),
}))

// U2 wires `currentPosition` into RestaurantList without it rendering anything different yet
// (that's U4's job), so a passthrough wrapper that captures the received props is how the
// prop-plumbing is asserted — delegating to the real component keeps every existing assertion
// (e.g. the empty-list copy) exercised unchanged.
const mockLastRestaurantListProps: { current: { currentPosition?: GeoPoint | null } | null } = {
  current: null,
}
vi.mock('./features/RestaurantList', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./features/RestaurantList')>()
  return {
    ...actual,
    RestaurantList: (props: Parameters<typeof actual.RestaurantList>[0]) => {
      mockLastRestaurantListProps.current = props
      return actual.RestaurantList(props)
    },
  }
})

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
  mockGeolocate.mockReset().mockResolvedValue(null)
  mockLastRestaurantListProps.current = null
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

describe('currentPosition state and fetch wiring (U2)', () => {
  it('fetches the device location once on mount and passes the resolved point down as currentPosition (F1, R1)', async () => {
    const point: GeoPoint = { lat: 10, lng: 20 }
    mockGeolocate.mockResolvedValue(point)

    render(<App />)
    await screen.findByText(/no places yet/i)

    await waitFor(() => expect(mockLastRestaurantListProps.current?.currentPosition).toEqual(point))
    expect(mockGeolocate).toHaveBeenCalledTimes(1)
  })

  it('leaves currentPosition null when the on-mount fetch resolves null — denied/timeout/no support (R6)', async () => {
    mockGeolocate.mockResolvedValue(null)

    render(<App />)
    await screen.findByText(/no places yet/i)

    await waitFor(() => expect(mockGeolocate).toHaveBeenCalledTimes(1))
    expect(mockLastRestaurantListProps.current?.currentPosition).toBeNull()
  })

  it('re-fetches and refreshes currentPosition when "Localiser" is tapped, in addition to recentering (F2, R2)', async () => {
    const user = userEvent.setup()
    const initial: GeoPoint = { lat: 1, lng: 1 }
    const updated: GeoPoint = { lat: 5, lng: 5 }
    mockGeolocate.mockResolvedValueOnce(initial)

    render(<App />)
    await screen.findByText(/no places yet/i)
    await waitFor(() => expect(mockLastRestaurantListProps.current?.currentPosition).toEqual(initial))

    mockGeolocate.mockResolvedValueOnce(updated)
    await user.click(screen.getByRole('button', { name: /center on my location/i }))

    await waitFor(() => expect(mockLastRestaurantListProps.current?.currentPosition).toEqual(updated))
    expect(mockGeolocate).toHaveBeenCalledTimes(2)
  })

  it('does not overwrite a known currentPosition when a later "Localiser" tap fails (KTD3 null-guard)', async () => {
    const user = userEvent.setup()
    const initial: GeoPoint = { lat: 3, lng: 4 }
    mockGeolocate.mockResolvedValueOnce(initial)

    render(<App />)
    await screen.findByText(/no places yet/i)
    await waitFor(() => expect(mockLastRestaurantListProps.current?.currentPosition).toEqual(initial))

    mockGeolocate.mockResolvedValueOnce(null)
    await user.click(screen.getByRole('button', { name: /center on my location/i }))

    await waitFor(() => expect(mockGeolocate).toHaveBeenCalledTimes(2))
    expect(mockLastRestaurantListProps.current?.currentPosition).toEqual(initial)
  })

  it('keeps the fresher "Localiser" result even when the earlier-started mount fetch resolves later (KTD3 generation guard)', async () => {
    const user = userEvent.setup()
    let resolveMount!: (p: GeoPoint | null) => void
    let resolveTap!: (p: GeoPoint | null) => void
    const mountFetch = new Promise<GeoPoint | null>((resolve) => {
      resolveMount = resolve
    })
    const tapFetch = new Promise<GeoPoint | null>((resolve) => {
      resolveTap = resolve
    })
    mockGeolocate.mockReturnValueOnce(mountFetch).mockReturnValueOnce(tapFetch)

    render(<App />)
    await screen.findByText(/no places yet/i)
    await waitFor(() => expect(mockGeolocate).toHaveBeenCalledTimes(1))

    await user.click(screen.getByRole('button', { name: /center on my location/i }))
    await waitFor(() => expect(mockGeolocate).toHaveBeenCalledTimes(2))

    const tapPoint: GeoPoint = { lat: 9, lng: 9 }
    const mountPoint: GeoPoint = { lat: 1, lng: 1 }
    resolveTap(tapPoint)
    await waitFor(() => expect(mockLastRestaurantListProps.current?.currentPosition).toEqual(tapPoint))

    resolveMount(mountPoint)
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(mockLastRestaurantListProps.current?.currentPosition).toEqual(tapPoint)
  })
})
