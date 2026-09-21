import { render, screen, within } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { Badge } from './Badge'

describe('Badge', () => {
  it('renders tone mode with the given Tailwind class, shared sizing, and fixed white text', () => {
    render(<Badge text="Go back" tone="bg-verdict-go-back" icon="🎉" />)

    const label = screen.getByText('Go back')
    const badge = label.parentElement as HTMLElement
    expect(badge).toHaveClass('bg-verdict-go-back')
    expect(badge).toHaveClass(
      'rounded-full',
      'px-2',
      'py-0.5',
      'text-[11px]',
      'font-semibold',
      'text-white',
    )
    expect(within(badge).getByText('🎉')).toHaveAttribute('aria-hidden', 'true')
  })

  it('renders pastel mode with the given background/text pair at the same sizing', () => {
    render(
      <Badge
        text="Thai"
        pastel={{ background: 'oklch(0.96 0.045 281)', color: 'oklch(0.4 0.13 281)' }}
        icon="🍜"
      />,
    )

    const label = screen.getByText('Thai')
    const badge = label.parentElement as HTMLElement
    expect(badge).toHaveClass('rounded-full', 'px-2', 'py-0.5', 'text-[11px]', 'font-semibold')
    expect(badge).not.toHaveClass('text-white')
    expect(badge.getAttribute('style')).toContain('oklch(0.96 0.045 281)')
    expect(badge.getAttribute('style')).toContain('oklch(0.4 0.13 281)')
    expect(within(badge).getByText('🍜')).toHaveAttribute('aria-hidden', 'true')
  })

  it('renders without an icon element when none is given', () => {
    render(<Badge text="To try" tone="bg-verdict-once" />)
    const label = screen.getByText('To try')
    expect(label.parentElement?.children.length).toBe(1)
  })
})
