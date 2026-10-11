import { pb } from '../sync/pocketbase'
import { PocketBaseRemote, SyncController } from '../sync/syncEngine'
import { recomputePending } from '../sync/syncStatus'
import {
  bindStoreOwner,
  countLiveRestaurants,
  getStoreOwner,
  wipeLocalStore,
} from '../data/storeOwner'
import { decideSignIn } from './signInDecision'
import type { RemoteStore } from '../sync/syncEngine'
import type { AskAccountQuestion, SignInDecision } from './signInDecision'

/** How long sign-out waits for its last attempt to send pending changes. */
const SIGN_OUT_FLUSH_MS = 10_000

function defaultRemote(owner: string): RemoteStore {
  return new PocketBaseRemote(owner)
}

/**
 * Account mode for the local-first app. The app always runs against the local store, which
 * belongs to at most one account (its store owner); signing in turns on backup and sync for that
 * account only. Every decision is taken here, before the SyncController starts:
 *
 * - Sign-in syncs a store this account owns, binds an empty one, and otherwise asks through the
 *   injected `ask`: places added without an account can be added or erased, another account's
 *   store can only be erased. Cancel ends the session and leaves the store untouched.
 * - A user sign-out tries to send pending changes, asks before losing any, then erases the store.
 * - `endSession` (expiry, backend gone) and `resume` (startup) never erase: nobody is there to
 *   confirm a loss.
 *
 * Every erase first stops the controller and waits for a run in flight: `stop()` cannot cancel a
 * `fullSync`, which would otherwise write pulled records back into the emptied store.
 */
export class AuthService {
  private readonly controller = new SyncController()
  private readonly remoteFor: (owner: string) => RemoteStore

  constructor(remoteFor: (owner: string) => RemoteStore = defaultRemote) {
    this.remoteFor = remoteFor
  }

  get user() {
    return pb.authStore.record
  }

  get isSignedIn(): boolean {
    return pb.authStore.isValid
  }

  /**
   * Resumes an already-authenticated session at startup. No UI is mounted yet, so it asks
   * nothing: an ownerless store is bound silently, another account's store ends the session.
   */
  async resume(): Promise<void> {
    const user = this.user
    if (!this.isSignedIn || !user) return
    const owner = await getStoreOwner()
    if (owner !== null && owner !== user.id) {
      this.endSession()
      return
    }
    if (owner === null) await bindStoreOwner(user.id)
    await this.startSync(user.id)
  }

  /**
   * Signs in, then applies what the store's owner calls for. Any failure after OAuth succeeded
   * ends the session, so a half-applied sign-in never leaves a session the next startup would
   * bind silently.
   */
  async signInWithGoogle(ask: AskAccountQuestion): Promise<void> {
    await pb.collection('users').authWithOAuth2({ provider: 'google' })
    const user = this.user
    if (!user) return
    try {
      const [storeOwner, liveCount, pendingCount] = await Promise.all([
        getStoreOwner(),
        countLiveRestaurants(),
        recomputePending(),
      ])
      const decision = decideSignIn({ storeOwner, userId: user.id, liveCount, pendingCount })
      await this.applyDecision(decision, user.id, ask)
    } catch (err) {
      this.endSession()
      throw err
    }
  }

  /**
   * User sign-out: erases this device's data once the session is closed. Rejects if the erase
   * fails — the store then stays bound to this account, as after an expired session, and
   * `eraseLocalData()` retries.
   */
  async signOut(ask: AskAccountQuestion): Promise<'signed-out' | 'cancelled'> {
    const sent = await this.controller.flush(SIGN_OUT_FLUSH_MS)
    if (!sent) {
      const pendingCount = await recomputePending()
      if (pendingCount > 0) {
        const answer = await ask({ kind: 'loss', pendingCount })
        if (answer !== 'sign-out') return 'cancelled'
      }
    }
    await this.quiesce()
    pb.authStore.clear()
    await wipeLocalStore()
    return 'signed-out'
  }

  /** Ends the session without erasing: the store keeps its data and its owner. */
  endSession(): void {
    this.controller.stop()
    pb.authStore.clear()
  }

  /** Erases this device's data — the retry after a sign-out whose erase failed. */
  async eraseLocalData(): Promise<void> {
    await this.quiesce()
    await wipeLocalStore()
  }

  onChange(cb: () => void): () => void {
    return pb.authStore.onChange(cb, false)
  }

  /** Only an explicit `'add'` or `'erase'` goes ahead; any other answer is a cancel. */
  private async applyDecision(
    decision: SignInDecision,
    userId: string,
    ask: AskAccountQuestion,
  ): Promise<void> {
    if (decision.kind === 'resume') return this.startSync(userId)
    if (decision.kind === 'bind') return this.bindAndSync(userId)
    const answer =
      decision.kind === 'ask-adopt'
        ? await ask({ kind: 'adopt', count: decision.count })
        : await ask({ kind: 'replace', pendingCount: decision.pendingCount })
    if (answer === 'add' && decision.kind === 'ask-adopt') return this.bindAndSync(userId)
    if (answer === 'erase') {
      await this.eraseLocalData()
      return this.bindAndSync(userId)
    }
    this.endSession()
  }

  private async bindAndSync(userId: string): Promise<void> {
    await bindStoreOwner(userId)
    await this.startSync(userId)
  }

  private async startSync(userId: string): Promise<void> {
    await this.controller.start(this.remoteFor(userId))
  }

  /** Stops syncing and waits out a run in flight. Required before every erase. */
  private async quiesce(): Promise<void> {
    this.controller.stop()
    await this.controller.settled()
  }
}

export const auth = new AuthService()
