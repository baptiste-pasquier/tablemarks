import { useSyncExternalStore } from 'react'
import { auth } from './auth'

export interface AuthState {
  signedIn: boolean
  email: string | null
  signIn: () => Promise<void>
  signOut: () => void
}

export function useAuth(): AuthState {
  const signedIn = useSyncExternalStore(
    (cb) => auth.onChange(cb),
    () => auth.isSignedIn,
  )
  return {
    signedIn,
    email: (auth.user?.email as string | undefined) ?? null,
    signIn: () => auth.signInWithGoogle(),
    signOut: () => auth.signOut(),
  }
}
