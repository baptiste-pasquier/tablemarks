import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { Eyebrow } from './Eyebrow'

describe('Eyebrow', () => {
  it('renders its children with the shared eyebrow classes', () => {
    render(<Eyebrow>Language</Eyebrow>)

    const el = screen.getByText('Language')
    expect(el).toHaveClass(
      'text-xs',
      'font-semibold',
      'uppercase',
      'tracking-wide',
      'text-gray-600',
    )
  })

  it('renders a span by default', () => {
    render(<Eyebrow>Language</Eyebrow>)

    expect(screen.getByText('Language').tagName).toBe('SPAN')
  })

  it('renders the given tag with the same classes when "as" is provided', () => {
    render(<Eyebrow as="h3">Language</Eyebrow>)

    const el = screen.getByText('Language')
    expect(el.tagName).toBe('H3')
    expect(el).toHaveClass(
      'text-xs',
      'font-semibold',
      'uppercase',
      'tracking-wide',
      'text-gray-600',
    )
  })
})
