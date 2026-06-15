import { pb } from '../sync/pocketbase'
import { PocketBaseRemote, SyncController, type SyncState } from '../sync/syncEngine'

/**
 * Account mode for the local-first app. There is no local-vs-cloud toggle: the app always
 * runs against the local store, and signing in simply turns on backup + cross-device sync.
 * Sign-in starts a SyncController whose first `fullSync` is the union migration of existing
 * local data with the account. Sign-out stops syncing and leaves local data untouched.
 */
export class AuthService {
  private controller = new SyncController()

  get user() {
    return pb.authStore.record
  }

  get isSignedIn(): boolean {
    return pb.authStore.isValid
  }

  /** Resume sync for an already-authenticated session (e.g. on app start). */
  async resume(): Promise<void> {
    if (this.isSignedIn && this.user) {
      await this.controller.start(new PocketBaseRemote(this.user.id))
    }
  }

  async signInWithGoogle(): Promise<void> {
    await pb.collection('users').authWithOAuth2({ provider: 'google' })
    if (this.user) {
      await this.controller.start(new PocketBaseRemote(this.user.id))
    }
  }

  signOut(): void {
    this.controller.stop()
    pb.authStore.clear()
    // Local IndexedDB data is intentionally retained — the user reverts to local-only mode.
  }

  onChange(cb: () => void): () => void {
    return pb.authStore.onChange(cb, false)
  }

  /** Returns null when signed out — the indicator is a backup-state concept, hidden without a cloud account. */
  getSyncState(): SyncState | null {
    if (!this.isSignedIn) return null
    return this.controller.getSyncState()
  }

  /** Subscribe to sync-state changes. Fires when auth changes (sign in/out) or sync state changes. */
  onSyncStateChange(cb: () => void): () => void {
    const offAuth = this.onChange(cb)
    const offSync = this.controller.onSyncStateChange(cb)
    return () => { offAuth(); offSync() }
  }
}

export const auth = new AuthService()
