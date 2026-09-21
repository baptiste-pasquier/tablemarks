import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import { ToggleChip } from './ToggleChip'

describe('ToggleChip', () => {
  describe('shape="pill"', () => {
    it('fills the active pill with solid brand and white text, so a selection is findable', () => {
      render(
        <ToggleChip shape="pill" active onClick={vi.fn()}>
          Thai
        </ToggleChip>,
      )
      const button = screen.getByRole('button', { name: 'Thai' })
      expect(button).toHaveClass(
        'inline-flex',
        'min-h-10',
        'items-center',
        'gap-1.5',
        'rounded-full',
        'px-3',
        'py-1.5',
        'text-xs',
        'transition',
        'bg-brand',
        'font-semibold',
        'text-white',
        'shadow-chip',
      )
      expect(button).not.toHaveClass('border', 'border-brand')
      // The pastel fill it replaced put brand text at 4.09:1 on brand-soft, under the AA floor.
      expect(button).not.toHaveClass('bg-brand-soft')
    })

    it('lets a caller replace the brand fill, so a chip can wear what it filters for', () => {
      render(
        <ToggleChip shape="pill" active activeTone="bg-verdict-detour text-white" onClick={vi.fn()}>
          Worth a detour
        </ToggleChip>,
      )
      const button = screen.getByRole('button', { name: 'Worth a detour' })
      expect(button).toHaveClass('bg-verdict-detour', 'text-white', 'font-semibold', 'shadow-chip')
      expect(button).not.toHaveClass('bg-brand')
    })

    it('ignores activeTone while inactive, which keeps the unselected row uniform', () => {
      render(
        <ToggleChip
          shape="pill"
          active={false}
          activeTone="bg-verdict-detour text-white"
          onClick={vi.fn()}
        >
          Worth a detour
        </ToggleChip>,
      )
      const button = screen.getByRole('button', { name: 'Worth a detour' })
      expect(button).toHaveClass('bg-white', 'text-gray-700', 'shadow-chip')
      expect(button).not.toHaveClass('bg-verdict-detour')
    })

    it('separates an inactive pill by relief, not by a gray fill', () => {
      render(
        <ToggleChip shape="pill" active={false} onClick={vi.fn()}>
          Thai
        </ToggleChip>,
      )
      const button = screen.getByRole('button', { name: 'Thai' })
      expect(button).toHaveClass('bg-white', 'text-gray-700', 'shadow-chip', 'hover:bg-gray-50')
      // `shadow-chip`, not `shadow-sm`: a chip is small enough to lose its edge to a soft shadow.
      expect(button).not.toHaveClass('bg-gray-200', 'shadow-sm', 'border', 'border-gray-300')
    })

    it('reflects active in aria-pressed', () => {
      render(
        <ToggleChip shape="pill" active onClick={vi.fn()}>
          Thai
        </ToggleChip>,
      )
      expect(screen.getByRole('button', { name: 'Thai' })).toHaveAttribute('aria-pressed', 'true')
    })

    it('invokes onClick when clicked', async () => {
      const onClick = vi.fn()
      render(
        <ToggleChip shape="pill" active={false} onClick={onClick}>
          Thai
        </ToggleChip>,
      )
      await userEvent.click(screen.getByRole('button', { name: 'Thai' }))
      expect(onClick).toHaveBeenCalledOnce()
    })
  })

  describe('shape="segment"', () => {
    it('applies the active segment classes (bg-brand-soft, text-brand-strong) matching SortBar, without pill chrome', () => {
      render(
        <ToggleChip shape="segment" active onClick={vi.fn()}>
          Distance
        </ToggleChip>,
      )
      const button = screen.getByRole('button', { name: 'Distance' })
      expect(button).toHaveClass(
        'min-h-10',
        'px-3',
        'py-1.5',
        'text-xs',
        'font-medium',
        'transition',
      )
      expect(button).toHaveClass('bg-brand-soft', 'font-semibold', 'text-brand-strong')
      expect(button).not.toHaveClass('rounded-full', 'border', 'border-gray-300')
    })

    it('applies the inactive segment classes (text-gray-600, hover:bg-gray-50) matching SortBar', () => {
      render(
        <ToggleChip shape="segment" active={false} onClick={vi.fn()}>
          Date
        </ToggleChip>,
      )
      const button = screen.getByRole('button', { name: 'Date' })
      expect(button).toHaveClass('text-gray-600', 'hover:bg-gray-50')
      expect(button).not.toHaveClass('bg-brand-soft')
    })

    it('applies the disabled segment classes (text-gray-300, cursor-not-allowed) and disables the button', () => {
      render(
        <ToggleChip shape="segment" active={false} disabled onClick={vi.fn()}>
          Distance
        </ToggleChip>,
      )
      const button = screen.getByRole('button', { name: 'Distance' })
      expect(button).toBeDisabled()
      expect(button).toHaveClass(
        'min-h-10',
        'px-3',
        'py-1.5',
        'text-xs',
        'font-medium',
        'text-gray-300',
        'cursor-not-allowed',
      )
      expect(button).not.toHaveClass('transition', 'hover:bg-gray-50')
    })

    it('reflects active in aria-pressed regardless of disabled', () => {
      render(
        <ToggleChip shape="segment" active disabled onClick={vi.fn()}>
          Distance
        </ToggleChip>,
      )
      expect(screen.getByRole('button', { name: 'Distance' })).toHaveAttribute(
        'aria-pressed',
        'true',
      )
    })

    it('merges a caller-supplied className (e.g. a divider) alongside the segment base classes', () => {
      render(
        <ToggleChip
          shape="segment"
          active={false}
          className="border-r border-gray-300"
          onClick={vi.fn()}
        >
          Distance
        </ToggleChip>,
      )
      const button = screen.getByRole('button', { name: 'Distance' })
      expect(button).toHaveClass('border-r', 'border-gray-300')
      expect(button).toHaveClass('min-h-10', 'text-xs')
    })

    it('does not invoke onClick when disabled', async () => {
      const onClick = vi.fn()
      render(
        <ToggleChip shape="segment" active={false} disabled onClick={onClick}>
          Distance
        </ToggleChip>,
      )
      await userEvent.click(screen.getByRole('button', { name: 'Distance' }))
      expect(onClick).not.toHaveBeenCalled()
    })
  })
})
