import { useSyncExternalStore } from 'react'
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
  const avatar = user?.avatar as string | undefined
  return {
    signedIn,
    email: (user?.email as string | undefined) ?? null,
    avatarUrl: user && avatar ? pb.files.getURL(user, avatar) : null,
    signIn: () => auth.signInWithGoogle(),
    signOut: () => auth.signOut(),
  }
}
