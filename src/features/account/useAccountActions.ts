import { useCallback, useRef, useState } from 'react'
import { SignOutIncomplete } from '../../auth/signOutIncomplete'
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
        // A second flow must never orphan the first one's promise: cancel it before replacing it.
        pendingAnswer.current?.('cancel')
        pendingAnswer.current = (answer) => {
          setState(next(answer))
          resolve(answer)
        }
        setState({ kind: 'question', question })
      }),
    [],
  )

  // Sign-out and the wipe retry run one at a time (both are bounded by auth's waits): a call made
  // while one is in flight is a no-op.
  const inFlight = useRef(false)
  const exclusive = useCallback((start: () => Promise<void>) => {
    if (inFlight.current) return
    inFlight.current = true
    void start().finally(() => {
      inFlight.current = false
    })
  }, [])

  const signIn = useCallback(() => {
    // Not behind `exclusive`: the PocketBase SDK never settles a closed OAuth popup, which would
    // lock Sign in until a reload. A failure has already ended the session; it only informs.
    authSignIn(makeAsk(() => null)).catch(() => setState({ kind: 'sign-in-failed' }))
  }, [authSignIn, makeAsk])

  const signOut = useCallback(() => {
    exclusive(() => {
      setState({ kind: 'sending' })
      const ask = makeAsk((answer) => (answer === 'sign-out' ? { kind: 'sending' } : null))
      return authSignOut(ask).then(
        (result) => {
          setState(null)
          if (result === 'signed-out') {
            // The avatar trigger is gone once signed out; focus the sign-in button when it mounts.
            requestAnimationFrame(() => document.getElementById('shell-signin-button')?.focus())
          }
        },
        // Only a sign-out that closed the session has an erase left to retry; any other failure
        // left the user signed in.
        (err: unknown) =>
          setState(
            err instanceof SignOutIncomplete && err.sessionCleared
              ? { kind: 'wipe-failed' }
              : { kind: 'sign-out-failed' },
          ),
      )
    })
  }, [authSignOut, makeAsk, exclusive])

  const onAnswer = useCallback((answer: AccountAnswer) => {
    const resolve = pendingAnswer.current
    pendingAnswer.current = null
    resolve?.(answer)
  }, [])

  const onRetryWipe = useCallback(() => {
    exclusive(() =>
      eraseLocalData().then(
        () => setState(null),
        () => setState({ kind: 'wipe-failed' }),
      ),
    )
  }, [eraseLocalData, exclusive])

  const onDismiss = useCallback(() => setState(null), [])

  return {
    signIn,
    signOut,
    prompt: state && { state, onAnswer, onRetryWipe, onDismiss },
  }
}
