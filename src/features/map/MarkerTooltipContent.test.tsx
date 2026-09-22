import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { MarkerTooltipContent } from './MarkerTooltipContent'
import type { MapMarker } from './markers'

function marker(over: Partial<MapMarker> = {}): MapMarker {
  return {
    id: 'm',
    lat: 48.8566,
    lng: 2.3522,
    name: 'Kodawari Ramen',
    pending: false,
    visitCount: 2,
    latestVerdict: 'worth_a_detour',
    cuisine: 'Japanese',
    color: '#333333',
    dimmed: false,
    ...over,
  }
}

const NEARBY = { lat: 48.8566, lng: 2.3622 }

describe('MarkerTooltipContent', () => {
  it('puts the status and the distance on one row, under the name', () => {
    render(<MarkerTooltipContent marker={marker()} currentPosition={NEARBY} />)

    const status = screen.getByText('Worth a detour').parentElement as HTMLElement
    const distance = screen.getByText('732 m')
    expect(status.parentElement).toBe(distance.parentElement)
    expect(screen.getByText('Kodawari Ramen').parentElement).not.toBe(status.parentElement)
    expect(distance.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
  })

  it('shows no distance when the current position is unknown', () => {
    render(<MarkerTooltipContent marker={marker()} currentPosition={null} />)
    expect(screen.queryByText(/\d+ m$/)).not.toBeInTheDocument()
  })

  it('sets the cuisine in its own text color beside a decorative emoji, then the visit count', () => {
    render(<MarkerTooltipContent marker={marker()} currentPosition={null} />)

    const cuisine = screen.getByText('Japanese')
    // Japanese is hue 313 on the wheel.
    expect(cuisine.getAttribute('style')).toContain('oklch(0.4 0.13 313)')
    expect(screen.getByText('🍣')).toHaveAttribute('aria-hidden', 'true')
    expect(cuisine.parentElement).toBe(screen.getByText('2 visits').parentElement)
  })

  it('draws no separator when a to-try place has no visit count to separate from', () => {
    render(
      <MarkerTooltipContent
        marker={marker({ visitCount: 0, latestVerdict: null, cuisine: undefined })}
        currentPosition={null}
      />,
    )

    expect(screen.getByText('To try')).toBeInTheDocument()
    expect(screen.getByText('Uncategorized')).toBeInTheDocument()
    expect(screen.getByText('🍽️')).toBeInTheDocument()
    expect(screen.queryByText('·')).not.toBeInTheDocument()
  })
})
