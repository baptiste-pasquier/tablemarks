import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { freshDB } from './test/idb'
import { createMockLeafletMap } from './test/mockLeafletMap'
import { useAuth } from './auth/useAuth'
import { useBackendStatus } from './sync/useBackendStatus'
import type { BackendStatus } from './sync/backendStatus'
import { setSyncState } from './sync/syncStatus'
import { mockI18n } from './test/setup'
import { createRestaurant } from './data/restaurants'
import { readSortPreference, writeSortPreference } from './lib/sortPreference'
import type { GeoPoint } from './lib/geolocate'

vi.mock('./auth/useAuth', () => ({
  useAuth: vi.fn(),
}))

const mockUseAuth = vi.mocked(useAuth)

// Backend availability (U4). Roughly forty tests in this file render the whole app; leaving the
// real hook in place would have each of them subscribe to the store the bootstrap writes and,
// through it, reach for the runtime configuration file. Mocked here with a shared default in
// `beforeEach` (a configured, answering backend — the shape every pre-U4 assertion was written
// against) so only the tests that care about a different configuration set one.
vi.mock('./sync/useBackendStatus', () => ({
  useBackendStatus: vi.fn(),
}))

const mockUseBackendStatus = vi.mocked(useBackendStatus)

const CONFIGURED_REACHABLE: BackendStatus = {
  presence: { status: 'configured', pocketbaseUrl: 'https://pb.example.test' },
  reachability: 'reachable',
}

// Controls the on-mount fetch (F1) and the "Localiser" tap (F2) — both call through this mock.
const mockGeolocate = vi.fn<() => Promise<GeoPoint | null>>()
vi.mock('./lib/geolocate', () => ({
  geolocate: () => mockGeolocate(),
}))

// U2 wires `currentPosition` into RestaurantList without it rendering anything different yet
// (that's U4's job), so a passthrough wrapper that captures the received props is how the
// prop-plumbing is asserted — delegating to the real component keeps every existing assertion
// (e.g. the empty-list copy) exercised unchanged.
const mockLastRestaurantListProps: {
  current: { currentPosition?: GeoPoint | null; items: { id: string }[] } | null
} = {
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

// U2 wires `fallbackCenter` into MapView without it changing any observable behavior yet (that's
// a later unit's job), so a passthrough wrapper that captures the received props — mirroring the
// RestaurantList wrapper above — is how the prop-plumbing is asserted. Also captures `hoveredId`
// (U2 KTD1) — App.tsx's own hover state passed through alongside `selectedId`.
const mockLastMapViewProps: {
  current: { fallbackCenter?: GeoPoint | null; hoveredId?: string | null } | null
} = {
  current: null,
}
vi.mock('./features/map/MapView', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./features/map/MapView')>()
  return {
    ...actual,
    MapView: (props: Parameters<typeof actual.MapView>[0]) => {
      mockLastMapViewProps.current = props
      return actual.MapView(props)
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
    MapContainer: ({ children }: { children?: React.ReactNode }) => (
      <div data-testid="map">{children}</div>
    ),
    TileLayer: () => null,
    Marker: () => null,
    Popup: () => null,
    Tooltip: () => null,
    useMap: () => map,
  }
})

import App from './App.tsx'

beforeEach(async () => {
  await freshDB()
  window.localStorage.clear()
  mockUseAuth.mockReturnValue({
    signedIn: false,
    email: null,
    avatarUrl: null,
    signIn: vi.fn(),
    signOut: vi.fn(),
  })
  mockUseBackendStatus.mockReturnValue(CONFIGURED_REACHABLE)
  // Module-global store, shared across this file's tests — reset so an unreachable case set by
  // one test can't leak into the next one's account-menu chip.
  setSyncState('synced')
  mockGeolocate.mockReset().mockResolvedValue(null)
  mockLastRestaurantListProps.current = null
  mockLastMapViewProps.current = null
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

  it('shows the avatar/account menu instead of a standalone settings button, and opens Settings from its Réglages entry, when signed in (R1, R5)', async () => {
    mockUseAuth.mockReturnValue({
      signedIn: true,
      email: 'person@example.com',
      avatarUrl: null,
      signIn: vi.fn(),
      signOut: vi.fn(),
    })
    const user = userEvent.setup()
    render(<App />)
    await screen.findByText(/no places yet/i)
    expect(screen.queryByRole('button', { name: /settings|paramètres/i })).not.toBeInTheDocument()

    const accountMenuButton = screen.getByRole('button', { name: /account menu|menu du compte/i })
    await user.click(accountMenuButton)
    await user.click(screen.getByRole('menuitem', { name: /settings|paramètres/i }))
    expect(screen.getByRole('heading', { name: 'Settings' })).toBeInTheDocument()
    // KTD3: the trigger is re-focused before Settings' Modal mounts, so Modal's own
    // "previously focused" capture sees the trigger rather than document.body. Modal's own
    // initial-focus effect immediately moves focus into the panel (its Close button) on mount,
    // so the only way to observe the correct capture is indirectly: closing the modal restores
    // focus to whatever it captured, and that must be the trigger, not document.body. Settings
    // and its embedded PortabilityPanel each render their own ModalHeader close button (both
    // wired to the same onClose), so pick the first (Settings' own).
    await user.click(screen.getAllByRole('button', { name: /close/i })[0])
    expect(accountMenuButton).toHaveFocus()
  })

  it('signing out from the account menu clears auth and unmounts the avatar subtree, mirroring the old SyncStatusIndicator gating', async () => {
    const signOutMock = vi.fn()
    mockUseAuth.mockReturnValue({
      signedIn: true,
      email: 'person@example.com',
      avatarUrl: null,
      signIn: vi.fn(),
      signOut: signOutMock,
    })
    const user = userEvent.setup()
    const { rerender } = render(<App />)
    await screen.findByText(/no places yet/i)

    await user.click(screen.getByRole('button', { name: /account menu|menu du compte/i }))
    await user.click(screen.getByRole('menuitem', { name: /sign out|se déconnecter/i }))
    expect(signOutMock).toHaveBeenCalled()

    // useAuth is mocked statically in this suite (its own reactivity is covered by
    // useAuth.test.ts) — simulate the re-render the real hook triggers once signOut() clears
    // pb.authStore, before the deferred focus-shift below fires.
    mockUseAuth.mockReturnValue({
      signedIn: false,
      email: null,
      avatarUrl: null,
      signIn: vi.fn(),
      signOut: vi.fn(),
    })
    rerender(<App />)

    expect(
      screen.queryByRole('button', { name: /account menu|menu du compte/i }),
    ).not.toBeInTheDocument()
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('moves focus to the "Se connecter" button after signing out from the account menu (KTD3)', async () => {
    const signOutMock = vi.fn()
    mockUseAuth.mockReturnValue({
      signedIn: true,
      email: 'person@example.com',
      avatarUrl: null,
      signIn: vi.fn(),
      signOut: signOutMock,
    })
    const user = userEvent.setup()
    const { rerender } = render(<App />)
    await screen.findByText(/no places yet/i)

    await user.click(screen.getByRole('button', { name: /account menu|menu du compte/i }))
    await user.click(screen.getByRole('menuitem', { name: /sign out|se déconnecter/i }))

    mockUseAuth.mockReturnValue({
      signedIn: false,
      email: null,
      avatarUrl: null,
      signIn: vi.fn(),
      signOut: vi.fn(),
    })
    rerender(<App />)

    await waitFor(() => expect(document.getElementById('shell-signin-button')).toHaveFocus())
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

  it('lets the header shrink instead of overflow on a narrow viewport (bug fix): the title group can shrink/truncate, the actions group stays shrink-0', () => {
    render(<App />)

    const heading = screen.getByRole('heading', { name: 'Tablemarks' })
    expect(heading).toHaveClass('truncate')
    const titleGroup = heading.closest('[class*="min-w-0"]')?.parentElement
    expect(titleGroup).toHaveClass('min-w-0', 'flex-1')

    const settingsButton = screen.getByRole('button', { name: /settings|paramètres/i })
    const actionsGroup = settingsButton.closest('[class*="shrink-0"]')
    expect(actionsGroup).toHaveClass('shrink-0')
  })

  it("gives the mobile List/Map nav a z-index above Leaflet's own panes/controls (max 1000, e.g. the attribution control), so the map — which now fills <main> fully — can never render on top of it and hide it", () => {
    render(<App />)
    const nav = screen.getByRole('navigation')
    expect(nav).toHaveClass('z-[var(--z-nav)]')
  })

  it('aligns the "+" FAB with the "Filtres · N" pill at the same bottom offset', async () => {
    const user = userEvent.setup()
    await createRestaurant({ id: 'r1', name: 'R1 Place', lat: 1, lng: 1, cuisine: 'French' })

    render(<App />)
    await screen.findByText('R1 Place')
    await user.click(screen.getByRole('button', { name: /^map$/i }))

    const fab = screen.getByRole('button', { name: 'Add a place' })
    const pill = screen.getByRole('button', { name: 'Filters · 0' })
    expect(fab).toHaveClass('bottom-[calc(var(--safe-area-floating-offset)+0.5rem)]')
    expect(pill).toHaveClass('bottom-[calc(var(--safe-area-floating-offset)+0.5rem)]')
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
    await waitFor(() =>
      expect(mockLastRestaurantListProps.current?.currentPosition).toEqual(initial),
    )

    mockGeolocate.mockResolvedValueOnce(updated)
    await user.click(screen.getByRole('button', { name: /center on my location/i }))

    await waitFor(() =>
      expect(mockLastRestaurantListProps.current?.currentPosition).toEqual(updated),
    )
    expect(mockGeolocate).toHaveBeenCalledTimes(2)
  })

  it('does not overwrite a known currentPosition when a later "Localiser" tap fails (KTD3 null-guard)', async () => {
    const user = userEvent.setup()
    const initial: GeoPoint = { lat: 3, lng: 4 }
    mockGeolocate.mockResolvedValueOnce(initial)

    render(<App />)
    await screen.findByText(/no places yet/i)
    await waitFor(() =>
      expect(mockLastRestaurantListProps.current?.currentPosition).toEqual(initial),
    )

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
    await waitFor(() =>
      expect(mockLastRestaurantListProps.current?.currentPosition).toEqual(tapPoint),
    )

    resolveMount(mountPoint)
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(mockLastRestaurantListProps.current?.currentPosition).toEqual(tapPoint)
  })
})

describe('fallbackCenter wiring (U2, R2/R5)', () => {
  it('passes the most-recently-added restaurant coordinates to MapView as fallbackCenter', async () => {
    await createRestaurant({
      id: 'recent',
      name: 'Recent Place',
      lat: 10,
      lng: 20,
    })

    render(<App />)
    await screen.findByText('Recent Place')

    await waitFor(() =>
      expect(mockLastMapViewProps.current?.fallbackCenter).toEqual({ lat: 10, lng: 20 }),
    )
  })

  it('keeps fallbackCenter reflecting the full restaurant list, unaffected by an active facet filter (R5)', async () => {
    const user = userEvent.setup()
    // Fake only Date (matching src/lib/dates.test.ts's convention) so the two `added` timestamps
    // (assigned via `now()`) are deterministically ordered rather than racing on the real clock's
    // millisecond resolution.
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-08-30T10:00:00.000Z'))
    await createRestaurant({
      id: 'french',
      name: 'French Place',
      lat: 1,
      lng: 1,
      cuisine: 'French',
    })
    // Created after 'french', so it holds the more recent `added` and is the expected fallback —
    // deliberately of a *different* cuisine, so filtering to French excludes it from `visible`
    // while it must still remain the fallback target (R5).
    vi.setSystemTime(new Date('2026-08-30T11:00:00.000Z'))
    await createRestaurant({
      id: 'thai',
      name: 'Thai Place',
      lat: 2,
      lng: 2,
      cuisine: 'Thai',
    })
    vi.useRealTimers()

    render(<App />)
    await screen.findByText('Thai Place')
    await waitFor(() =>
      expect(mockLastMapViewProps.current?.fallbackCenter).toEqual({ lat: 2, lng: 2 }),
    )

    // Narrow the visible list to French only, via the cuisine facet chip.
    await user.click(screen.getByRole('button', { name: 'French' }))

    expect(screen.queryByText('Thai Place')).not.toBeInTheDocument()
    expect(screen.getByText('French Place')).toBeInTheDocument()
    // fallbackCenter still reflects the full, unfiltered restaurant list.
    expect(mockLastMapViewProps.current?.fallbackCenter).toEqual({ lat: 2, lng: 2 })
  })

  it('passes fallbackCenter: null to MapView when there are no restaurants', async () => {
    render(<App />)
    await screen.findByText(/no places yet/i)

    expect(mockLastMapViewProps.current?.fallbackCenter).toBeNull()
  })
})

describe('hover wiring end-to-end (U2 R1-R3, KTD1)', () => {
  it('passes the hovered restaurant id to MapView as hoveredId on mouse enter, and clears it back to null on mouse leave', async () => {
    const user = userEvent.setup()
    await createRestaurant({ id: 'r1', name: 'R1 Place', lat: 1, lng: 1, cuisine: 'French' })

    render(<App />)
    const card = await screen.findByText('R1 Place')
    const button = card.closest('button')
    if (!button) throw new Error('restaurant card button not found')

    expect(mockLastMapViewProps.current?.hoveredId).toBeNull()

    await user.hover(button)
    expect(mockLastMapViewProps.current?.hoveredId).toBe('r1')

    await user.unhover(button)
    expect(mockLastMapViewProps.current?.hoveredId).toBeNull()
  })

  it('also clears hoveredId on focus/blur, mirroring the mouse-enter/leave wiring (keyboard users)', async () => {
    await createRestaurant({ id: 'r1', name: 'R1 Place', lat: 1, lng: 1, cuisine: 'French' })

    render(<App />)
    const card = await screen.findByText('R1 Place')
    const button = card.closest('button')
    if (!button) throw new Error('restaurant card button not found')

    act(() => button.focus())
    expect(mockLastMapViewProps.current?.hoveredId).toBe('r1')

    act(() => button.blur())
    expect(mockLastMapViewProps.current?.hoveredId).toBeNull()
  })

  it('clears hoveredId when the restaurant detail closes, so Modal restoring focus to the list card cannot relight the hover halo (code-review finding)', async () => {
    const user = userEvent.setup()
    await createRestaurant({ id: 'r1', name: 'R1 Place', lat: 1, lng: 1, cuisine: 'French' })

    render(<App />)
    const card = await screen.findByText('R1 Place')
    const button = card.closest('button')
    if (!button) throw new Error('restaurant card button not found')

    await user.click(button)
    expect(await screen.findByRole('heading', { name: 'R1 Place' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /close/i }))
    expect(screen.queryByRole('heading', { name: 'R1 Place' })).not.toBeInTheDocument()
    // Modal's cleanup restores focus to `button` (the element that was focused when the detail
    // opened), which fires RestaurantList's onFocus handler -- without the App.tsx fix this sets
    // hoveredId back to 'r1' even though nothing is actually being hovered.
    expect(mockLastMapViewProps.current?.hoveredId).toBeNull()
  })

  it('clears a stale hoveredId once the hovered restaurant drops out of the filtered list (code-review finding)', async () => {
    await createRestaurant({ id: 'r1', name: 'French Place', lat: 1, lng: 1, cuisine: 'French' })
    await createRestaurant({ id: 'r2', name: 'Thai Place', lat: 2, lng: 2, cuisine: 'Thai' })

    render(<App />)
    const card = await screen.findByText('French Place')
    const button = card.closest('button')
    if (!button) throw new Error('restaurant card button not found')

    // fireEvent, not user.hover/user.click: user-event tracks a virtual pointer position and
    // would synthesize its own mouseleave on `button` as a side effect of "moving" to click the
    // Thai chip elsewhere -- that would clear hoveredId via the ordinary onMouseLeave path and
    // never exercise this fix. A real-world trigger (a background sync update reclassifying this
    // restaurant, or any filter change while the mouse stays physically still) fires no DOM event
    // on `button` at all, which is exactly what fireEvent.click on the chip reproduces here: the
    // card unmounts (React fires no mouseleave/blur for that), and only App's own effect --
    // watching whether hoveredId still appears in the filtered list -- can notice and clear it.
    fireEvent.mouseEnter(button)
    expect(mockLastMapViewProps.current?.hoveredId).toBe('r1')

    fireEvent.click(screen.getByRole('button', { name: 'Thai' }))
    expect(screen.queryByText('French Place')).not.toBeInTheDocument()

    await waitFor(() => expect(mockLastMapViewProps.current?.hoveredId).toBeNull())
  })
})

describe('mobile list selection unaffected by hover wiring (U2 R3/R12, AE4)', () => {
  it('still opens the restaurant detail full-screen sheet on tap in the default (list) mobile view, and hovering first does not open it or switch panes', async () => {
    const user = userEvent.setup()
    await createRestaurant({ id: 'r1', name: 'R1 Place', lat: 1, lng: 1, cuisine: 'French' })

    render(<App />)
    const card = await screen.findByText('R1 Place')
    expect(screen.getByRole('button', { name: /^list$/i })).toHaveAttribute('aria-pressed', 'true')

    const button = card.closest('button')
    if (!button) throw new Error('restaurant card button not found')

    await user.hover(button)
    expect(screen.queryByRole('heading', { name: 'R1 Place' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^list$/i })).toHaveAttribute('aria-pressed', 'true')

    await user.click(button)

    expect(await screen.findByRole('heading', { name: 'R1 Place' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^list$/i })).toHaveAttribute('aria-pressed', 'true')
  })
})

describe('desktop filter overlay (U3)', () => {
  it('keeps FilterBar directly after the "Where to eat" button and before RestaurantList in DOM order (R7) — tab order is unchanged even though FilterBar now renders as a floating overlay over the map on desktop', async () => {
    await createRestaurant({ id: 'r1', name: 'R1 Place', lat: 1, lng: 1, cuisine: 'French' })

    render(<App />)
    await screen.findByText('R1 Place')

    const whereToEat = screen.getByRole('button', { name: /where to eat/i })
    const cuisineChip = screen.getByRole('button', { name: 'French' })
    const restaurantRow = screen.getByText('R1 Place')

    // DOCUMENT_POSITION_FOLLOWING: the argument node comes after the node compareDocumentPosition
    // was called on, in DOM order.
    expect(
      whereToEat.compareDocumentPosition(cuisineChip) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    expect(
      cuisineChip.compareDocumentPosition(restaurantRow) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })

  it('does not float a visible white card over the map when there are no restaurants yet (FilterBar renders nothing, but the measurement wrapper must stay mounted)', () => {
    const { container } = render(<App />)

    const overlayWrapper = Array.from(container.querySelectorAll('div')).find((el) =>
      el.className.includes('md:top-[var(--filter-overlay-top)]'),
    )
    expect(overlayWrapper).toBeDefined()
    expect(overlayWrapper?.className).not.toMatch(/md:bg-white|md:shadow-lg|md:rounded-card/)
    expect(overlayWrapper?.textContent).toBe('')
  })

  it('spans the full map-pane width via md:right-[var(--filter-overlay-right)], not a fixed md:w-96 card width, so it right-aligns with the Locate/zoom control stack', () => {
    const { container } = render(<App />)

    const overlayWrapper = Array.from(container.querySelectorAll('div')).find((el) =>
      el.className.includes('md:top-[var(--filter-overlay-top)]'),
    )
    expect(overlayWrapper).toHaveClass('md:right-[var(--filter-overlay-right)]')
    expect(overlayWrapper?.className).not.toMatch(/md:w-96/)
  })

  describe('measured-height -> control-stack offset wiring (KTD3)', () => {
    // A dedicated fake (rather than a generic vi.fn()-based stub) so the constructor can both
    // capture its `callback` for the test to invoke manually (simulating a real resize, e.g. the
    // cuisine row's "+N autres" expanding the overlay) and record which element it observed —
    // `ResizeObserver` isn't implemented in jsdom, and App.tsx's own effect already no-ops when
    // it's undefined, so without this stub the effect would just never call `observe` at all.
    class FakeResizeObserver {
      callback: ResizeObserverCallback
      observed: Element[] = []
      constructor(callback: ResizeObserverCallback) {
        this.callback = callback
        instances.push(this)
      }
      observe(target: Element) {
        this.observed.push(target)
      }
      unobserve() {}
      disconnect = vi.fn()
    }
    let instances: FakeResizeObserver[]
    let mockOverlayHeight = 120

    beforeEach(() => {
      instances = []
      mockOverlayHeight = 120
      vi.stubGlobal('ResizeObserver', FakeResizeObserver)
      // jsdom's real getBoundingClientRect always reports 0 — stub it so the overlay ref's
      // measured height is actually controllable from the test.
      vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
        () =>
          ({
            height: mockOverlayHeight,
            width: 0,
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            x: 0,
            y: 0,
            toJSON() {},
          }) as DOMRect,
      )
    })

    afterEach(() => {
      vi.unstubAllGlobals()
      vi.restoreAllMocks()
    })

    /** The same measurement hook (`useMeasuredSizeVar`) runs for the filter overlay and, twice, for
     *  the account controls, so `instances` holds several FakeResizeObservers — find the overlay's
     *  by which element it actually observed, rather than assuming array order. */
    function overlayObserver(container: HTMLElement) {
      const overlayEl = Array.from(container.querySelectorAll('div')).find((el) =>
        el.className.includes('md:top-[var(--filter-overlay-top)]'),
      )
      const observer = instances.find((o) => !!overlayEl && o.observed.includes(overlayEl))
      if (!observer) throw new Error('overlay ResizeObserver instance not found')
      return observer
    }

    it('writes the filter overlay\'s measured height to --filter-overlay-height, and updates it when the overlay resizes (e.g. the cuisine row\'s "+N autres" expanding it)', async () => {
      await createRestaurant({ id: 'r1', name: 'R1 Place', lat: 1, lng: 1, cuisine: 'French' })

      const { container } = render(<App />)
      await screen.findByText('R1 Place')

      expect(document.documentElement.style.getPropertyValue('--filter-overlay-height')).toBe(
        '120px',
      )

      // The real callback reads the size straight off the entry the browser already computed
      // (`entry.borderBoxSize[0].blockSize`), rather than re-querying getBoundingClientRect — so
      // the fake resize notification has to carry that shape too, matching the real API.
      mockOverlayHeight = 260
      const entry = {
        borderBoxSize: [{ blockSize: mockOverlayHeight, inlineSize: 0 }],
      } as unknown as ResizeObserverEntry
      const observer = overlayObserver(container)
      observer.callback([entry], observer as unknown as ResizeObserver)

      expect(document.documentElement.style.getPropertyValue('--filter-overlay-height')).toBe(
        '260px',
      )
    })

    it("writes the floating account controls' measured width to --account-float-width, which the overlay's right edge stops short of, and follows it when the controls change width", async () => {
      await createRestaurant({ id: 'r1', name: 'R1 Place', lat: 1, lng: 1, cuisine: 'French' })
      vi.mocked(HTMLElement.prototype.getBoundingClientRect).mockImplementation(
        () => ({ height: 36, width: 72 }) as DOMRect,
      )

      render(<App />)
      await screen.findByText('R1 Place')

      expect(document.documentElement.style.getPropertyValue('--account-float-width')).toBe('72px')
      expect(document.documentElement.style.getPropertyValue('--account-float-height')).toBe('36px')

      // Signing in swaps Sign in + Settings for a lone avatar: a narrower group, reported as a
      // resize of the same element.
      const group = screen.getByRole('button', { name: /settings|paramètres/i }).parentElement!
      const entry = {
        borderBoxSize: [{ blockSize: 36, inlineSize: 36 }],
      } as unknown as ResizeObserverEntry
      for (const observer of instances.filter((o) => o.observed.includes(group))) {
        observer.callback([entry], observer as unknown as ResizeObserver)
      }
      expect(document.documentElement.style.getPropertyValue('--account-float-width')).toBe('36px')
    })

    it('disconnects the ResizeObserver when App unmounts', async () => {
      await createRestaurant({ id: 'r1', name: 'R1 Place', lat: 1, lng: 1, cuisine: 'French' })

      const { container, unmount } = render(<App />)
      await screen.findByText('R1 Place')
      const observer = overlayObserver(container)

      unmount()

      expect(observer.disconnect).toHaveBeenCalledOnce()
    })
  })
})

describe('sort criterion/direction wiring (U4)', () => {
  const HERE: GeoPoint = { lat: 0, lng: 0 }

  // Distance order (nearest-first) is [near, far]; date order (most-recent-first, the default) is
  // [far, near] since 'far' is created after 'near' — deliberately opposite, so a test can tell
  // which rule actually produced the observed order.
  async function createNearAndFarByDistanceAndDate() {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-08-30T10:00:00.000Z'))
    await createRestaurant({
      id: 'near',
      name: 'Near Place',
      lat: 0,
      lng: 0.001,
      cuisine: 'French',
    })
    vi.setSystemTime(new Date('2026-08-30T11:00:00.000Z'))
    await createRestaurant({ id: 'far', name: 'Far Place', lat: 0, lng: 1, cuisine: 'Thai' })
    vi.useRealTimers()
  }

  it('shows the sort bar with Date selectable and no error when the list is empty', async () => {
    render(<App />)
    await screen.findByText(/no places yet/i)
    expect(screen.getByRole('button', { name: 'Date' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Distance' })).toBeDisabled()
  })

  it('re-sorts by distance with no user action when a persisted Distance preference exists and a position resolves after mount (AE2)', async () => {
    writeSortPreference({
      criterion: 'distance',
      directions: { distance: 'nearest', date: 'newest' },
    })
    await createNearAndFarByDistanceAndDate()
    mockGeolocate.mockResolvedValue(HERE)

    render(<App />)
    await screen.findByText('Near Place')

    await waitFor(() =>
      expect(mockLastRestaurantListProps.current?.items.map((r) => r.id)).toEqual(['near', 'far']),
    )
  })

  it('leaves Date active when no sort preference was persisted, even after a position resolves (AE6)', async () => {
    await createNearAndFarByDistanceAndDate()
    mockGeolocate.mockResolvedValue(HERE)

    render(<App />)
    await screen.findByText('Near Place')

    await waitFor(() => expect(mockLastRestaurantListProps.current?.currentPosition).toEqual(HERE))
    // Distance became selectable, but the order is still date order (most-recent-first) — the
    // automatic switch to Distance only fires for a returning user with a persisted preference.
    expect(mockLastRestaurantListProps.current?.items.map((r) => r.id)).toEqual(['far', 'near'])
    expect(screen.getByRole('button', { name: 'Date' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('keeps the active sort applied to the newly filtered set after a facet filter changes (R11)', async () => {
    writeSortPreference({
      criterion: 'distance',
      directions: { distance: 'nearest', date: 'newest' },
    })
    await createRestaurant({
      id: 'french-near',
      name: 'French Near',
      lat: 0,
      lng: 0.001,
      cuisine: 'French',
    })
    await createRestaurant({ id: 'thai-mid', name: 'Thai Mid', lat: 0, lng: 0.5, cuisine: 'Thai' })
    await createRestaurant({
      id: 'french-far',
      name: 'French Far',
      lat: 0,
      lng: 1,
      cuisine: 'French',
    })
    mockGeolocate.mockResolvedValue(HERE)

    const user = userEvent.setup()
    render(<App />)
    await screen.findByText('French Near')
    await waitFor(() =>
      expect(mockLastRestaurantListProps.current?.items.map((r) => r.id)).toEqual([
        'french-near',
        'thai-mid',
        'french-far',
      ]),
    )

    await user.click(screen.getByRole('button', { name: 'French' }))

    expect(screen.queryByText('Thai Mid')).not.toBeInTheDocument()
    expect(mockLastRestaurantListProps.current?.items.map((r) => r.id)).toEqual([
      'french-near',
      'french-far',
    ])
  })

  it('does not overwrite a stashed Distance preference when the visually-active Date segment is clicked while Distance is unselectable', async () => {
    writeSortPreference({
      criterion: 'distance',
      directions: { distance: 'nearest', date: 'newest' },
    })
    // mockGeolocate resolves null (the beforeEach default) — Distance stays unselectable and Date
    // renders as the active segment even though the persisted preference is still 'distance'.
    const user = userEvent.setup()
    render(<App />)
    await screen.findByText(/no places yet/i)
    const dateButton = screen.getByRole('button', { name: 'Date' })
    expect(dateButton).toHaveAttribute('aria-pressed', 'true')

    await user.click(dateButton)

    expect(readSortPreference()?.criterion).toBe('distance')
  })
})

describe('mobile "Filtres · N" pill and bottom sheet (U4)', () => {
  /** Scopes queries to the Modal panel, found via its "See results" button (R6 — disambiguates
   *  from the desktop overlay's own FilterBar/SortBar, which stay mounted underneath the sheet;
   *  the sheet carries no title/heading of its own — see the design revision note in App.tsx). */
  function sheetPanel() {
    const seeResults = screen.getByRole('button', { name: /see results/i })
    const panel = seeResults.closest('[class*="rounded-t-card"]')
    if (!panel) throw new Error('Modal panel not found')
    return within(panel as HTMLElement)
  }

  it('stacks above the mobile List/Map nav (z-[1100]) when open, so the sheet is never hidden underneath it', async () => {
    const user = userEvent.setup()
    await createRestaurant({ id: 'r1', name: 'R1 Place', lat: 1, lng: 1, cuisine: 'French' })

    render(<App />)
    await screen.findByText('R1 Place')
    await user.click(screen.getByRole('button', { name: 'Filters · 0' }))

    const overlay = screen
      .getByRole('button', { name: /see results/i })
      .closest('[class*="fixed inset-0"]')
    expect(overlay).toHaveClass('z-[var(--z-modal)]')
  })

  it('hides FilterBar and SortBar from the mobile inline flow without unmounting them (R4) — both stay under a `hidden md:block` wrapper', async () => {
    await createRestaurant({ id: 'r1', name: 'R1 Place', lat: 1, lng: 1, cuisine: 'French' })

    render(<App />)
    await screen.findByText('R1 Place')

    const filterWrapper = screen
      .getByRole('button', { name: 'French' })
      .closest('[class*="md:fixed"]')
    expect(filterWrapper).toHaveClass('hidden', 'md:block')

    const sortWrapper = screen.getByRole('button', { name: 'Date' }).closest('[class*="md:block"]')
    expect(sortWrapper).toHaveClass('hidden', 'md:block')
  })

  it('puts the safe-area bottom clearance on the scrollable list box, not on <aside> itself, so the list has no dead gap above the bottom nav (the pill floats over it, fixed-positioned, needing no flow space)', async () => {
    await createRestaurant({ id: 'r1', name: 'R1 Place', lat: 1, lng: 1, cuisine: 'French' })

    render(<App />)
    const restaurantRow = await screen.findByText('R1 Place')

    const asideEl = restaurantRow.closest('aside')
    expect(asideEl).not.toHaveClass('pb-[var(--safe-area-floating-offset)]')

    const scrollBox = restaurantRow.closest('[class*="overflow-y-auto"]')
    expect(scrollBox).toHaveClass(
      'overflow-y-auto',
      'pb-[var(--safe-area-floating-offset)]',
      'md:pb-0',
    )
  })

  it('does not put a safe-area bottom clearance on <main> either, so the map fills it fully with no dead gap above the bottom nav', () => {
    render(<App />)
    const mainEl = screen.getByRole('button', { name: /center on my location/i }).closest('main')
    expect(mainEl).not.toHaveClass('pb-[var(--safe-area-floating-offset)]')
  })

  it('does not render the pill when the restaurant list is empty', async () => {
    render(<App />)
    await screen.findByText(/no places yet/i)

    expect(screen.queryByRole('button', { name: /^filters ·/i })).not.toBeInTheDocument()
  })

  it('renders the pill in the list pane and, independently after switching views, in the map pane — same styling both times', async () => {
    const user = userEvent.setup()
    await createRestaurant({ id: 'r1', name: 'R1 Place', lat: 1, lng: 1, cuisine: 'French' })

    render(<App />)
    await screen.findByText('R1 Place')

    const listPill = screen.getByRole('button', { name: 'Filters · 0' })
    expect(listPill).toHaveClass('fixed', 'md:hidden', 'rounded-full', 'bg-brand')
    const listPillClassName = listPill.className

    await user.click(screen.getByRole('button', { name: /^map$/i }))

    // Exactly one pill mounted at a time — the list pane's is gone, the map pane's has replaced it.
    const mapPills = screen.getAllByRole('button', { name: 'Filters · 0' })
    expect(mapPills).toHaveLength(1)
    expect(mapPills[0].className).toBe(listPillClassName)
  })

  it("updates the pill's count to match activeFilterCount as a filter is toggled (KTD5)", async () => {
    const user = userEvent.setup()
    await createRestaurant({ id: 'r1', name: 'R1 Place', lat: 1, lng: 1, cuisine: 'French' })

    render(<App />)
    await screen.findByText('R1 Place')
    expect(screen.getByRole('button', { name: 'Filters · 0' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'French' }))

    expect(screen.getByRole('button', { name: 'Filters · 1' })).toBeInTheDocument()
  })

  it('opens the bottom sheet with FilterBar and SortBar when the pill is tapped, and Escape closes it back to the same (list) pane', async () => {
    const user = userEvent.setup()
    await createRestaurant({ id: 'r1', name: 'R1 Place', lat: 1, lng: 1, cuisine: 'French' })

    render(<App />)
    await screen.findByText('R1 Place')

    await user.click(screen.getByRole('button', { name: 'Filters · 0' }))

    const sheet = sheetPanel()
    expect(sheet.getByRole('button', { name: 'French' })).toBeInTheDocument()
    expect(sheet.getByRole('button', { name: 'Date' })).toBeInTheDocument()
    expect(sheet.getByRole('button', { name: 'Distance' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^list$/i })).toHaveAttribute('aria-pressed', 'true')

    await user.keyboard('{Escape}')

    expect(screen.queryByRole('button', { name: /see results/i })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^list$/i })).toHaveAttribute('aria-pressed', 'true')
  })

  it('focuses the panel itself on open, not a filter-mutating control (R6 bug fix — no ModalHeader means the first focusable descendant is otherwise "Clear all" or the first cuisine chip)', async () => {
    const user = userEvent.setup()
    await createRestaurant({ id: 'r1', name: 'R1 Place', lat: 1, lng: 1, cuisine: 'French' })
    // Activate a filter first so "Clear all" is rendered — the more dangerous of the two
    // possible auto-focus targets this test guards against (it would wipe the active filter).
    render(<App />)
    await screen.findByText('R1 Place')
    await user.click(screen.getByRole('button', { name: 'French' }))

    await user.click(screen.getByRole('button', { name: 'Filters · 1' }))

    const sheet = sheetPanel()
    expect(sheet.queryByRole('button', { name: 'French' })).not.toHaveFocus()
    expect(sheet.queryByRole('button', { name: 'Clear all' })).not.toHaveFocus()
    // Filter must still be active — a reflexive Enter/Space right after open must not have fired.
    expect(screen.getByRole('button', { name: 'Filters · 1' })).toBeInTheDocument()
  })

  it('keeps the "See results" button reachable outside the scrollable filter/sort content, so it cannot scroll out of view (bug fix)', async () => {
    const user = userEvent.setup()
    await createRestaurant({ id: 'r1', name: 'R1 Place', lat: 1, lng: 1, cuisine: 'French' })

    render(<App />)
    await screen.findByText('R1 Place')
    await user.click(screen.getByRole('button', { name: 'Filters · 0' }))

    const seeResults = screen.getByRole('button', { name: /see results/i })
    const scrollBox = seeResults
      .closest('[class*="rounded-t-card"]')
      ?.querySelector('.overflow-y-auto')
    expect(seeResults).toHaveClass('shrink-0')
    expect(scrollBox).not.toBeNull()
    expect(scrollBox?.contains(seeResults)).toBe(false)
  })

  it('renders no title bar, no divider under SortBar, and a "See results" button that closes the sheet (design revision)', async () => {
    const user = userEvent.setup()
    await createRestaurant({ id: 'r1', name: 'R1 Place', lat: 1, lng: 1, cuisine: 'French' })

    render(<App />)
    await screen.findByText('R1 Place')
    await user.click(screen.getByRole('button', { name: 'Filters · 0' }))

    const sheet = sheetPanel()
    expect(sheet.queryByRole('heading')).not.toBeInTheDocument()
    const sortWrapper = sheet.getByRole('button', { name: 'Date' }).closest('div')
    expect(sortWrapper).not.toHaveClass('border-b')

    await user.click(sheet.getByRole('button', { name: /see results/i }))
    expect(screen.queryByRole('button', { name: /see results/i })).not.toBeInTheDocument()
  })

  it('opens the bottom sheet from the map pane too, and its "See results" button returns to the same (map) pane', async () => {
    const user = userEvent.setup()
    await createRestaurant({ id: 'r1', name: 'R1 Place', lat: 1, lng: 1, cuisine: 'French' })

    render(<App />)
    await screen.findByText('R1 Place')
    await user.click(screen.getByRole('button', { name: /^map$/i }))

    await user.click(screen.getByRole('button', { name: 'Filters · 0' }))
    const sheet = sheetPanel()

    await user.click(sheet.getByRole('button', { name: /see results/i }))

    expect(screen.queryByRole('button', { name: /see results/i })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^map$/i })).toHaveAttribute('aria-pressed', 'true')
  })

  it('applies a filter toggled inside the sheet to the restaurant list behind it, once the sheet closes (R6)', async () => {
    const user = userEvent.setup()
    await createRestaurant({
      id: 'french',
      name: 'French Place',
      lat: 1,
      lng: 1,
      cuisine: 'French',
    })
    await createRestaurant({ id: 'thai', name: 'Thai Place', lat: 2, lng: 2, cuisine: 'Thai' })

    render(<App />)
    await screen.findByText('French Place')
    expect(screen.getByText('Thai Place')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Filters · 0' }))
    const sheet = sheetPanel()
    await user.click(sheet.getByRole('button', { name: 'French' }))
    await user.click(sheet.getByRole('button', { name: /see results/i }))

    expect(screen.queryByRole('button', { name: /see results/i })).not.toBeInTheDocument()
    expect(screen.getByText('French Place')).toBeInTheDocument()
    expect(screen.queryByText('Thai Place')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Filters · 1' })).toBeInTheDocument()
  })
})

// U4 — the header in each of the three backend outcomes (R4, R6, R21, R30). Presence and
// reachability are read as two separate signals (KD3), so these tests drive them independently
// rather than through a single boolean.
describe('backend availability in the header (U4)', () => {
  const ABSENT: BackendStatus = { presence: { status: 'absent' }, reachability: 'unknown' }
  const CONFIGURED_UNREACHABLE: BackendStatus = {
    presence: { status: 'configured', pocketbaseUrl: 'https://pb.example.test' },
    reachability: 'unreachable',
  }
  const CONFIGURED_UNKNOWN: BackendStatus = {
    presence: { status: 'configured', pocketbaseUrl: 'https://pb.example.test' },
    reachability: 'unknown',
  }
  const UNAVAILABLE: BackendStatus = {
    presence: { status: 'unavailable', reason: 'configuration request failed (404)' },
    reachability: 'unknown',
  }

  const signInButton = () => screen.queryByRole('button', { name: /sign in|se connecter/i })
  const settingsButton = () => screen.queryByRole('button', { name: /settings|paramètres/i })
  const indicator = () => screen.queryByRole('status', { name: /unreachable|injoignable/i })

  it('never renders the Sign in control with no backend configured, and keeps Settings reachable (R4, R21)', async () => {
    mockUseBackendStatus.mockReturnValue(ABSENT)
    render(<App />)
    await screen.findByText(/no places yet/i)

    expect(signInButton()).not.toBeInTheDocument()
    expect(settingsButton()).toBeInTheDocument()
  })

  it('opens Settings in a local-only build, with no backend at all (R21)', async () => {
    mockUseBackendStatus.mockReturnValue(ABSENT)
    const user = userEvent.setup()
    render(<App />)
    await screen.findByText(/no places yet/i)

    await user.click(settingsButton() as HTMLElement)
    expect(screen.getByRole('heading', { name: 'Settings' })).toBeInTheDocument()
  })

  it('keeps sign-in available and reports the backend as unreachable, rather than as local-only (R6, KD7)', async () => {
    mockUseBackendStatus.mockReturnValue(CONFIGURED_UNREACHABLE)
    render(<App />)
    await screen.findByText(/no places yet/i)

    expect(signInButton()).toBeInTheDocument()
    expect(indicator()).toBeInTheDocument()
  })

  it('renders the Sign in control active when the address is known but unreachable — retrying can work', async () => {
    const signInMock = vi.fn()
    mockUseAuth.mockReturnValue({
      signedIn: false,
      email: null,
      avatarUrl: null,
      signIn: signInMock,
      signOut: vi.fn(),
    })
    mockUseBackendStatus.mockReturnValue(CONFIGURED_UNREACHABLE)
    const user = userEvent.setup()
    render(<App />)
    await screen.findByText(/no places yet/i)

    const button = signInButton() as HTMLElement
    expect(button).toBeEnabled()
    await user.click(button)
    expect(signInMock).toHaveBeenCalled()
  })

  it('renders the Sign in control present but disabled when the configuration itself could not be read (KTD9)', async () => {
    const signInMock = vi.fn()
    mockUseAuth.mockReturnValue({
      signedIn: false,
      email: null,
      avatarUrl: null,
      signIn: signInMock,
      signOut: vi.fn(),
    })
    mockUseBackendStatus.mockReturnValue(UNAVAILABLE)
    render(<App />)
    await screen.findByText(/no places yet/i)

    const button = signInButton() as HTMLElement
    expect(button).toBeDisabled()
    // No authentication window can be opened from it: there is no address to open one against.
    fireEvent.click(button)
    expect(signInMock).not.toHaveBeenCalled()
    expect(settingsButton()).toBeInTheDocument()
  })

  it('renders no indicator at all while reachability is still unknown (KD3)', async () => {
    mockUseBackendStatus.mockReturnValue(CONFIGURED_UNKNOWN)
    render(<App />)
    await screen.findByText(/no places yet/i)

    expect(indicator()).not.toBeInTheDocument()
    expect(signInButton()).toBeInTheDocument()
  })

  it('renders no unreachable indicator in local-only — an absent backend is not an outage (R30)', async () => {
    mockUseBackendStatus.mockReturnValue(ABSENT)
    render(<App />)
    await screen.findByText(/no places yet/i)

    expect(indicator()).not.toBeInTheDocument()
  })

  it('matches today’s signed-out header exactly with a configured, reachable backend', async () => {
    mockUseBackendStatus.mockReturnValue(CONFIGURED_REACHABLE)
    render(<App />)
    await screen.findByText(/no places yet/i)

    expect(signInButton()).toBeInTheDocument()
    expect(signInButton()).toBeEnabled()
    expect(settingsButton()).toBeInTheDocument()
    expect(indicator()).not.toBeInTheDocument()
  })

  it('renders the account menu as it does today when signed in with a reachable backend', async () => {
    mockUseAuth.mockReturnValue({
      signedIn: true,
      email: 'person@example.com',
      avatarUrl: null,
      signIn: vi.fn(),
      signOut: vi.fn(),
    })
    mockUseBackendStatus.mockReturnValue(CONFIGURED_REACHABLE)
    render(<App />)
    await screen.findByText(/no places yet/i)

    expect(screen.getByRole('button', { name: /account menu|menu du compte/i })).toBeInTheDocument()
    expect(settingsButton()).not.toBeInTheDocument()
    expect(indicator()).not.toBeInTheDocument()
  })

  it('clears the stored session when presence is absent, leaving the stored restaurants untouched', async () => {
    const signOutMock = vi.fn()
    mockUseAuth.mockReturnValue({
      signedIn: true,
      email: 'person@example.com',
      avatarUrl: null,
      signIn: vi.fn(),
      signOut: signOutMock,
    })
    mockUseBackendStatus.mockReturnValue(ABSENT)
    await createRestaurant({ id: 'r1', name: 'R1 Place', lat: 1, lng: 1, cuisine: 'French' })

    const { rerender } = render(<App />)
    await screen.findByText('R1 Place')
    await waitFor(() => expect(signOutMock).toHaveBeenCalled())

    // useAuth is mocked statically here (its own reactivity is covered by useAuth.test.ts), so
    // stand in for the re-render the real hook triggers once the auth store is cleared.
    mockUseAuth.mockReturnValue({
      signedIn: false,
      email: null,
      avatarUrl: null,
      signIn: vi.fn(),
      signOut: vi.fn(),
    })
    rerender(<App />)

    expect(
      screen.queryByRole('button', { name: /account menu|menu du compte/i }),
    ).not.toBeInTheDocument()
    expect(signInButton()).not.toBeInTheDocument()
    expect(settingsButton()).toBeInTheDocument()
    // Local data is retained by design — only the session goes.
    expect(screen.getByText('R1 Place')).toBeInTheDocument()
  })

  it('never lets the header indicator and the account status chip report opposite facts', async () => {
    mockUseAuth.mockReturnValue({
      signedIn: true,
      email: 'person@example.com',
      avatarUrl: null,
      signIn: vi.fn(),
      signOut: vi.fn(),
    })
    mockUseBackendStatus.mockReturnValue(CONFIGURED_UNREACHABLE)
    setSyncState('problem', 'server-unreachable')
    const user = userEvent.setup()
    render(<App />)
    await screen.findByText(/no places yet/i)

    expect(indicator()).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /account menu|menu du compte/i }))
    const menu = within(screen.getByRole('menu'))
    expect(menu.getByText("Can't reach the server")).toBeInTheDocument()
    expect(menu.queryByText(/all synced/i)).not.toBeInTheDocument()
  })

  it('makes no "all synced" backup claim once presence turns out to be absent', async () => {
    const signOutMock = vi.fn()
    mockUseAuth.mockReturnValue({
      signedIn: true,
      email: 'person@example.com',
      avatarUrl: null,
      signIn: vi.fn(),
      signOut: signOutMock,
    })
    mockUseBackendStatus.mockReturnValue(ABSENT)
    const { rerender } = render(<App />)
    await screen.findByText(/no places yet/i)
    await waitFor(() => expect(signOutMock).toHaveBeenCalled())

    mockUseAuth.mockReturnValue({
      signedIn: false,
      email: null,
      avatarUrl: null,
      signIn: vi.fn(),
      signOut: vi.fn(),
    })
    rerender(<App />)

    expect(screen.queryByText(/all synced/i)).not.toBeInTheDocument()
  })

  it('clears the indicator once a backend that started unreachable answers', async () => {
    mockUseBackendStatus.mockReturnValue(CONFIGURED_UNREACHABLE)
    const { rerender } = render(<App />)
    await screen.findByText(/no places yet/i)
    expect(indicator()).toBeInTheDocument()

    mockUseBackendStatus.mockReturnValue(CONFIGURED_REACHABLE)
    rerender(<App />)

    expect(indicator()).not.toBeInTheDocument()
  })

  it('exposes an accessible name on the indicator, whose visible label is hidden below the sm breakpoint', async () => {
    mockUseBackendStatus.mockReturnValue(CONFIGURED_UNREACHABLE)
    render(<App />)
    await screen.findByText(/no places yet/i)

    // The name has to survive the label being display:none on a phone — hence an explicit one
    // rather than relying on the pill's own text.
    const el = screen.getByRole('status', { name: 'Server unreachable' })

    // The gate sits on the label span itself, passed through Badge's `labelClassName`, so the
    // pill and its dot stay visible while only the words drop out below `sm`.
    const label = within(el).getByText('Server unreachable')
    expect(label).toHaveClass('hidden', 'sm:inline')
  })

  it('keeps the header within a 320px viewport with the indicator present', async () => {
    mockUseBackendStatus.mockReturnValue(CONFIGURED_UNREACHABLE)
    const originalWidth = window.innerWidth
    Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: 320 })
    try {
      render(<App />)
      await screen.findByText(/no places yet/i)

      // jsdom computes no layout, so the overflow bug fix documented in App.tsx is asserted
      // structurally instead: the left group stays the only shrink target, the right group stays
      // `shrink-0`, and the indicator neither shrinks it nor contributes a label at this width.
      const header = screen.getByRole('banner')
      const [left, right] = Array.from(header.children) as HTMLElement[]
      expect(left.className).toContain('min-w-0')
      expect(left.className).toContain('flex-1')
      expect(right.className).toContain('shrink-0')
      expect(right).toContainElement(indicator())
      expect((indicator() as HTMLElement).className).toContain('shrink-0')
      expect(settingsButton()).toBeInTheDocument()
    } finally {
      Object.defineProperty(window, 'innerWidth', {
        configurable: true,
        writable: true,
        value: originalWidth,
      })
    }
  })

  it('resolves the indicator copy in English', async () => {
    mockUseBackendStatus.mockReturnValue(CONFIGURED_UNREACHABLE)
    render(<App />)
    await screen.findByText(/no places yet/i)
    expect(screen.getByRole('status', { name: 'Server unreachable' })).toBeInTheDocument()
  })

  it('resolves the indicator copy in French', async () => {
    mockUseBackendStatus.mockReturnValue(CONFIGURED_UNREACHABLE)
    await act(async () => {
      await mockI18n.changeLanguage('fr')
    })
    render(<App />)
    await screen.findByText(/aucun lieu pour l'instant/i)
    expect(screen.getByRole('status', { name: 'Serveur injoignable' })).toBeInTheDocument()
  })
})
