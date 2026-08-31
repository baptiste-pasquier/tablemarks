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

  it('renders the direction chip at the same text-xs size and gray-600 color as its segment siblings', () => {
    render(
      <SortBar
        criterion="distance"
        direction="nearest"
        distanceSelectable={true}
        onCriterionChange={vi.fn()}
        onDirectionToggle={vi.fn()}
      />,
    )

    const button = screen.getByRole('button', { name: 'Nearest first' })
    expect(button).toHaveClass('text-xs', 'text-gray-600')
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

  it('renders the stacked (default) wrapper classes when layout is omitted', () => {
    const { container } = render(
      <SortBar
        criterion="distance"
        direction="nearest"
        distanceSelectable={true}
        onCriterionChange={vi.fn()}
        onDirectionToggle={vi.fn()}
      />,
    )

    expect(container.firstChild).toHaveClass('flex', 'flex-wrap', 'items-center', 'gap-2', 'border-b')
    expect(container.firstChild).not.toHaveClass('flex-nowrap')
  })

  it('renders the inline horizontal-flow wrapper classes when layout="inline"', () => {
    const { container } = render(
      <SortBar
        criterion="distance"
        direction="nearest"
        distanceSelectable={true}
        onCriterionChange={vi.fn()}
        onDirectionToggle={vi.fn()}
        layout="inline"
      />,
    )

    expect(container.firstChild).toHaveClass('flex', 'flex-nowrap', 'items-center', 'gap-2')
    expect(container.firstChild).not.toHaveClass('flex-wrap')
  })

  it('behaves identically to the default layout under layout="inline": criterion change and direction toggle callbacks fire', async () => {
    const onCriterionChange = vi.fn()
    const onDirectionToggle = vi.fn()
    render(
      <SortBar
        criterion="distance"
        direction="nearest"
        distanceSelectable={true}
        onCriterionChange={onCriterionChange}
        onDirectionToggle={onDirectionToggle}
        layout="inline"
      />,
    )

    await userEvent.click(screen.getByRole('button', { name: 'Date' }))
    expect(onCriterionChange).toHaveBeenCalledExactlyOnceWith('date')

    await userEvent.click(screen.getByRole('button', { name: 'Nearest first' }))
    expect(onDirectionToggle).toHaveBeenCalledOnce()
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
