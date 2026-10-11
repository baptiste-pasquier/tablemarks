import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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
    signOut.mockRejectedValue(new Error('wipe'))
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
    signOut.mockRejectedValue(new Error('wipe'))
    eraseLocalData.mockRejectedValue(new Error('still'))
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(screen.getByText('start sign out'))
    await user.click(await screen.findByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(eraseLocalData).toHaveBeenCalled())
    expect(screen.getByRole('alert')).toBeInTheDocument()
  })

  it('a rejected sign-in shows no dialog', async () => {
    signIn.mockRejectedValue(new Error('oauth'))
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(screen.getByText('start sign in'))
    await waitFor(() => expect(signIn).toHaveBeenCalled())
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  describe('one account action at a time', () => {
    it('ignores a second signIn while the first is in flight', async () => {
      signIn.mockReturnValue(deferred<void>().promise)
      const user = userEvent.setup()
      render(<Harness />)
      await user.click(screen.getByText('start sign in'))
      await user.click(screen.getByText('start sign in'))
      expect(signIn).toHaveBeenCalledTimes(1)
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
      signOut.mockRejectedValueOnce(new Error('wipe')).mockResolvedValue('cancelled')
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
