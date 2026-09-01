import { useMemo, useSyncExternalStore } from 'react'
import { auth } from './auth'
import { pb } from '../sync/pocketbase'

export interface AuthState {
  signedIn: boolean
  email: string | null
  avatarUrl: string | null
  signIn: () => Promise<void>
  signOut: () => void
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
  // rebuild this object and its signIn/signOut closures from scratch; memoize so it's referentially
  // stable across renders where auth itself hasn't changed.
  return useMemo(
    () => ({
      signedIn,
      email,
      avatarUrl,
      signIn: () => auth.signInWithGoogle(),
      signOut: () => auth.signOut(),
    }),
    [signedIn, email, avatarUrl],
  )
}
