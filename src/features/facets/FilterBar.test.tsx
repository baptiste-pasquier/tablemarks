import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import { FilterBar } from './FilterBar'
import { emptyFilter } from './filter'
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
    expect([...onChange.mock.calls[0][0].cuisines]).toEqual(['Thai'])
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

  it('offers an Uncategorized chip when some place has no cuisine', () => {
    render(<FilterBar restaurants={PLACES} filter={emptyFilter()} onChange={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Uncategorized' })).toBeInTheDocument()
  })

  it('marks the active selection as pressed and clears all filters', async () => {
    const onChange = vi.fn()
    const filter = { ...emptyFilter(), cuisines: new Set(['Thai']) }
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
})
