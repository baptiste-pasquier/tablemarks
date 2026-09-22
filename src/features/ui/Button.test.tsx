import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import { Button } from './Button'

describe('Button', () => {
  it('renders its children and forwards onClick', async () => {
    const onClick = vi.fn()
    render(
      <Button variant="primary" onClick={onClick}>
        Go
      </Button>,
    )
    const user = userEvent.setup()

    const button = screen.getByRole('button', { name: 'Go' })
    await user.click(button)
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('applies the brand-background class for the primary variant', () => {
    render(<Button variant="primary">Go</Button>)
    expect(screen.getByRole('button', { name: 'Go' })).toHaveClass('bg-brand')
    expect(screen.getByRole('button', { name: 'Go' })).toHaveClass('rounded-full', 'shadow-brand')
  })

  it('fills the danger variant red, never with the brand color, so an irreversible action reads apart', () => {
    render(<Button variant="danger">Delete</Button>)
    const button = screen.getByRole('button', { name: 'Delete' })
    expect(button).toHaveClass('rounded-full', 'bg-red-600', 'text-white', 'disabled:opacity-50')
    expect(button).not.toHaveClass('bg-brand')
  })

  it('inverts the primary action for the brand band: a white pill with brand-strong text', () => {
    render(<Button variant="on-brand">Go</Button>)
    const button = screen.getByRole('button', { name: 'Go' })
    expect(button).toHaveClass('rounded-full', 'bg-white', 'text-brand-strong', 'font-bold')
    expect(button).not.toHaveClass('bg-brand')
  })

  it('draws the secondary action on the brand band as translucent white glass inside a white edge', () => {
    render(<Button variant="on-brand-glass">Go</Button>)
    const button = screen.getByRole('button', { name: 'Go' })
    expect(button).toHaveClass('rounded-full', 'bg-white/20', 'text-white', 'ring-inset')
  })

  it('draws a band icon as glass on a phone and as a white chip once it floats over the map on desktop', () => {
    render(
      <Button variant="band-icon" aria-label="Settings">
        ⚙
      </Button>,
    )
    const button = screen.getByRole('button', { name: 'Settings' })
    expect(button).toHaveClass('h-9', 'w-9', 'bg-white/20', 'text-white')
    expect(button).toHaveClass('md:bg-white', 'md:text-gray-900', 'md:shadow-chip')
  })

  it('draws the secondary variant as a white pill lifted by shadow, not a bordered one', () => {
    render(<Button variant="secondary">Go</Button>)
    const button = screen.getByRole('button', { name: 'Go' })
    expect(button).toHaveClass('rounded-full', 'bg-white', 'shadow-chip')
    // It sits on the gray canvas, where a white fill separates it; a border would be a second
    // edge drawn around the one the shadow already gives it.
    expect(button).not.toHaveClass('border', 'border-gray-300')
  })

  it('defaults the secondary variant to text-sm', () => {
    render(<Button variant="secondary">Go</Button>)
    expect(screen.getByRole('button', { name: 'Go' })).toHaveClass('text-sm')
  })

  it('renders the secondary variant at text-xs when size="xs" is requested', () => {
    render(
      <Button variant="secondary" size="xs">
        Go
      </Button>,
    )
    const button = screen.getByRole('button', { name: 'Go' })
    expect(button).toHaveClass('text-xs')
    expect(button).not.toHaveClass('text-sm')
  })

  it('applies the shared disabled treatment when disabled', () => {
    render(
      <Button variant="primary" disabled>
        Go
      </Button>,
    )
    const button = screen.getByRole('button', { name: 'Go' })
    expect(button).toBeDisabled()
    expect(button).toHaveClass('disabled:opacity-50')
  })

  it('carries the canonical hover/active states on the primary variant regardless of call site', () => {
    render(<Button variant="primary">Go</Button>)
    expect(screen.getByRole('button', { name: 'Go' })).toHaveClass(
      'hover:bg-brand-strong',
      'active:bg-brand-strong',
    )
  })

  it('carries the canonical hover/active states on the secondary variant regardless of call site', () => {
    render(<Button variant="secondary">Go</Button>)
    expect(screen.getByRole('button', { name: 'Go' })).toHaveClass(
      'hover:bg-gray-50',
      'active:bg-gray-100',
    )
  })

  it('carries the canonical hover/active states on the icon-only secondary sizing too', () => {
    render(
      <Button variant="secondary" iconOnly aria-label="icon">
        ✕
      </Button>,
    )
    expect(screen.getByRole('button', { name: 'icon' })).toHaveClass(
      'hover:bg-gray-50',
      'active:bg-gray-100',
    )
  })

  it('merges a caller-supplied className alongside the variant base classes', () => {
    render(
      <Button variant="primary" className="w-full">
        Go
      </Button>,
    )
    const button = screen.getByRole('button', { name: 'Go' })
    expect(button).toHaveClass('w-full')
    expect(button).toHaveClass('bg-brand')
  })

  it('applies the brand-underline classes for the link variant', () => {
    render(<Button variant="link">Go</Button>)
    expect(screen.getByRole('button', { name: 'Go' })).toHaveClass('text-brand-strong', 'underline')
  })

  it('defaults the link variant to text-sm', () => {
    render(<Button variant="link">Go</Button>)
    expect(screen.getByRole('button', { name: 'Go' })).toHaveClass('text-sm')
  })

  it('renders the link variant at text-xs when size="xs" is requested', () => {
    render(
      <Button variant="link" size="xs">
        Go
      </Button>,
    )
    const button = screen.getByRole('button', { name: 'Go' })
    expect(button).toHaveClass('text-xs')
    expect(button).not.toHaveClass('text-sm')
  })

  it('merges a caller-supplied className alongside the link variant base classes', () => {
    render(
      <Button variant="link" className="mt-1">
        Go
      </Button>,
    )
    const button = screen.getByRole('button', { name: 'Go' })
    expect(button).toHaveClass('mt-1')
    expect(button).toHaveClass('text-brand-strong')
  })

  it('applies only the neutral hover class for the icon-dismiss variant with tone="neutral"', () => {
    render(
      <Button variant="icon-dismiss" tone="neutral" aria-label="Close">
        ✕
      </Button>,
    )
    const button = screen.getByRole('button', { name: 'Close' })
    expect(button).toHaveClass('hover:text-gray-600')
    expect(button).not.toHaveClass('hover:text-red-600')
    expect(button).not.toHaveClass('hover:text-white')
  })

  it('applies only the destructive hover class for the icon-dismiss variant with tone="destructive"', () => {
    render(
      <Button variant="icon-dismiss" tone="destructive" aria-label="Delete">
        ✕
      </Button>,
    )
    const button = screen.getByRole('button', { name: 'Delete' })
    expect(button).toHaveClass('hover:text-red-600')
    expect(button).not.toHaveClass('hover:text-gray-600')
    expect(button).not.toHaveClass('hover:text-white')
  })

  it('applies only the toast hover/active classes for the icon-dismiss variant with tone="toast"', () => {
    render(
      <Button variant="icon-dismiss" tone="toast" aria-label="Dismiss">
        ✕
      </Button>,
    )
    const button = screen.getByRole('button', { name: 'Dismiss' })
    expect(button).toHaveClass('hover:text-white', 'active:text-white')
    expect(button).not.toHaveClass('hover:text-gray-600')
    expect(button).not.toHaveClass('hover:text-red-600')
  })

  it('merges a caller-supplied className alongside the icon-dismiss tone base classes', () => {
    render(
      <Button variant="icon-dismiss" tone="toast" className="rounded-full p-1" aria-label="Dismiss">
        ✕
      </Button>,
    )
    const button = screen.getByRole('button', { name: 'Dismiss' })
    expect(button).toHaveClass('rounded-full', 'p-1')
    expect(button).toHaveClass('hover:text-white')
  })

  it('forwards onClick for the icon-dismiss variant', async () => {
    const onClick = vi.fn()
    render(
      <Button variant="icon-dismiss" tone="neutral" onClick={onClick} aria-label="Close">
        ✕
      </Button>,
    )
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Close' }))
    expect(onClick).toHaveBeenCalledTimes(1)
  })
})
