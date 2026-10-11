import { useMemo, useSyncExternalStore } from 'react'
import { auth } from './auth'
import { pb } from '../sync/pocketbase'
import type { AskAccountQuestion } from './signInDecision'

export interface AuthState {
  signedIn: boolean
  email: string | null
  avatarUrl: string | null
  /** Signs in; `ask` answers the question a store holding data raises. */
  signIn: (ask: AskAccountQuestion) => Promise<void>
  /** User sign-out: erases this device's data; `ask` confirms a loss of unsent changes. */
  signOut: (ask: AskAccountQuestion) => Promise<'signed-out' | 'cancelled'>
  /** Ends the session without erasing anything (expiry, backend gone). */
  endSession: () => void
  /** Retries the erase after a sign-out whose erase failed. */
  eraseLocalData: () => Promise<void>
}

export function useAuth(): AuthState {
  const signedIn = useSyncExternalStore(
    (cb) => auth.onChange(cb),
    () => auth.isSignedIn,
  )
  const user = auth.user
  const email = (user?.email as string | undefined) ?? null
  const avatar = user?.avatar as string | undefined
  const avatarUrl = user && avatar ? pb.files.getURL(user, avatar) : null

  // Every consumer re-render (e.g. selecting a restaurant, toggling a filter) would otherwise
  // rebuild this object and its closures from scratch; memoize so it's referentially stable
  // across renders where auth itself hasn't changed.
  return useMemo(
    () => ({
      signedIn,
      email,
      avatarUrl,
      signIn: (ask: AskAccountQuestion) => auth.signInWithGoogle(ask),
      signOut: (ask: AskAccountQuestion) => auth.signOut(ask),
      endSession: () => auth.endSession(),
      eraseLocalData: () => auth.eraseLocalData(),
    }),
    [signedIn, email, avatarUrl],
  )
}
