import { useCallback, useRef, useState } from 'react'
import { useAuth } from '../../auth/useAuth'
import type { AccountAnswer, AccountQuestion } from '../../auth/signInDecision'
import type { AccountPromptProps, AccountPromptState } from './AccountPromptDialog'

export interface AccountActions {
  signIn: () => void
  signOut: () => void
  /** Props for `AccountPromptDialog`; `null` when no dialog is open. */
  prompt: AccountPromptProps | null
}

/**
 * Connects the auth service's questions to `AccountPromptDialog`: auth asks through the `ask`
 * function this hook hands it, the dialog's click resolves that promise.
 */
export function useAccountActions(): AccountActions {
  const { signIn: authSignIn, signOut: authSignOut, eraseLocalData } = useAuth()
  const [state, setState] = useState<AccountPromptState | null>(null)
  const pendingAnswer = useRef<((answer: AccountAnswer) => void) | null>(null)

  const makeAsk = useCallback(
    (next: (answer: AccountAnswer) => AccountPromptState | null) => (question: AccountQuestion) =>
      new Promise<AccountAnswer>((resolve) => {
        pendingAnswer.current = (answer) => {
          setState(next(answer))
          resolve(answer)
        }
        setState({ kind: 'question', question })
      }),
    [],
  )

  const signIn = useCallback(() => {
    // A failed sign-in has no dialog: the session is already ended and the form of the
    // sign-in button is unchanged (parity with the old `void signIn()`).
    authSignIn(makeAsk(() => null)).catch(() => undefined)
  }, [authSignIn, makeAsk])

  const signOut = useCallback(() => {
    setState({ kind: 'sending' })
    authSignOut(makeAsk((answer) => (answer === 'sign-out' ? { kind: 'sending' } : null))).then(
      (result) => {
        setState(null)
        if (result === 'signed-out') {
          // The avatar trigger is gone once signed out; focus the sign-in button when it mounts.
          requestAnimationFrame(() => document.getElementById('shell-signin-button')?.focus())
        }
      },
      () => setState({ kind: 'wipe-failed' }),
    )
  }, [authSignOut, makeAsk])

  const onAnswer = useCallback((answer: AccountAnswer) => {
    const resolve = pendingAnswer.current
    pendingAnswer.current = null
    resolve?.(answer)
  }, [])

  const onRetryWipe = useCallback(() => {
    eraseLocalData().then(
      () => setState(null),
      () => setState({ kind: 'wipe-failed' }),
    )
  }, [eraseLocalData])

  const onDismiss = useCallback(() => setState(null), [])

  return {
    signIn,
    signOut,
    prompt: state && { state, onAnswer, onRetryWipe, onDismiss },
  }
}
