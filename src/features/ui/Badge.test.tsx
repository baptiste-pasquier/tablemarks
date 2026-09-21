import { render, screen, within } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { Badge } from './Badge'

describe('Badge', () => {
  it('renders tone mode with the given surface and text classes at the shared sizing', () => {
    render(<Badge text="Go back" tone="bg-verdict-go-back text-white" icon="🎉" />)

    const label = screen.getByText('Go back')
    const badge = label.parentElement as HTMLElement
    expect(badge).toHaveClass('bg-verdict-go-back')
    expect(badge).toHaveClass(
      'rounded-full',
      'px-2.5',
      'py-1',
      'text-xs',
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
    expect(badge).toHaveClass('rounded-full', 'px-2.5', 'py-1', 'text-xs', 'font-semibold')
    expect(badge).not.toHaveClass('text-white')
    expect(badge.getAttribute('style')).toContain('oklch(0.96 0.045 281)')
    expect(badge.getAttribute('style')).toContain('oklch(0.4 0.13 281)')
    expect(within(badge).getByText('🍜')).toHaveAttribute('aria-hidden', 'true')
  })

  it('does not impose white text on a tone, so a light surface can pair with dark text', () => {
    render(<Badge text="Worth a detour" tone="bg-verdict-detour text-gray-900" />)

    const badge = screen.getByText('Worth a detour').parentElement as HTMLElement
    expect(badge).toHaveClass('bg-verdict-detour', 'text-gray-900')
    expect(badge).not.toHaveClass('text-white')
  })

  it('renders without an icon element when none is given', () => {
    render(<Badge text="To try" tone="bg-verdict-once" />)
    const label = screen.getByText('To try')
    expect(label.parentElement?.children.length).toBe(1)
  })
})
