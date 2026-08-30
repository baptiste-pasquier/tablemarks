import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import { FilterBar } from './FilterBar'
import { emptyFilter } from './filter'
import { mockI18n } from '../../test/setup'
import type { Restaurant } from '../../types/models'

function r(over: Partial<Restaurant> & Pick<Restaurant, 'id'>): Restaurant {
  return {
    name: 'R',
    lat: 1,
    lng: 2,
    pending: false,
    latestVerdict: null,
    latestVisitDate: null,
    visitCount: 0,
    updated: '1',
    deleted: false,
    ...over,
  }
}

const PLACES = [r({ id: 'a', cuisine: 'Thai' }), r({ id: 'b', cuisine: 'Indian' }), r({ id: 'c' })]

describe('FilterBar', () => {
  it('toggles a cuisine into the filter when its chip is clicked', async () => {
    const onChange = vi.fn()
    render(<FilterBar restaurants={PLACES} filter={emptyFilter()} onChange={onChange} />)

    await userEvent.click(screen.getByRole('button', { name: 'Thai' }))

    expect(onChange).toHaveBeenCalledTimes(1)
    // Stored lowercased so matching is O(1) and case-insensitive.
    expect([...onChange.mock.calls[0][0].cuisines]).toEqual(['thai'])
  })

  it('toggles a status into the filter when its chip is clicked', async () => {
    const onChange = vi.fn()
    render(<FilterBar restaurants={PLACES} filter={emptyFilter()} onChange={onChange} />)

    await userEvent.click(screen.getByRole('button', { name: 'To try' }))

    expect([...onChange.mock.calls[0][0].statuses]).toEqual(['to_try'])
  })

  it('toggles a verdict into the filter when its chip is clicked', async () => {
    const onChange = vi.fn()
    render(<FilterBar restaurants={PLACES} filter={emptyFilter()} onChange={onChange} />)

    await userEvent.click(screen.getByRole('button', { name: 'Go back' }))

    expect([...onChange.mock.calls[0][0].verdicts]).toEqual(['go_back'])
  })

  it('renders one chip for the same cuisine typed in different cases, toggled lowercase', async () => {
    const onChange = vi.fn()
    const mixed = [r({ id: 'a', cuisine: 'Thai' }), r({ id: 'b', cuisine: 'thai' })]
    render(<FilterBar restaurants={mixed} filter={emptyFilter()} onChange={onChange} />)

    const chips = screen.getAllByRole('button', { name: /thai/i })
    expect(chips).toHaveLength(1)
    await userEvent.click(chips[0])
    expect([...onChange.mock.calls[0][0].cuisines]).toEqual(['thai'])
  })

  it('offers an Uncategorized chip when some place has no cuisine', () => {
    render(<FilterBar restaurants={PLACES} filter={emptyFilter()} onChange={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Uncategorized' })).toBeInTheDocument()
  })

  it('marks the active selection as pressed and clears all filters', async () => {
    const onChange = vi.fn()
    const filter = { ...emptyFilter(), cuisines: new Set(['thai']) }
    render(<FilterBar restaurants={PLACES} filter={filter} onChange={onChange} />)

    expect(screen.getByRole('button', { name: 'Thai' })).toHaveAttribute('aria-pressed', 'true')

    await userEvent.click(screen.getByRole('button', { name: /clear all/i }))
    const next = onChange.mock.calls[0][0]
    expect(next.cuisines.size).toBe(0)
    expect(next.statuses.size).toBe(0)
    expect(next.verdicts.size).toBe(0)
  })

  it('renders nothing when there are no places', () => {
    const { container } = render(<FilterBar restaurants={[]} filter={emptyFilter()} onChange={vi.fn()} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders the cuisine and status/verdict groups under separate labels with a divider', () => {
    render(<FilterBar restaurants={PLACES} filter={emptyFilter()} onChange={vi.fn()} />)
    expect(screen.getByText('Cuisine')).toBeInTheDocument()
    expect(screen.getByText('Status & verdict')).toBeInTheDocument()
  })

  it('shows the status/verdict heading and overflow toggle in French when the active language is French, and only in English otherwise (R1)', async () => {
    const { rerender } = render(<FilterBar restaurants={PLACES} filter={emptyFilter()} onChange={vi.fn()} />)
    expect(screen.getByText('Status & verdict')).toBeInTheDocument()
    expect(screen.queryByText('Statut & verdict')).not.toBeInTheDocument()

    await mockI18n.changeLanguage('fr')
    rerender(<FilterBar restaurants={PLACES} filter={emptyFilter()} onChange={vi.fn()} />)
    expect(screen.getByText('Statut & verdict')).toBeInTheDocument()
    expect(screen.queryByText('Status & verdict')).not.toBeInTheDocument()

    await mockI18n.changeLanguage('en')
  })

  it('shows each cuisine chip with its emoji as a separate aria-hidden element from the label', () => {
    render(<FilterBar restaurants={PLACES} filter={emptyFilter()} onChange={vi.fn()} />)
    const chip = screen.getByRole('button', { name: 'Thai' })
    expect(within(chip).getByText('🍜')).toHaveAttribute('aria-hidden', 'true')
  })

  it('shows each verdict chip with its own icon and keeps the fixed best-to-worst order', () => {
    render(<FilterBar restaurants={PLACES} filter={emptyFilter()} onChange={vi.fn()} />)
    const verdictIcons: Record<string, string> = {
      'Go back': '↩️',
      'Worth a detour': '🧭',
      'Once was enough': '🤷',
      'Never again': '🚫',
    }
    const group = screen.getByText('Status & verdict').parentElement as HTMLElement
    const buttons = Object.keys(verdictIcons).map((label) => within(group).getByRole('button', { name: label }))
    const order = buttons.map((b) => within(group).getAllByRole('button').indexOf(b))
    expect(order).toEqual([...order].sort((a, b) => a - b))
    for (const [label, icon] of Object.entries(verdictIcons)) {
      expect(within(screen.getByRole('button', { name: label })).getByText(icon)).toHaveAttribute(
        'aria-hidden',
        'true',
      )
    }
  })

  it('collapses cuisines beyond 6 behind a "+N more" control, expandable via "Collapse"', async () => {
    const many = ['Thai', 'Indian', 'French', 'Italian', 'Japanese', 'Chinese', 'Mexican'].map((cuisine, i) =>
      r({ id: `p${i}`, cuisine }),
    )
    render(<FilterBar restaurants={many} filter={emptyFilter()} onChange={vi.fn()} />)

    // All 7 cuisines have one restaurant each, so the tie-break is alphabetical: "Thai" (last
    // alphabetically) is the one bumped into overflow.
    const toggle = screen.getByRole('button', { name: '+1 more' })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('button', { name: 'Thai' })).not.toBeInTheDocument()

    await userEvent.click(toggle)
    const collapseButton = screen.getByRole('button', { name: 'Collapse' })
    expect(collapseButton).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('button', { name: 'Thai' })).toBeInTheDocument()
    // Same button across the toggle (KTD6) — it keeps focus rather than being unmounted/remounted.
    expect(collapseButton).toBe(toggle)
    expect(collapseButton).toHaveFocus()
  })

  it('does not render a "+N more" control with 6 or fewer cuisines present', () => {
    const six = ['Thai', 'Indian', 'French', 'Italian', 'Japanese', 'Chinese'].map((cuisine, i) =>
      r({ id: `p${i}`, cuisine }),
    )
    render(<FilterBar restaurants={six} filter={emptyFilter()} onChange={vi.fn()} />)
    expect(screen.queryByRole('button', { name: /more/i })).not.toBeInTheDocument()
  })

  it('keeps an active cuisine outside the top 6 pinned into the default (collapsed) row', () => {
    // 7 distinct cuisines: 6 with 2 restaurants each (ranked ahead), "Ethiopian" with 1 (ranked 7th).
    const restaurants = [
      ...['Thai', 'Indian', 'French', 'Italian', 'Japanese', 'Chinese'].flatMap((cuisine, i) => [
        r({ id: `a${i}`, cuisine }),
        r({ id: `b${i}`, cuisine }),
      ]),
      r({ id: 'e', cuisine: 'Ethiopian' }),
    ]
    const filter = { ...emptyFilter(), cuisines: new Set(['ethiopian']) }
    render(<FilterBar restaurants={restaurants} filter={filter} onChange={vi.fn()} />)

    expect(screen.getByRole('button', { name: 'Ethiopian' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: '+1 more' })).toBeInTheDocument()
  })

  it('grows the default row past 6 when more than 6 cuisines are simultaneously active', () => {
    const cuisines = ['Thai', 'Indian', 'French', 'Italian', 'Japanese', 'Chinese', 'Mexican']
    const restaurants = cuisines.map((cuisine, i) => r({ id: `p${i}`, cuisine }))
    const filter = { ...emptyFilter(), cuisines: new Set(cuisines.map((c) => c.toLowerCase())) }
    render(<FilterBar restaurants={restaurants} filter={filter} onChange={vi.fn()} />)

    for (const cuisine of cuisines) {
      expect(screen.getByRole('button', { name: cuisine })).toHaveAttribute('aria-pressed', 'true')
    }
    expect(screen.queryByRole('button', { name: /more/i })).not.toBeInTheDocument()
  })

  it('reflows the default row immediately when a pinned, off-top-6 active cuisine is deselected', () => {
    const restaurants = [
      ...['Thai', 'Indian', 'French', 'Italian', 'Japanese', 'Chinese'].flatMap((cuisine, i) => [
        r({ id: `a${i}`, cuisine }),
        r({ id: `b${i}`, cuisine }),
      ]),
      r({ id: 'e', cuisine: 'Ethiopian' }),
    ]
    const withPinned = { ...emptyFilter(), cuisines: new Set(['ethiopian']) }
    const { rerender } = render(<FilterBar restaurants={restaurants} filter={withPinned} onChange={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Ethiopian' })).toBeInTheDocument()

    rerender(<FilterBar restaurants={restaurants} filter={emptyFilter()} onChange={vi.fn()} />)
    expect(screen.queryByRole('button', { name: 'Ethiopian' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '+1 more' })).toBeInTheDocument()
  })
})
