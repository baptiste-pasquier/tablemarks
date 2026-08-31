import { render, screen, within } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { Badge } from './Badge'

describe('Badge', () => {
  it('renders tone mode with the given Tailwind class, shared sizing, and fixed white text', () => {
    render(<Badge text="Go back" tone="bg-verdict-go-back" icon="🎉" />)

    const label = screen.getByText('Go back')
    const badge = label.parentElement as HTMLElement
    expect(badge).toHaveClass('bg-verdict-go-back')
    expect(badge).toHaveClass('rounded-full', 'px-2', 'py-0.5', 'text-[11px]', 'font-semibold', 'text-white')
    expect(within(badge).getByText('🎉')).toHaveAttribute('aria-hidden', 'true')
  })

  it('renders color mode with the given inline background at the same sizing', () => {
    render(<Badge text="Thai" color="#7c3aed" icon="🍜" />)

    const label = screen.getByText('Thai')
    const badge = label.parentElement as HTMLElement
    expect(badge).toHaveClass('rounded-full', 'px-2', 'py-0.5', 'text-[11px]', 'font-semibold')
    expect(badge).toHaveStyle({ background: '#7c3aed' })
  })

  it('picks white text for a low-luminance color, matching the luminance rule used across the app', () => {
    render(<Badge text="Thai" color="#7c3aed" />)
    expect(screen.getByText('Thai').parentElement).toHaveStyle({ color: '#ffffff' })
  })

  it('picks near-black text for a high-luminance color, matching the luminance rule used across the app', () => {
    render(<Badge text="Mexican" color="#ca8a04" />)
    expect(screen.getByText('Mexican').parentElement).toHaveStyle({ color: '#000000' })
  })

  it('renders without an icon element when none is given', () => {
    render(<Badge text="To try" tone="bg-verdict-neutral" />)
    const label = screen.getByText('To try')
    expect(label.parentElement?.children.length).toBe(1)
  })
})
