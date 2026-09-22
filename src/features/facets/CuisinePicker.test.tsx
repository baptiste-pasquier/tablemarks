import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import { CuisinePicker } from './CuisinePicker'

const OPTIONS = ['French', 'Italian', 'Ramen']

describe('CuisinePicker', () => {
  it('shows the current category as its avatar and name, with no "Cuisine" label, closed', () => {
    render(<CuisinePicker value="French" options={OPTIONS} onChange={vi.fn()} />)

    const trigger = screen.getByRole('button', { name: 'Category: French' })
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    expect(within(trigger).getByText('🥖')).toHaveAttribute('aria-hidden', 'true')
    // French is hue 249 on the wheel: the name wears the cuisine's own text color.
    expect(within(trigger).getByText('French').getAttribute('style')).toContain(
      'oklch(0.4 0.13 249)',
    )
    expect(screen.queryByText(/^cuisine$/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('group')).not.toBeInTheDocument()
  })

  it('reads as uncategorized with nothing chosen, and invites a choice', () => {
    render(<CuisinePicker value={undefined} options={OPTIONS} onChange={vi.fn()} />)

    const trigger = screen.getByRole('button', { name: 'Category: Uncategorized' })
    expect(within(trigger).getByText('Uncategorized')).toBeInTheDocument()
    expect(within(trigger).getByText('Choose')).toBeInTheDocument()
  })

  it('opens onto every option, the chosen one pressed, and reports a pick then closes', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<CuisinePicker value="French" options={OPTIONS} onChange={onChange} />)

    await user.click(screen.getByRole('button', { name: 'Category: French' }))
    const group = screen.getByRole('group', { name: 'Categories' })
    expect(within(group).getByRole('button', { name: /French/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(within(group).getByRole('button', { name: /Italian/ })).toHaveAttribute(
      'aria-pressed',
      'false',
    )

    await user.click(within(group).getByRole('button', { name: /Italian/ }))

    expect(onChange).toHaveBeenCalledWith('Italian')
    expect(screen.queryByRole('group')).not.toBeInTheDocument()
  })

  it('clears the category when the chosen option is picked again', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<CuisinePicker value="French" options={OPTIONS} onChange={onChange} />)

    await user.click(screen.getByRole('button', { name: 'Category: French' }))
    await user.click(screen.getByRole('button', { name: /French/, pressed: true }))

    expect(onChange).toHaveBeenCalledWith(undefined)
  })

  it('takes a free-typed category through "Other…", on Enter or on OK', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<CuisinePicker value={undefined} options={OPTIONS} onChange={onChange} />)

    await user.click(screen.getByRole('button', { name: 'Category: Uncategorized' }))
    await user.click(screen.getByRole('button', { name: 'Other…' }))
    await user.type(screen.getByLabelText('Other category'), '  Ethiopian  {Enter}')

    expect(onChange).toHaveBeenCalledWith('Ethiopian')
    expect(screen.queryByRole('group')).not.toBeInTheDocument()
  })

  it('ignores an empty free-typed category', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<CuisinePicker value={undefined} options={OPTIONS} onChange={onChange} />)

    await user.click(screen.getByRole('button', { name: 'Category: Uncategorized' }))
    await user.click(screen.getByRole('button', { name: 'Other…' }))
    await user.click(screen.getByRole('button', { name: 'OK' }))

    expect(onChange).not.toHaveBeenCalled()
  })

  it('keeps a free-typed category when focus leaves the picker without OK', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(
      <>
        <CuisinePicker value={undefined} options={OPTIONS} onChange={onChange} />
        <button type="button">Elsewhere</button>
      </>,
    )

    await user.click(screen.getByRole('button', { name: 'Category: Uncategorized' }))
    await user.click(screen.getByRole('button', { name: 'Other…' }))
    await user.type(screen.getByLabelText('Other category'), 'Ethiopian')
    await user.click(screen.getByRole('button', { name: 'Elsewhere' }))

    expect(onChange).toHaveBeenCalledWith('Ethiopian')
  })

  it('drops the draft when closed from its own trigger, and reopens clean', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<CuisinePicker value={undefined} options={OPTIONS} onChange={onChange} />)

    await user.click(screen.getByRole('button', { name: 'Category: Uncategorized' }))
    await user.click(screen.getByRole('button', { name: 'Other…' }))
    await user.type(screen.getByLabelText('Other category'), 'Eth')
    await user.click(screen.getByRole('button', { name: 'Category: Uncategorized' }))
    await user.click(screen.getByRole('button', { name: 'Category: Uncategorized' }))

    expect(onChange).not.toHaveBeenCalled()
    expect(screen.queryByLabelText('Other category')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Other…' })).toBeInTheDocument()
  })

  it('does not take Enter while an input method is still composing', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<CuisinePicker value={undefined} options={OPTIONS} onChange={onChange} />)

    await user.click(screen.getByRole('button', { name: 'Category: Uncategorized' }))
    await user.click(screen.getByRole('button', { name: 'Other…' }))
    const input = screen.getByLabelText('Other category')
    fireEvent.change(input, { target: { value: 'らーめん' } })
    fireEvent.keyDown(input, { key: 'Enter', isComposing: true })

    expect(onChange).not.toHaveBeenCalled()
  })

  it('truncates a long option name rather than letting its pill overflow the modal', async () => {
    const user = userEvent.setup()
    const long = 'Traditional Lyonnaise bouchon with a very long name'
    render(<CuisinePicker value={undefined} options={[long]} onChange={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: 'Category: Uncategorized' }))

    expect(screen.getByText(long)).toHaveClass('truncate', 'min-w-0')
    expect(screen.getByRole('button', { name: new RegExp(long) })).toHaveClass('max-w-full')
  })
})
