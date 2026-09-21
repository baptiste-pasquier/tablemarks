import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { StatusBadge } from './StatusBadge'
import { translateStatus, translateVerdict } from '../types/models'

const base = { pending: false, visitCount: 0, latestVerdict: null } as const

describe('StatusBadge', () => {
  it('renders a status as a pastel gray pill, not a solid one', () => {
    render(<StatusBadge restaurant={base} />)
    const badge = screen.getByText(translateStatus('to_try')).parentElement as HTMLElement
    expect(badge).not.toHaveClass('text-white')
    expect(badge.getAttribute('style')).toContain('var(--color-gray-100)')
  })

  it('renders a verdict as a solid pill with white text, so shape tells them apart', () => {
    render(<StatusBadge restaurant={{ ...base, visitCount: 2, latestVerdict: 'go_back' }} />)
    const badge = screen.getByText(translateVerdict('go_back')).parentElement as HTMLElement
    expect(badge).toHaveClass('bg-verdict-go-back', 'text-white')
    expect(badge.getAttribute('style')).toBeNull()
  })
})
