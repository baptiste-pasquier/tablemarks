import { pb } from '../sync/pocketbase'
import { PocketBaseRemote, SyncController } from '../sync/syncEngine'
import type { SyncState } from '../sync/syncStatus'

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

  /** Current backup/sync indicator state (read-only surface over the SyncController). */
  get syncState(): SyncState {
    return this.controller.getState()
  }

  /** Subscribe to sync-indicator state changes; returns an unsubscribe. */
  onSyncStateChange(cb: () => void): () => void {
    return this.controller.onState(cb)
  }
}

export const auth = new AuthService()
