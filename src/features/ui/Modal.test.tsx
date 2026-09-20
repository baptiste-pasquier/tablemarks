import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import { Modal } from './Modal'

function Harness({ onClose }: { onClose: () => void }) {
  return (
    <>
      <button type="button">Opener</button>
      <Modal onClose={onClose}>
        <button type="button">First</button>
        <button type="button">Last</button>
      </Modal>
    </>
  )
}

describe('Modal', () => {
  it('closes when the backdrop is clicked, but not when the panel content is clicked', async () => {
    const onClose = vi.fn()
    const user = userEvent.setup()
    const { container } = render(<Modal onClose={onClose}>Content</Modal>)

    await user.click(screen.getByText('Content'))
    expect(onClose).not.toHaveBeenCalled()

    await user.click(container.firstElementChild as Element)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('moves focus into the panel on open and closes on Escape', async () => {
    const onClose = vi.fn()
    render(<Harness onClose={onClose} />)

    expect(screen.getByRole('button', { name: 'First' })).toHaveFocus()

    await userEvent.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it("keeps the user's current focus across a re-render that passes a new onClose reference", () => {
    // Every real caller passes an inline arrow (a fresh function each render), matching App.tsx's
    // `onClose={() => setAdding(false)}`. The mount effect must not key off it, or an unrelated
    // parent re-render (map pan, background sync) would tear it down and steal focus back in.
    const { rerender } = render(
      <Modal onClose={() => {}}>
        <input aria-label="first" />
        <input aria-label="second" />
      </Modal>,
    )

    const second = screen.getByLabelText('second')
    second.focus()
    expect(second).toHaveFocus()

    rerender(
      <Modal onClose={() => {}}>
        <input aria-label="first" />
        <input aria-label="second" />
      </Modal>,
    )

    expect(second).toHaveFocus()
  })

  it('wraps focus from the last focusable element to the first on Tab', async () => {
    const onClose = vi.fn()
    render(<Harness onClose={onClose} />)

    screen.getByRole('button', { name: 'Last' }).focus()
    expect(screen.getByRole('button', { name: 'Last' })).toHaveFocus()

    await userEvent.tab()
    expect(screen.getByRole('button', { name: 'First' })).toHaveFocus()
  })

  it('wraps focus from the first focusable element to the last on Shift+Tab', async () => {
    const onClose = vi.fn()
    render(<Harness onClose={onClose} />)

    expect(screen.getByRole('button', { name: 'First' })).toHaveFocus()

    await userEvent.tab({ shift: true })
    expect(screen.getByRole('button', { name: 'Last' })).toHaveFocus()
  })

  it('returns focus to the triggering control when the modal unmounts', async () => {
    const opener = document.createElement('button')
    opener.textContent = 'Opener'
    document.body.appendChild(opener)
    opener.focus()

    const { unmount } = render(
      <Modal onClose={vi.fn()}>
        <button type="button">Inside</button>
      </Modal>,
    )
    expect(screen.getByRole('button', { name: 'Inside' })).toHaveFocus()

    unmount()
    expect(opener).toHaveFocus()
    opener.remove()
  })
})
