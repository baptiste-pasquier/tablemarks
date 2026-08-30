import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import { SortBar } from './SortBar'

describe('SortBar', () => {
  it('shows the Distance segment pressed and the distance-flavored direction label', () => {
    render(
      <SortBar
        criterion="distance"
        direction="nearest"
        distanceSelectable={true}
        onCriterionChange={vi.fn()}
        onDirectionToggle={vi.fn()}
      />,
    )

    expect(screen.getByRole('button', { name: 'Distance' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Date' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: 'Nearest first' })).toBeInTheDocument()
  })

  it('invokes the criterion-change callback with "date" when Date is clicked', async () => {
    const onCriterionChange = vi.fn()
    render(
      <SortBar
        criterion="distance"
        direction="nearest"
        distanceSelectable={true}
        onCriterionChange={onCriterionChange}
        onDirectionToggle={vi.fn()}
      />,
    )

    await userEvent.click(screen.getByRole('button', { name: 'Date' }))

    expect(onCriterionChange).toHaveBeenCalledExactlyOnceWith('date')
  })

  it('invokes the direction-toggle callback when the direction chip is clicked', async () => {
    const onDirectionToggle = vi.fn()
    render(
      <SortBar
        criterion="date"
        direction="newest"
        distanceSelectable={false}
        onCriterionChange={vi.fn()}
        onDirectionToggle={onDirectionToggle}
      />,
    )

    await userEvent.click(screen.getByRole('button', { name: 'Most recent first' }))

    expect(onDirectionToggle).toHaveBeenCalledOnce()
  })

  it('renders Distance disabled, not a normal clickable option, when no position is known', async () => {
    const onCriterionChange = vi.fn()
    render(
      <SortBar
        criterion="date"
        direction="newest"
        distanceSelectable={false}
        onCriterionChange={onCriterionChange}
        onDirectionToggle={vi.fn()}
      />,
    )

    const distanceButton = screen.getByRole('button', { name: 'Distance' })
    expect(distanceButton).toBeDisabled()

    await userEvent.click(distanceButton)
    expect(onCriterionChange).not.toHaveBeenCalled()
  })

  it('updates the Distance segment to enabled when it becomes selectable, without remounting', () => {
    const { rerender } = render(
      <SortBar
        criterion="date"
        direction="newest"
        distanceSelectable={false}
        onCriterionChange={vi.fn()}
        onDirectionToggle={vi.fn()}
      />,
    )
    expect(screen.getByRole('button', { name: 'Distance' })).toBeDisabled()

    rerender(
      <SortBar
        criterion="date"
        direction="newest"
        distanceSelectable={true}
        onCriterionChange={vi.fn()}
        onDirectionToggle={vi.fn()}
      />,
    )
    expect(screen.getByRole('button', { name: 'Distance' })).not.toBeDisabled()
  })

  it('exposes aria-pressed on both segmented buttons and the direction chip', () => {
    render(
      <SortBar
        criterion="distance"
        direction="farthest"
        distanceSelectable={true}
        onCriterionChange={vi.fn()}
        onDirectionToggle={vi.fn()}
      />,
    )

    expect(screen.getByRole('button', { name: 'Distance' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Date' })).toHaveAttribute('aria-pressed', 'false')
    // farthest is the reversed direction for Distance.
    expect(screen.getByRole('button', { name: 'Farthest first' })).toHaveAttribute('aria-pressed', 'true')
  })
})
