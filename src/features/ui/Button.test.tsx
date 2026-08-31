import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import { Button } from './Button'

describe('Button', () => {
  it('renders its children and forwards onClick', async () => {
    const onClick = vi.fn()
    render(<Button variant="primary" onClick={onClick}>Go</Button>)
    const user = userEvent.setup()

    const button = screen.getByRole('button', { name: 'Go' })
    await user.click(button)
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('applies the brand-background class for the primary variant', () => {
    render(<Button variant="primary">Go</Button>)
    expect(screen.getByRole('button', { name: 'Go' })).toHaveClass('bg-brand')
  })

  it('applies the pill/border class for the secondary variant', () => {
    render(<Button variant="secondary">Go</Button>)
    expect(screen.getByRole('button', { name: 'Go' })).toHaveClass('rounded-full', 'border-gray-300')
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
    expect(screen.getByRole('button', { name: 'Go' })).toHaveClass('hover:bg-brand-strong', 'active:bg-brand-strong')
  })

  it('carries the canonical hover/active states on the secondary variant regardless of call site', () => {
    render(<Button variant="secondary">Go</Button>)
    expect(screen.getByRole('button', { name: 'Go' })).toHaveClass('hover:bg-gray-100', 'active:bg-gray-200')
  })

  it('carries the canonical hover/active states on the icon-only secondary sizing too', () => {
    render(
      <Button variant="secondary" iconOnly aria-label="icon">
        ✕
      </Button>,
    )
    expect(screen.getByRole('button', { name: 'icon' })).toHaveClass('hover:bg-gray-100', 'active:bg-gray-200')
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
    expect(screen.getByRole('button', { name: 'Go' })).toHaveClass('text-brand', 'underline')
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
    expect(button).toHaveClass('text-brand')
  })
})
