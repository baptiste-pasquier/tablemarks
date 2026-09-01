import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { freshDB } from './test/idb'
import { createMockLeafletMap } from './test/mockLeafletMap'
import { useAuth } from './auth/useAuth'
import { createRestaurant } from './data/restaurants'
import { readSortPreference, writeSortPreference } from './lib/sortPreference'
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
// RestaurantList wrapper above — is how the prop-plumbing is asserted.
const mockLastMapViewProps: { current: { fallbackCenter?: GeoPoint | null } | null } = {
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
    MapContainer: ({ children }: { children?: React.ReactNode }) => <div data-testid="map">{children}</div>,
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
  mockUseAuth.mockReturnValue({ signedIn: false, email: null, signIn: vi.fn(), signOut: vi.fn() })
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
    await waitFor(() => expect(mockLastMapViewProps.current?.fallbackCenter).toEqual({ lat: 2, lng: 2 }))

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
    expect(whereToEat.compareDocumentPosition(cuisineChip) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(cuisineChip.compareDocumentPosition(restaurantRow) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('does not float a visible white card over the map when there are no restaurants yet (FilterBar renders nothing, but the measurement wrapper must stay mounted)', () => {
    const { container } = render(<App />)

    const overlayWrapper = Array.from(container.querySelectorAll('div')).find((el) =>
      el.className.includes('md:top-[var(--filter-overlay-top)]'),
    )
    expect(overlayWrapper).toBeDefined()
    expect(overlayWrapper?.className).not.toMatch(/md:bg-white|md:shadow-lg|md:border-gray-200|md:rounded-2xl/)
    expect(overlayWrapper?.textContent).toBe('')
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

    /** App.tsx now runs the same measurement effect (`useMeasuredHeightVar`) for both the header
     *  and the filter overlay, so `instances` holds one FakeResizeObserver per target — find the
     *  overlay's by which element it actually observed, rather than assuming array order. */
    function overlayObserver(container: HTMLElement) {
      const overlayEl = Array.from(container.querySelectorAll('div')).find((el) =>
        el.className.includes('md:top-[var(--filter-overlay-top)]'),
      )
      const observer = instances.find((o) => !!overlayEl && o.observed.includes(overlayEl))
      if (!observer) throw new Error('overlay ResizeObserver instance not found')
      return observer
    }

    it("writes the filter overlay's measured height to --filter-overlay-height, and updates it when the overlay resizes (e.g. the cuisine row's \"+N autres\" expanding it)", async () => {
      await createRestaurant({ id: 'r1', name: 'R1 Place', lat: 1, lng: 1, cuisine: 'French' })

      const { container } = render(<App />)
      await screen.findByText('R1 Place')

      expect(document.documentElement.style.getPropertyValue('--filter-overlay-height')).toBe('120px')

      // The real callback reads the size straight off the entry the browser already computed
      // (`entry.borderBoxSize[0].blockSize`), rather than re-querying getBoundingClientRect — so
      // the fake resize notification has to carry that shape too, matching the real API.
      mockOverlayHeight = 260
      const entry = {
        borderBoxSize: [{ blockSize: mockOverlayHeight, inlineSize: 0 }],
      } as unknown as ResizeObserverEntry
      const observer = overlayObserver(container)
      observer.callback([entry], observer as unknown as ResizeObserver)

      expect(document.documentElement.style.getPropertyValue('--filter-overlay-height')).toBe('260px')
    })

    it("also writes the header's measured height to --header-height, independently of the filter overlay (fixes the top/left gap mismatch)", async () => {
      await createRestaurant({ id: 'r1', name: 'R1 Place', lat: 1, lng: 1, cuisine: 'French' })

      render(<App />)
      await screen.findByText('R1 Place')

      expect(document.documentElement.style.getPropertyValue('--header-height')).toBe('120px')
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
    await createRestaurant({ id: 'near', name: 'Near Place', lat: 0, lng: 0.001, cuisine: 'French' })
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
    writeSortPreference({ criterion: 'distance', directions: { distance: 'nearest', date: 'newest' } })
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
    writeSortPreference({ criterion: 'distance', directions: { distance: 'nearest', date: 'newest' } })
    await createRestaurant({ id: 'french-near', name: 'French Near', lat: 0, lng: 0.001, cuisine: 'French' })
    await createRestaurant({ id: 'thai-mid', name: 'Thai Mid', lat: 0, lng: 0.5, cuisine: 'Thai' })
    await createRestaurant({ id: 'french-far', name: 'French Far', lat: 0, lng: 1, cuisine: 'French' })
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
    expect(mockLastRestaurantListProps.current?.items.map((r) => r.id)).toEqual(['french-near', 'french-far'])
  })

  it('does not overwrite a stashed Distance preference when the visually-active Date segment is clicked while Distance is unselectable', async () => {
    writeSortPreference({ criterion: 'distance', directions: { distance: 'nearest', date: 'newest' } })
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
    const panel = seeResults.closest('[class*="rounded-t-2xl"]')
    if (!panel) throw new Error('Modal panel not found')
    return within(panel as HTMLElement)
  }

  it('hides FilterBar and SortBar from the mobile inline flow without unmounting them (R4) — both stay under a `hidden md:block` wrapper', async () => {
    await createRestaurant({ id: 'r1', name: 'R1 Place', lat: 1, lng: 1, cuisine: 'French' })

    render(<App />)
    await screen.findByText('R1 Place')

    const filterWrapper = screen.getByRole('button', { name: 'French' }).closest('[class*="md:fixed"]')
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
    expect(scrollBox).toHaveClass('overflow-y-auto', 'pb-[var(--safe-area-floating-offset)]', 'md:pb-0')
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
    await createRestaurant({ id: 'french', name: 'French Place', lat: 1, lng: 1, cuisine: 'French' })
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
