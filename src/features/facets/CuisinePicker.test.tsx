import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import { CuisinePicker } from './CuisinePicker'
import { mockI18n } from '../../test/setup'
import type { RankedCuisine } from './cuisineRanking'

function option(value: string, label: string, count = 0): RankedCuisine {
  return { key: value.toLowerCase(), value, label, count }
}

const OPTIONS = [
  option('french', 'French', 2),
  option('italian', 'Italian', 1),
  option('Ramen', 'Ramen', 1),
]

const TWELVE = [
  ['bakery', 'Bakery'],
  ['french', 'French'],
  ['coffee_shop', 'Café'],
  ['japanese', 'Japanese'],
  ['pizza', 'Pizza'],
  ['bar', 'Bar'],
  ['italian', 'Italian'],
  ['thai', 'Thai'],
  ['crepe', 'Crêperie'],
  ['greek', 'Greek'],
  ['lebanese', 'Lebanese'],
  ['african', 'African'],
].map(([value, label]) => option(value, label))

/** The category pills in the open picker (every option is a pressable toggle). */
function pills() {
  return within(screen.getByRole('group', { name: 'Categories' }))
    .getAllByRole('button')
    .filter((b) => b.hasAttribute('aria-pressed'))
}

describe('CuisinePicker', () => {
  it('shows the current category as its avatar and name, with no "Cuisine" label, closed', () => {
    render(<CuisinePicker value="French" options={OPTIONS} onChange={vi.fn()} />)

    const trigger = screen.getByRole('button', { name: 'Category: French' })
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    expect(within(trigger).getByText('🥖')).toHaveAttribute('aria-hidden', 'true')
    // French leads the France family, hue 245: the name wears the cuisine's own text color.
    expect(within(trigger).getByText('French').getAttribute('style')).toContain(
      'oklch(0.4 0.13 245)',
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

    expect(onChange).toHaveBeenCalledWith('italian')
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
    render(<CuisinePicker value={undefined} options={[option(long, long)]} onChange={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: 'Category: Uncategorized' }))

    expect(screen.getByText(long)).toHaveClass('truncate', 'min-w-0')
    expect(screen.getByRole('button', { name: new RegExp(long) })).toHaveClass('max-w-full')
  })
  it('opens on the top 8, reveals the rest behind "Show all", and folds back on close', async () => {
    const user = userEvent.setup()
    render(<CuisinePicker value={undefined} options={TWELVE} onChange={vi.fn()} />)
    const trigger = screen.getByRole('button', { name: 'Category: Uncategorized' })

    await user.click(trigger)
    expect(pills()).toHaveLength(8)
    const showAll = screen.getByRole('button', { name: 'Show all (4)' })
    expect(showAll).toHaveAttribute('aria-expanded', 'false')

    await user.click(showAll)
    expect(pills()).toHaveLength(12)
    expect(screen.getByRole('button', { name: 'Show less' })).toHaveAttribute(
      'aria-expanded',
      'true',
    )
    // "Other…" stays last.
    const group = screen.getByRole('group', { name: 'Categories' })
    expect(within(group).getAllByRole('button').at(-1)).toHaveTextContent('Other…')

    await user.click(trigger)
    await user.click(trigger)
    expect(pills()).toHaveLength(8)
  })

  it('keeps the chosen category visible and pressed even outside the top 8', async () => {
    const user = userEvent.setup()
    render(<CuisinePicker value="african" options={TWELVE} onChange={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: 'Category: African' }))
    expect(pills()).toHaveLength(8)
    expect(screen.getByRole('button', { name: /African/, pressed: true })).toBeInTheDocument()
  })

  it('shows the chosen category as selected when it is stored under a legacy name', async () => {
    const user = userEvent.setup()
    render(<CuisinePicker value="French" options={TWELVE} onChange={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: 'Category: French' }))
    expect(screen.getByRole('button', { name: /French/, pressed: true })).toBeInTheDocument()
  })

  it('stores the curated key when "Other…" names a known category, in either language', async () => {
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
    await user.type(screen.getByLabelText('Other category'), 'boulangerie{Enter}')
    expect(onChange).toHaveBeenLastCalledWith('bakery')

    await user.click(screen.getByRole('button', { name: 'Category: Uncategorized' }))
    await user.click(screen.getByRole('button', { name: 'Other…' }))
    await user.type(screen.getByLabelText('Other category'), 'Glacier')
    await user.click(screen.getByRole('button', { name: 'Elsewhere' }))
    expect(onChange).toHaveBeenLastCalledWith('ice_cream')
  })

  it('names the trigger in the display language', async () => {
    await act(async () => {
      await mockI18n.changeLanguage('fr')
    })
    render(<CuisinePicker value="bakery" options={TWELVE} onChange={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Catégorie : Boulangerie' })).toBeInTheDocument()
  })
})
