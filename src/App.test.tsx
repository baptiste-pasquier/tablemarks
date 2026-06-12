import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { freshDB } from './test/idb'

// Leaflet needs real DOM dimensions jsdom doesn't provide; stub the map for the shell test.
vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }: { children?: React.ReactNode }) => <div data-testid="map">{children}</div>,
  TileLayer: () => null,
  Marker: () => null,
  Popup: () => null,
}))

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
