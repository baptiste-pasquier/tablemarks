import { act, render, screen, within } from '@testing-library/react'
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

  it('counts a category that names nothing ("_") as uncategorized, so its place stays reachable', () => {
    const places = [r({ id: 'a', cuisine: 'thai' }), r({ id: 'b', cuisine: '_' })]
    render(<FilterBar restaurants={places} filter={emptyFilter()} onChange={vi.fn()} />)
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
    const { container } = render(
      <FilterBar restaurants={[]} filter={emptyFilter()} onChange={vi.fn()} />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('renders the cuisine and status/verdict groups under separate labels', () => {
    render(<FilterBar restaurants={PLACES} filter={emptyFilter()} onChange={vi.fn()} />)
    expect(screen.getByText('Category')).toBeInTheDocument()
    expect(screen.getByText('Status & verdict')).toBeInTheDocument()
  })

  it('shows the status/verdict heading and overflow toggle in French when the active language is French, and only in English otherwise (R1)', async () => {
    const { rerender } = render(
      <FilterBar restaurants={PLACES} filter={emptyFilter()} onChange={vi.fn()} />,
    )
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
    const labels = ['Go back', 'Worth a detour', 'Once was enough', 'Never again']
    const group = screen.getByText('Status & verdict').parentElement as HTMLElement
    const buttons = labels.map((label) => within(group).getByRole('button', { name: label }))
    const order = buttons.map((b) => within(group).getAllByRole('button').indexOf(b))
    expect(order).toEqual([...order].sort((a, b) => a - b))

    // Each chip draws its own icon, and no two verdicts share one. The glyphs are hidden from
    // assistive tech, so the accessible name above stays the label alone.
    const drawn = buttons.map((b) => {
      const icon = b.querySelector('svg')
      expect(icon).not.toBeNull()
      expect(icon).toHaveAttribute('aria-hidden', 'true')
      return (icon as SVGElement).outerHTML
    })
    expect(new Set(drawn).size).toBe(labels.length)
  })

  it('dresses a selected chip in what it filters for, not all of them in the brand color', () => {
    const filter = {
      cuisines: new Set(['thai']),
      statuses: new Set(['to_try'] as const),
      verdicts: new Set(['worth_a_detour'] as const),
    }
    render(<FilterBar restaurants={PLACES} filter={filter} onChange={vi.fn()} />)

    // A verdict chip borrows the verdict's own fill -- four identical brand-colored pills would say
    // nothing about which verdict is selected.
    expect(screen.getByRole('button', { name: 'Worth a detour' })).toHaveClass(
      'bg-verdict-detour',
      'text-white',
    )
    expect(screen.getByRole('button', { name: 'To try' })).toHaveClass(
      'bg-gray-200',
      'text-gray-700',
    )
    // A cuisine wears the color its markers wear on the map (Thai is Asia's fourth member, hue 290 at half chroma).
    const thai = screen.getByRole('button', { name: /Thai/ })
    expect(thai.getAttribute('style')).toContain('oklch(0.48 0.075 290)')
    expect(thai).toHaveClass('text-white')
    expect(thai).not.toHaveClass('bg-brand')

    // An unselected verdict must not leak its color -- only the selected one is filled.
    expect(screen.getByRole('button', { name: 'Never again' })).toHaveClass('bg-white')
    expect(screen.getByRole('button', { name: 'Never again' })).not.toHaveClass('bg-verdict-never')
  })

  it('draws a distinct decorative icon on each status chip, beside its label', () => {
    render(<FilterBar restaurants={PLACES} filter={emptyFilter()} onChange={vi.fn()} />)

    const icons = ['To try', 'Visited'].map((name) => {
      const icon = screen.getByRole('button', { name }).querySelector('svg')
      expect(icon).toHaveAttribute('aria-hidden', 'true')
      return (icon as SVGElement).outerHTML
    })
    expect(new Set(icons).size).toBe(2)
  })

  it('leads a cuisine chip with a larger emoji and no color dot', () => {
    render(<FilterBar restaurants={PLACES} filter={emptyFilter()} onChange={vi.fn()} />)

    const thai = screen.getByRole('button', { name: /Thai/ })
    const emoji = within(thai).getByText('🍜')
    expect(emoji).toHaveAttribute('aria-hidden', 'true')
    expect(emoji).toHaveClass('text-base')
    // The emoji alone names the cuisine at rest; the marker color arrives on selection.
    expect(thai.querySelectorAll('[aria-hidden="true"]')).toHaveLength(1)
    expect(thai.getAttribute('style')).toBeNull()
  })

  it('fills a selected "Visited" chip with the brand color, since no badge of its own exists to borrow', () => {
    const filter = { ...emptyFilter(), statuses: new Set(['visited'] as const) }
    render(<FilterBar restaurants={PLACES} filter={filter} onChange={vi.fn()} />)

    const visited = screen.getByRole('button', { name: 'Visited' })
    expect(visited).toHaveClass('bg-brand', 'text-white')
    expect(visited).not.toHaveClass('bg-gray-200')
  })

  it('collapses cuisines beyond 6 behind a "+N more" control, expandable via "Collapse"', async () => {
    const many = ['Thai', 'Indian', 'French', 'Italian', 'Japanese', 'Chinese', 'Mexican'].map(
      (cuisine, i) => r({ id: `p${i}`, cuisine }),
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

    expect(screen.getByRole('button', { name: 'Ethiopian' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
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

  it("renders the stacked wrapper classes by default, matching today's sidebar/sheet shape", () => {
    const { container } = render(
      <FilterBar restaurants={PLACES} filter={emptyFilter()} onChange={vi.fn()} />,
    )
    expect(container.firstChild).toHaveClass('space-y-2', 'border-b', 'border-gray-100', 'p-3')
    expect(container.firstChild).not.toHaveClass('flex', 'flex-wrap', 'items-start', 'gap-4')
  })

  it('renders each group as a label-left row beside its own wrapping chip box, when layout="inline"', () => {
    render(
      <FilterBar restaurants={PLACES} filter={emptyFilter()} onChange={vi.fn()} layout="inline" />,
    )
    const cuisineGroupRow = screen.getByText('Category').parentElement as HTMLElement
    const statusGroupRow = screen.getByText('Status & verdict').parentElement as HTMLElement

    expect(cuisineGroupRow).toHaveClass('flex', 'items-center', 'gap-3')
    expect(statusGroupRow).toHaveClass('flex', 'items-center', 'gap-3')
    // The two groups stack vertically as siblings under a plain wrapper, not nested inside one
    // shared side-by-side row.
    expect(cuisineGroupRow.parentElement).toBe(statusGroupRow.parentElement)
    expect(cuisineGroupRow.parentElement).not.toHaveClass('flex')

    // Each group's own chip box carries the wrapping, not the label-plus-chips row itself — so an
    // overflowing chip line stays aligned under the first chip rather than resetting flush-left
    // under the label.
    const cuisineChipsBox = screen.getByRole('button', { name: 'Thai' })
      .parentElement as HTMLElement
    expect(cuisineChipsBox).toHaveClass('flex', 'flex-wrap', 'min-w-0', 'flex-1')
    expect(cuisineChipsBox.parentElement).toBe(cuisineGroupRow)
  })

  it('renders no divider between the cuisine and status/verdict groups, under either layout', () => {
    const { rerender } = render(
      <FilterBar restaurants={PLACES} filter={emptyFilter()} onChange={vi.fn()} />,
    )
    expect(screen.getByText('Status & verdict').parentElement).not.toHaveClass('border-t')

    rerender(
      <FilterBar restaurants={PLACES} filter={emptyFilter()} onChange={vi.fn()} layout="inline" />,
    )
    expect(screen.getByText('Status & verdict').parentElement).not.toHaveClass('border-t')
  })

  it('toggles a cuisine into the filter under layout="inline" the same as under the default layout', async () => {
    const onChange = vi.fn()
    render(
      <FilterBar restaurants={PLACES} filter={emptyFilter()} onChange={onChange} layout="inline" />,
    )

    await userEvent.click(screen.getByRole('button', { name: 'Thai' }))

    expect(onChange).toHaveBeenCalledTimes(1)
    expect([...onChange.mock.calls[0][0].cuisines]).toEqual(['thai'])
  })

  it('marks the active selection as pressed under layout="inline"', () => {
    const filter = { ...emptyFilter(), cuisines: new Set(['thai']) }
    render(<FilterBar restaurants={PLACES} filter={filter} onChange={vi.fn()} layout="inline" />)
    expect(screen.getByRole('button', { name: 'Thai' })).toHaveAttribute('aria-pressed', 'true')
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
    const { rerender } = render(
      <FilterBar restaurants={restaurants} filter={withPinned} onChange={vi.fn()} />,
    )
    expect(screen.getByRole('button', { name: 'Ethiopian' })).toBeInTheDocument()

    rerender(<FilterBar restaurants={restaurants} filter={emptyFilter()} onChange={vi.fn()} />)
    expect(screen.queryByRole('button', { name: 'Ethiopian' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '+1 more' })).toBeInTheDocument()
  })

  it('folds legacy and translated names into one chip toggling the curated key', async () => {
    const onChange = vi.fn()
    const places = [
      r({ id: 'a', cuisine: 'French' }),
      r({ id: 'b', cuisine: 'french' }),
      r({ id: 'c', cuisine: 'Français' }),
    ]
    render(<FilterBar restaurants={places} filter={emptyFilter()} onChange={onChange} />)

    expect(screen.getAllByRole('button', { name: 'French' })).toHaveLength(1)
    expect(screen.queryByRole('button', { name: 'Français' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'French' }))
    expect([...onChange.mock.calls[0][0].cuisines]).toEqual(['french'])
  })

  it('relabels and re-sorts the chips when the language changes', async () => {
    const places = [r({ id: 'a', cuisine: 'greek' }), r({ id: 'b', cuisine: 'ice_cream' })]
    const { rerender } = render(
      <FilterBar restaurants={places} filter={emptyFilter()} onChange={vi.fn()} />,
    )
    const greek = screen.getByRole('button', { name: 'Greek' })
    const iceCream = screen.getByRole('button', { name: 'Ice cream' })
    expect(greek.compareDocumentPosition(iceCream) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()

    await act(async () => {
      await mockI18n.changeLanguage('fr')
    })
    rerender(<FilterBar restaurants={places} filter={emptyFilter()} onChange={vi.fn()} />)

    expect(screen.getByText('Catégorie')).toBeInTheDocument()
    const glacier = screen.getByRole('button', { name: 'Glacier' })
    const grec = screen.getByRole('button', { name: 'Grec' })
    expect(glacier.compareDocumentPosition(grec) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
})
