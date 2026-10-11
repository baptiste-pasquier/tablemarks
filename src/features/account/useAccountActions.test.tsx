import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SignOutIncomplete } from '../../auth/signOutIncomplete'
import { useAuth } from '../../auth/useAuth'
import type { AccountAnswer, AskAccountQuestion } from '../../auth/signInDecision'
import { AccountPromptDialog } from './AccountPromptDialog'
import { useAccountActions } from './useAccountActions'

vi.mock('../../auth/useAuth', () => ({ useAuth: vi.fn() }))
const mockUseAuth = vi.mocked(useAuth)

const signIn = vi.fn<(ask: AskAccountQuestion) => Promise<void>>()
const signOut = vi.fn<(ask: AskAccountQuestion) => Promise<'signed-out' | 'cancelled'>>()
const eraseLocalData = vi.fn<() => Promise<void>>()

function Harness() {
  const { signIn: onSignIn, signOut: onSignOut, prompt } = useAccountActions()
  return (
    <>
      <button onClick={onSignIn}>start sign in</button>
      <button onClick={onSignOut}>start sign out</button>
      <button id="shell-signin-button">Sign in</button>
      {prompt && <AccountPromptDialog {...prompt} />}
    </>
  )
}

/** A sign-out that closed the session but could not erase the store. */
function wipeFailed(): SignOutIncomplete {
  return new SignOutIncomplete(true, new Error('wipe'))
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

beforeEach(() => {
  vi.resetAllMocks()
  mockUseAuth.mockReturnValue({
    signedIn: true,
    email: null,
    avatarUrl: null,
    signIn,
    signOut,
    endSession: vi.fn(),
    eraseLocalData,
  })
})

describe('useAccountActions', () => {
  it('signIn opens the question auth asks and resolves it with the click', async () => {
    let answer: Promise<AccountAnswer> | undefined
    const settled = deferred<void>()
    signIn.mockImplementation(async (ask) => {
      answer = ask({ kind: 'adopt', count: 1 })
      await answer
      settled.resolve()
    })
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(screen.getByText('start sign in'))
    await user.click(await screen.findByRole('button', { name: 'Add to my account' }))
    await expect(answer).resolves.toBe('add')
    await settled.promise
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('signOut shows the sending state until auth asks or finishes', async () => {
    const result = deferred<'signed-out' | 'cancelled'>()
    signOut.mockReturnValue(result.promise)
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(screen.getByText('start sign out'))
    expect(await screen.findByText('Sending your changes…')).toBeInTheDocument()
    result.resolve('signed-out')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await waitFor(() => expect(document.getElementById('shell-signin-button')).toHaveFocus())
  })

  it('shows sending again after the user confirms losing changes, until auth finishes', async () => {
    const result = deferred<'signed-out' | 'cancelled'>()
    signOut.mockImplementation(async (ask) => {
      await ask({ kind: 'loss', pendingCount: 2 })
      return result.promise
    })
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(screen.getByText('start sign out'))
    await user.click(await screen.findByRole('button', { name: /sign out anyway/i }))
    expect(await screen.findByText('Sending your changes…')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /sign out anyway/i })).not.toBeInTheDocument()
    result.resolve('signed-out')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('a cancelled sign-out closes the dialog without moving focus', async () => {
    signOut.mockImplementation(async (ask) => {
      await ask({ kind: 'loss', pendingCount: 2 })
      return 'cancelled'
    })
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(screen.getByText('start sign out'))
    await user.click(await screen.findByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(document.getElementById('shell-signin-button')).not.toHaveFocus()
  })

  it('a failed wipe shows the alert and Try again calls eraseLocalData', async () => {
    signOut.mockRejectedValue(wipeFailed())
    eraseLocalData.mockResolvedValue(undefined)
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(screen.getByText('start sign out'))
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(eraseLocalData).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('keeps the alert when the retry fails too', async () => {
    signOut.mockRejectedValue(wipeFailed())
    eraseLocalData.mockRejectedValue(new Error('still'))
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(screen.getByText('start sign out'))
    await user.click(await screen.findByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(eraseLocalData).toHaveBeenCalled())
    expect(screen.getByRole('alert')).toBeInTheDocument()
  })

  it('a rejected sign-in says so, and Close dismisses it', async () => {
    signIn.mockRejectedValue(new Error('oauth'))
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(screen.getByText('start sign in'))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Sign-in did not complete. Please try again.',
    )
    await user.click(screen.getAllByRole('button', { name: 'Close' }).at(-1)!)
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('a sign-out that fails before closing the session says the user is still signed in', async () => {
    signOut.mockRejectedValue(new SignOutIncomplete(false, new Error('dialog unmounted')))
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(screen.getByText('start sign out'))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Sign-out did not complete. You are still signed in.',
    )
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument()
  })

  it('an unexpected sign-out failure is not reported as a failed erase', async () => {
    signOut.mockRejectedValue(new Error('unknown'))
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(screen.getByText('start sign out'))
    expect(await screen.findByRole('alert')).toHaveTextContent('Sign-out did not complete.')
  })

  describe('one account action at a time', () => {
    it('signIn still works while a previous sign-in never settles', async () => {
      signIn.mockReturnValueOnce(deferred<void>().promise).mockResolvedValue(undefined)
      const user = userEvent.setup()
      render(<Harness />)
      await user.click(screen.getByText('start sign in'))
      await user.click(screen.getByText('start sign in'))
      expect(signIn).toHaveBeenCalledTimes(2)
    })

    it('a second question answers the first one with cancel', async () => {
      const asks: Promise<AccountAnswer>[] = []
      signIn
        .mockImplementationOnce(async (ask) => {
          asks.push(ask({ kind: 'adopt', count: 1 }))
          await asks[0]
        })
        .mockImplementationOnce(async (ask) => {
          asks.push(ask({ kind: 'replace', pendingCount: 3 }))
          await asks[1]
        })
      const user = userEvent.setup()
      render(<Harness />)
      await user.click(screen.getByText('start sign in'))
      await screen.findByRole('button', { name: 'Add to my account' })
      await user.click(screen.getByText('start sign in'))
      await expect(asks[0]).resolves.toBe('cancel')
      expect(await screen.findByRole('dialog')).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Add to my account' })).not.toBeInTheDocument()
    })

    it('ignores a second signOut while the first is in flight', async () => {
      signOut.mockReturnValue(deferred<'signed-out' | 'cancelled'>().promise)
      const user = userEvent.setup()
      render(<Harness />)
      await user.click(screen.getByText('start sign out'))
      await user.click(screen.getByText('start sign out'))
      expect(signOut).toHaveBeenCalledTimes(1)
    })

    it('accepts a new action once the previous one resolved', async () => {
      signIn.mockResolvedValue(undefined)
      const user = userEvent.setup()
      render(<Harness />)
      await user.click(screen.getByText('start sign in'))
      await waitFor(() => expect(signIn).toHaveBeenCalledTimes(1))
      await user.click(screen.getByText('start sign in'))
      await waitFor(() => expect(signIn).toHaveBeenCalledTimes(2))
    })

    it('accepts a new action once the previous one rejected', async () => {
      signOut.mockRejectedValueOnce(wipeFailed()).mockResolvedValue('cancelled')
      const user = userEvent.setup()
      render(<Harness />)
      await user.click(screen.getByText('start sign out'))
      await screen.findByRole('alert')
      await user.click(screen.getByRole('button', { name: 'Close' }))
      await user.click(screen.getByText('start sign out'))
      await waitFor(() => expect(signOut).toHaveBeenCalledTimes(2))
    })
  })
})
