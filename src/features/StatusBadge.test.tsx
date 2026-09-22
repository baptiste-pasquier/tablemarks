import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { StatusBadge } from './StatusBadge'
import { VERDICTS, translatePending, translateStatus, translateVerdict } from '../types/models'

const base = { pending: false, visitCount: 0, latestVerdict: null } as const

describe('StatusBadge', () => {
  it('renders a status as a pastel gray pill, not a solid one', () => {
    render(<StatusBadge restaurant={base} />)
    const badge = screen.getByText(translateStatus('to_try')).parentElement as HTMLElement
    expect(badge).not.toHaveClass('text-white')
    expect(badge.getAttribute('style')).toContain('var(--color-gray-200)')
  })

  it('renders a verdict as a solid pill with white text, so shape tells them apart', () => {
    render(<StatusBadge restaurant={{ ...base, visitCount: 2, latestVerdict: 'go_back' }} />)
    const badge = screen.getByText(translateVerdict('go_back')).parentElement as HTMLElement
    expect(badge).toHaveClass('bg-verdict-go-back', 'text-white')
    expect(badge.getAttribute('style')).toBeNull()
  })

  it('gives each status its own decorative icon, distinct from the other and from every verdict', () => {
    const drawn = new Set<string>()
    const cases = [
      [base, translateStatus('to_try')],
      [{ ...base, visitCount: 1 }, translateStatus('visited')],
    ] as const
    for (const [restaurant, label] of cases) {
      const { unmount } = render(<StatusBadge restaurant={restaurant} />)
      const icon = (screen.getByText(label).parentElement as HTMLElement).querySelector('svg')
      expect(icon).toHaveAttribute('aria-hidden', 'true')
      drawn.add((icon as SVGElement).outerHTML)
      unmount()
    }
    for (const v of VERDICTS) {
      const { unmount } = render(
        <StatusBadge restaurant={{ ...base, visitCount: 1, latestVerdict: v }} />,
      )
      drawn.add((screen.getByText(translateVerdict(v)).parentElement as HTMLElement).innerHTML)
      unmount()
    }
    expect(drawn.size).toBe(2 + VERDICTS.length)
  })

  it('draws no icon on the provisional "resolving" pill, which is not a status of the place', () => {
    render(<StatusBadge restaurant={{ ...base, pending: true }} />)
    const badge = screen.getByText(translatePending()).parentElement as HTMLElement
    expect(badge.querySelector('svg')).toBeNull()
  })
})
