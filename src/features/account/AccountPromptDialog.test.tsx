import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import type { AccountQuestion } from '../../auth/signInDecision'
import { AccountPromptDialog, type AccountPromptState } from './AccountPromptDialog'

function setup(state: AccountPromptState) {
  const props = { onAnswer: vi.fn(), onRetryWipe: vi.fn(), onDismiss: vi.fn() }
  render(<AccountPromptDialog state={state} {...props} />)
  return props
}

function question(q: AccountQuestion): AccountPromptState {
  return { kind: 'question', question: q }
}

describe('AccountPromptDialog', () => {
  it('adopt shows the count and focuses "Add to my account"', async () => {
    const { onAnswer } = setup(question({ kind: 'adopt', count: 3 }))

    expect(
      screen.getByText('3 places were added on this device without an account.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add to my account' })).toHaveFocus()

    await userEvent.click(screen.getByRole('button', { name: 'Erase them' }))
    expect(onAnswer).toHaveBeenCalledWith('erase')
  })

  it('adopt "Add to my account" answers add', async () => {
    const { onAnswer } = setup(question({ kind: 'adopt', count: 1 }))
    await userEvent.click(screen.getByRole('button', { name: 'Add to my account' }))
    expect(onAnswer).toHaveBeenCalledWith('add')
  })

  it('replace focuses Cancel and mentions pending changes only when there are some', async () => {
    const first = render(
      <AccountPromptDialog
        state={question({ kind: 'replace', pendingCount: 0 })}
        onAnswer={vi.fn()}
        onRetryWipe={vi.fn()}
        onDismiss={vi.fn()}
      />,
    )
    expect(
      screen.getByText("This device holds another account's places. They can't be added to yours."),
    ).toBeInTheDocument()
    first.unmount()

    const { onAnswer } = setup(question({ kind: 'replace', pendingCount: 2 }))
    expect(screen.getByText(/including 2 changes never backed up/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus()

    await userEvent.click(screen.getByRole('button', { name: 'Erase and continue' }))
    expect(onAnswer).toHaveBeenCalledWith('erase')
  })

  it('loss focuses Cancel', async () => {
    const { onAnswer } = setup(question({ kind: 'loss', pendingCount: 2 }))
    expect(screen.getByText('2 changes could not be sent and will be lost.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus()

    await userEvent.click(screen.getByRole('button', { name: 'Sign out anyway' }))
    expect(onAnswer).toHaveBeenCalledWith('sign-out')
  })

  it.each<AccountQuestion>([
    { kind: 'adopt', count: 2 },
    { kind: 'replace', pendingCount: 1 },
    { kind: 'loss', pendingCount: 1 },
  ])('Escape answers cancel for $kind', async (q) => {
    const { onAnswer } = setup(question(q))
    await userEvent.keyboard('{Escape}')
    expect(onAnswer).toHaveBeenCalledWith('cancel')
  })

  it('sending shows progress and no action', async () => {
    const { onAnswer, onDismiss } = setup({ kind: 'sending' })
    expect(screen.getByText('Sending your changes…')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Sign out anyway' })).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Close' }))
    await userEvent.keyboard('{Escape}')
    expect(onAnswer).not.toHaveBeenCalled()
    expect(onDismiss).not.toHaveBeenCalled()
  })

  it('wipe-failed shows an alert with a retry', async () => {
    const { onRetryWipe, onDismiss } = setup({ kind: 'wipe-failed' })
    expect(screen.getByRole('alert')).toHaveTextContent(
      "Signed out, but this device's data could not be erased.",
    )

    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(onRetryWipe).toHaveBeenCalledTimes(1)

    await userEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it.each([
    {
      kind: 'sign-in-failed' as const,
      title: 'Sign-in failed',
      message: 'Sign-in did not complete. Please try again.',
    },
    {
      kind: 'sign-out-failed' as const,
      title: 'Sign-out failed',
      message: 'Sign-out did not complete. You are still signed in.',
    },
  ])('$kind shows a short title, the alert once, and Close', async ({ kind, title, message }) => {
    const { onDismiss, onRetryWipe } = setup({ kind })
    expect(screen.getByRole('dialog', { name: title })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: title })).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent(message)
    expect(screen.getAllByText(message)).toHaveLength(1)
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument()

    const close = screen.getAllByRole('button', { name: 'Close' }).at(-1)!
    expect(close).toHaveFocus()
    await userEvent.click(close)
    expect(onDismiss).toHaveBeenCalledTimes(1)
    await userEvent.keyboard('{Escape}')
    expect(onDismiss).toHaveBeenCalledTimes(2)
    expect(onRetryWipe).not.toHaveBeenCalled()
  })
})
