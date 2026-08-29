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
