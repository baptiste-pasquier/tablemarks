import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import { ToggleChip } from './ToggleChip'

describe('ToggleChip', () => {
  describe('shape="pill"', () => {
    it('applies the active pill classes (border-brand, bg-brand-soft, shadow-sm) matching FilterBar', () => {
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
        'border',
        'px-3',
        'py-1.5',
        'text-xs',
        'transition',
        'border-brand',
        'bg-brand-soft',
        'font-semibold',
        'text-brand-strong',
        'shadow-sm',
      )
    })

    it('applies the inactive pill classes (border-gray-300, hover states) matching FilterBar', () => {
      render(
        <ToggleChip shape="pill" active={false} onClick={vi.fn()}>
          Thai
        </ToggleChip>,
      )
      const button = screen.getByRole('button', { name: 'Thai' })
      expect(button).toHaveClass('border-gray-300', 'text-gray-600', 'hover:border-gray-400', 'hover:bg-gray-50')
      expect(button).not.toHaveClass('border-brand')
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
      expect(button).toHaveClass('min-h-10', 'px-3', 'py-1.5', 'text-xs', 'font-medium', 'transition')
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
      expect(button).toHaveClass('min-h-10', 'px-3', 'py-1.5', 'text-xs', 'font-medium', 'text-gray-300', 'cursor-not-allowed')
      expect(button).not.toHaveClass('transition', 'hover:bg-gray-50')
    })

    it('reflects active in aria-pressed regardless of disabled', () => {
      render(
        <ToggleChip shape="segment" active disabled onClick={vi.fn()}>
          Distance
        </ToggleChip>,
      )
      expect(screen.getByRole('button', { name: 'Distance' })).toHaveAttribute('aria-pressed', 'true')
    })

    it('merges a caller-supplied className (e.g. a divider) alongside the segment base classes', () => {
      render(
        <ToggleChip shape="segment" active={false} className="border-r border-gray-300" onClick={vi.fn()}>
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
