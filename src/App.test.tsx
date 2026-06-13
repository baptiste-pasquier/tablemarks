import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { freshDB } from './test/idb'

// Leaflet needs real DOM dimensions jsdom doesn't provide; stub the map for the shell test.
vi.mock('react-leaflet', () => {
  // Stable map instance — real react-leaflet's useMap() returns the same object across renders;
  // a fresh object each call would make effects keyed on `map` loop forever.
  const map = { setView: () => {}, getZoom: () => 12, getCenter: () => ({ lat: 0, lng: 0 }) }
  return {
    MapContainer: ({ children }: { children?: React.ReactNode }) => <div data-testid="map">{children}</div>,
    TileLayer: () => null,
    Marker: () => null,
    Popup: () => null,
    useMap: () => map,
    useMapEvents: () => null,
  }
})

import App from './App.tsx'

beforeEach(freshDB)

describe('App shell', () => {
  it('renders the app name and the empty list state', async () => {
    render(<App />)
    expect(screen.getByRole('heading', { name: 'Tablemarks' })).toBeInTheDocument()
    expect(await screen.findByText(/no places yet/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /add a place/i })).toBeInTheDocument()
  })
})
