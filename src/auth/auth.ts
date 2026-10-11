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

/**
 * Upper bound for each wait on the sync engine: the sign-out flush, and the settle of a run in
 * flight before an erase or a (re)start.
 */
const SYNC_WAIT_BOUND_MS = 10_000

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
 * - `resume` (startup) asks nothing, so it only syncs a store it can take without asking: one this
 *   account owns, or an empty unbound one. Any other store ends the session, and the next sign-in
 *   asks. `endSession` (expiry, backend gone) and `resume` never erase.
 *
 * Every erase and every start first stops the controller and waits, bounded, for a run in flight
 * (`quiesce`): `stop()` cannot cancel a `fullSync`, which would otherwise write pulled records into
 * an emptied store, or — since every remote call carries the global session's token — run with
 * the next account's token after an in-tab expiry nobody ended.
 */
export class AuthService {
  private readonly controller = new SyncController()
  private readonly remoteFor: (owner: string) => RemoteStore
  private readonly waitBoundMs: number

  constructor(
    remoteFor: (owner: string) => RemoteStore = defaultRemote,
    waitBoundMs = SYNC_WAIT_BOUND_MS,
  ) {
    this.remoteFor = remoteFor
    this.waitBoundMs = waitBoundMs
  }

  get user() {
    return pb.authStore.record
  }

  get isSignedIn(): boolean {
    return pb.authStore.isValid
  }

  /**
   * Resumes an already-authenticated session at startup. No UI is mounted yet, so it asks
   * nothing: it syncs a store this account owns, binds an empty unbound one, and ends the session
   * on any other store — places added without an account wait for a sign-in that asks. A failure
   * also ends the session, so the user sees Sign in rather than a session that never syncs.
   */
  async resume(): Promise<void> {
    const user = this.user
    if (!this.isSignedIn || !user) return
    try {
      await this.quiesce()
      const [owner, liveCount] = await Promise.all([getStoreOwner(), countLiveRestaurants()])
      if (owner === user.id) return await this.startSync(user.id)
      if (owner === null && liveCount === 0) return await this.bindAndSync(user.id)
      this.endSession()
    } catch (err) {
      this.endSession()
      throw err
    }
  }

  /**
   * Signs in, then applies what the store's owner calls for. The controller is quiesced before
   * OAuth: once the new token is saved, a run still going would sync with it. Any failure after
   * OAuth succeeded ends the session, so a half-applied sign-in never leaves a session behind.
   */
  async signInWithGoogle(ask: AskAccountQuestion): Promise<void> {
    await this.quiesce()
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
   * fails, or if a run in flight does not settle within the bound (then nothing is erased): the
   * session is closed either way, the store stays bound to this account as after an expired
   * session, and `eraseLocalData()` retries.
   */
  async signOut(ask: AskAccountQuestion): Promise<'signed-out' | 'cancelled'> {
    const sent = await this.controller.flush(this.waitBoundMs)
    if (!sent) {
      const pendingCount = await recomputePending()
      if (pendingCount > 0) {
        const answer = await ask({ kind: 'loss', pendingCount })
        if (answer !== 'sign-out') return 'cancelled'
      }
    }
    try {
      await this.quiesce()
    } finally {
      pb.authStore.clear()
    }
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

  /**
   * Stops syncing and waits out a run in flight, for at most `waitBoundMs`. Required before every
   * erase and every start. Rejects on the bound rather than let the caller erase under a live run.
   */
  private async quiesce(): Promise<void> {
    this.controller.stop()
    let timer: ReturnType<typeof setTimeout> | undefined
    const bound = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error('A sync still in flight did not settle in time.')),
        this.waitBoundMs,
      )
    })
    try {
      await Promise.race([this.controller.settled(), bound])
    } finally {
      clearTimeout(timer)
    }
  }
}

export const auth = new AuthService()
