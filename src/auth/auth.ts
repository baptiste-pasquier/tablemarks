import { onSessionChangeInOtherTab, pb } from '../sync/pocketbase'
import { PocketBaseRemote, SyncController } from '../sync/syncEngine'
import { recomputePending } from '../sync/syncStatus'
import { onOtherTabStoreChange } from '../data/events'
import {
  bindStoreOwner,
  countLiveRestaurants,
  getStoreOwner,
  isLegacyStore,
  wipeLocalStore,
} from '../data/storeOwner'
import { googleOAuthConfig, openOAuthPopup } from './oauthPopup'
import { decideSignIn } from './signInDecision'
import { SignOutIncomplete } from './signOutIncomplete'
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
 *   account owns, an empty unbound one, or an unbound one from before owners existed (legacy). Any
 *   other store ends the session, and the next sign-in asks. `endSession` (expiry, backend gone)
 *   and `resume` never erase.
 * - A session that changes under a running sync (a sign-out or a sign-in, in this tab or another)
 *   stops the controller, without erasing: the store stays bound to the account that synced it.
 *   A token that merely runs out fires no `onChange`; the sync runs on until the server refuses it.
 * - Another tab can hand the session its store back: it signs the same account in again, or binds
 *   the store to the account it signed in. This tab then resumes its own sync.
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
  /** The account the controller was started for; null while it is stopped. */
  private syncingFor: string | null = null
  private readonly unsubscribers: Array<() => void>

  constructor(
    remoteFor: (owner: string) => RemoteStore = defaultRemote,
    waitBoundMs = SYNC_WAIT_BOUND_MS,
  ) {
    this.remoteFor = remoteFor
    this.waitBoundMs = waitBoundMs
    // The app's service lives as long as the page; `dispose` is for the ones tests build.
    this.unsubscribers = [
      pb.authStore.onChange(() => this.stopIfSessionMoved(), false),
      onSessionChangeInOtherTab(() => void this.resumeIfOwned()),
      onOtherTabStoreChange(() => void this.resumeIfOwned()),
    ]
  }

  /** Stops syncing and drops every subscription. */
  dispose(): void {
    this.controller.stop()
    this.syncingFor = null
    for (const off of this.unsubscribers) off()
  }

  get user() {
    return pb.authStore.record
  }

  get isSignedIn(): boolean {
    return pb.authStore.isValid
  }

  /**
   * Resumes an already-authenticated session at startup. No UI is mounted yet, so it asks
   * nothing: it syncs a store this account owns, binds an empty unbound one or a legacy one (the
   * app synced it with this session before owners existed), and ends the session on any other
   * store — places added without an account wait for a sign-in that asks. A failure also ends the
   * session, so the user sees Sign in rather than a session that never syncs.
   */
  async resume(): Promise<void> {
    const user = this.user
    if (!this.isSignedIn || !user) return
    try {
      await this.quiesce()
      const [owner, liveCount, legacy] = await Promise.all([
        getStoreOwner(),
        countLiveRestaurants(),
        isLegacyStore(),
      ])
      if (owner === user.id) return await this.startSync(user.id)
      if (owner === null && (liveCount === 0 || legacy)) return await this.bindAndSync(user.id)
      this.endSession()
    } catch (err) {
      this.endSession()
      throw err
    }
  }

  /**
   * Signs in, then applies what the store's owner calls for. The popup opens first, before any
   * `await`, while the click still counts as a user gesture. The controller is then quiesced
   * before OAuth: once the new token is saved, a run still going would sync with it. Any failure
   * after OAuth succeeded ends the session, so a half-applied sign-in never leaves one behind.
   */
  async signInWithGoogle(ask: AskAccountQuestion): Promise<void> {
    const popup = openOAuthPopup()
    try {
      await this.quiesce()
      await pb.collection('users').authWithOAuth2(googleOAuthConfig(popup))
    } finally {
      // The SDK closes only a popup it opened itself.
      popup?.close()
    }
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
   * User sign-out: erases this device's data once the session is closed. Rejects with a
   * `SignOutIncomplete`. Before the session is closed (`sessionCleared: false`), nothing changed.
   * After it (the erase failed, or a run in flight did not settle within the bound, then nothing
   * is erased), the store stays bound to this account as after an expired session, and
   * `eraseLocalData()` retries.
   */
  async signOut(ask: AskAccountQuestion): Promise<'signed-out' | 'cancelled'> {
    let sessionCleared = false
    try {
      const sent = await this.controller.flush(this.waitBoundMs)
      if (!sent && !(await this.confirmLoss(ask))) return 'cancelled'
      try {
        await this.quiesce()
      } finally {
        pb.authStore.clear()
        sessionCleared = true
      }
      await wipeLocalStore()
      return 'signed-out'
    } catch (err) {
      throw new SignOutIncomplete(sessionCleared, err)
    }
  }

  /** Ends the session without erasing: the store keeps its data and its owner. */
  endSession(): void {
    this.controller.stop()
    this.syncingFor = null
    pb.authStore.clear()
  }

  /**
   * Erases this device's data — the retry after a sign-out whose erase failed. Refuses while
   * signed in: the session would go on syncing into, and from, an emptied store.
   */
  async eraseLocalData(): Promise<void> {
    if (this.isSignedIn) throw new Error("Cannot erase this device's data while signed in.")
    await this.eraseStore()
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
      await this.eraseStore()
      return this.bindAndSync(userId)
    }
    this.endSession()
  }

  /** True when nothing is pending, or the user agreed to lose what is. */
  private async confirmLoss(ask: AskAccountQuestion): Promise<boolean> {
    const pendingCount = await recomputePending()
    if (pendingCount === 0) return true
    return (await ask({ kind: 'loss', pendingCount })) === 'sign-out'
  }

  /** The erase itself, with no session check: sign-in erases under the session it just opened. */
  private async eraseStore(): Promise<void> {
    await this.quiesce()
    await wipeLocalStore()
  }

  private async bindAndSync(userId: string): Promise<void> {
    await bindStoreOwner(userId)
    await this.startSync(userId)
  }

  /** Starts, or restarts, the controller: a second `start` would subscribe everything twice. */
  private async startSync(userId: string): Promise<void> {
    this.controller.stop()
    this.syncingFor = userId
    await this.controller.start(this.remoteFor(userId))
  }

  /**
   * Resumes a sync that a session change in another tab stopped, once the session and the store
   * belong to the same account again. Waits like every start; a failure leaves the sync stopped
   * until the next change from another tab, or a reload, tries again.
   */
  private async resumeIfOwned(): Promise<void> {
    const userId = this.user?.id
    if (this.syncingFor !== null || !this.isSignedIn || !userId) return
    try {
      if ((await getStoreOwner()) !== userId) return
      await this.quiesce()
      // Re-checked after the waits: this tab may have signed out, or started on its own, meanwhile.
      if (this.syncingFor !== null || !this.isSignedIn || this.user?.id !== userId) return
      await this.startSync(userId)
    } catch {
      // Nobody is waiting on this run; the sync stays stopped as it was.
    }
  }

  /** Stops the controller once the session no longer belongs to the account it syncs for. */
  private stopIfSessionMoved(): void {
    if (this.syncingFor === null) return
    if (this.isSignedIn && this.user?.id === this.syncingFor) return
    this.syncingFor = null
    this.controller.stop()
  }

  /**
   * Stops syncing and waits out a run in flight, for at most `waitBoundMs`. Required before every
   * erase and every start. Rejects on the bound rather than let the caller erase under a live run.
   */
  private async quiesce(): Promise<void> {
    this.controller.stop()
    this.syncingFor = null
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
