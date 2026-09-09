import type { Restaurant, Visit } from '../types/models'
import {
  allRestaurantsForSync,
  mutateRestaurant,
  markRestaurantSynced,
} from '../data/restaurants'
import { allVisitsForSync, putVisitRaw, markVisitSynced } from '../data/visits'
import { recomputeRollup } from '../data/rollup'
import { onLocalChange, emitStoreChange } from '../data/events'
import { isOnline, onOnlineChange } from './onlineStatus'
import { nextRetryDelayMs, classifyFailure } from './backoff'
import { recomputePending, setSyncState, getSyncStatus } from './syncStatus'
import { setBackendReachability } from './backendStatus'
import { reconcile } from './reconcile'
import { pb } from './pocketbase'
import {
  restaurantFromRemote,
  restaurantToRemote,
  visitFromRemote,
  visitToRemote,
  type RemoteRestaurant,
  type RemoteVisit,
} from './mappers'

/**
 * Remote storage seam. The local IndexedDB store is the durable outbox — offline writes
 * land there and `fullSync` flushes local winners on the next connection, so a reload
 * mid-pending never drops a write. `fullSync` is decoupled from PocketBase via this
 * interface so its reconcile-and-flush logic is testable without a live backend.
 */
export interface RemoteStore {
  listRestaurants(): Promise<Restaurant[]>
  listVisits(): Promise<Visit[]>
  pushRestaurant(r: Restaurant): Promise<void>
  pushVisit(v: Visit): Promise<void>
}

export interface SyncOutcome {
  restaurantsWritten: number
  restaurantsPushed: number
  visitsWritten: number
  visitsPushed: number
}

/** Pull remote, reconcile by last-write-wins, write remote winners locally, push local winners. */
export async function fullSync(remote: RemoteStore): Promise<SyncOutcome> {
  const [localR, remoteR] = await Promise.all([allRestaurantsForSync(), remote.listRestaurants()])
  const r = reconcile(localR, remoteR)
  // The local snapshot `reconcile` actually compared against, per id — used below to detect a
  // local edit that raced this pull between the snapshot read and the write.
  const localSnapshotById = new Map(localR.map((rec) => [rec.id, rec]))
  // Recompute the rollup for every restaurant whose row OR visits we wrote. A pulled row wins LWW
  // carrying the peer's serialized rollup; the rollup is a local-derived cache, never trusted from
  // outside, so re-derive it from this device's visits. Keying only on written visits would leave a
  // pulled row with a stale foreign rollup (the same bug fixed on the import path).
  const affected = new Set<string>()
  // Counts pulled rows actually persisted below — distinct from r.toWriteLocal.length, which is
  // only what reconcile proposed to write (see the conditional-write comment below).
  let restaurantsWrittenCount = 0
  for (const rec of r.toWriteLocal) {
    const snapshotUpdated = localSnapshotById.get(rec.id)?.updated
    // Single-transaction conditional write (mutateRestaurant): only apply the pulled row if the
    // record's `updated` still matches the snapshot `reconcile` read it against — otherwise a
    // local edit landed between the reconcile snapshot and this write, and applying the pull here
    // would silently clobber that newer local edit. No-op in that case (return unchanged); the
    // local edit's own emitLocalChange() will trigger the next sync cycle to re-reconcile.
    // Stamp synced in the same write as the pull — markRestaurantSynced afterward would be a
    // redundant read-modify-write and a second store-change emit for a record already in hand.
    const result = await mutateRestaurant(
      rec.id,
      (current) => (current?.updated !== snapshotUpdated ? undefined : { ...rec, syncedUpdated: rec.updated }),
      'store',
    )
    if (result) {
      affected.add(rec.id)
      restaurantsWrittenCount++
    }
  }
  for (const rec of r.toPush) {
    await remote.pushRestaurant(rec)
    await markRestaurantSynced(rec.id, rec.updated)
  }
  // Pairs already in agreement (Fix 1): never written or pushed, so the loops above never touch
  // them — without this, a record synced before `syncedUpdated` existed reads as pending forever.
  for (const rec of r.noop) {
    if (rec.syncedUpdated !== rec.updated) await markRestaurantSynced(rec.id, rec.updated)
  }

  const [localV, remoteV] = await Promise.all([allVisitsForSync(), remote.listVisits()])
  const v = reconcile(localV, remoteV)
  for (const rec of v.toWriteLocal) {
    await putVisitRaw({ ...rec, syncedUpdated: rec.updated })
    affected.add(rec.restaurantId)
  }
  for (const rec of v.toPush) {
    await remote.pushVisit(rec)
    await markVisitSynced(rec.id, rec.updated)
  }
  for (const rec of v.noop) {
    if (rec.syncedUpdated !== rec.updated) await markVisitSynced(rec.id, rec.updated)
  }

  for (const restaurantId of affected) await recomputeRollup(restaurantId)
  if (affected.size > 0) emitStoreChange()

  return {
    restaurantsWritten: restaurantsWrittenCount,
    restaurantsPushed: r.toPush.length,
    visitsWritten: v.toWriteLocal.length,
    visitsPushed: v.toPush.length,
  }
}

/** PocketBase-backed RemoteStore. Upserts use the client id so reconcile merges, never duplicates. */
export class PocketBaseRemote implements RemoteStore {
  private readonly owner: string

  constructor(owner: string) {
    this.owner = owner
  }

  async listRestaurants(): Promise<Restaurant[]> {
    const rows = await pb.collection('restaurants').getFullList()
    return rows.map((row) => restaurantFromRemote(row as unknown as RemoteRestaurant))
  }

  async listVisits(): Promise<Visit[]> {
    const rows = await pb.collection('visits').getFullList()
    return rows.map((row) => visitFromRemote(row as unknown as RemoteVisit))
  }

  async pushRestaurant(r: Restaurant): Promise<void> {
    await this.upsert('restaurants', r.id, restaurantToRemote(r, this.owner))
  }

  async pushVisit(v: Visit): Promise<void> {
    await this.upsert('visits', v.id, visitToRemote(v, this.owner))
  }

  private async upsert(collection: string, id: string, body: object): Promise<void> {
    try {
      await pb.collection(collection).update(id, body)
    } catch (err) {
      // Only a genuine "not found" means the record is new — create it (id is client-supplied).
      // Any other error (auth, validation, 5xx, network) must surface, not be masked as a create.
      if ((err as { status?: number })?.status === 404) {
        await pb.collection(collection).create({ id, ...body })
      } else {
        throw err
      }
    }
  }
}

/** Consecutive non-offline failures at which sync status escalates to 'problem' (KTD2). */
const ESCALATION_THRESHOLD = 3

/**
 * Drives sync while signed in: an initial reconcile, then re-syncs on local writes (debounced),
 * on reconnect, and on remote realtime changes. Stopping leaves the local store untouched.
 *
 * Publishes status through `src/sync/syncStatus.ts` as it goes: offline short-circuits with no
 * failure counted and no backoff scheduled; a success resets the failure count and clears any
 * scheduled retry; a non-offline failure schedules an exponential-backoff retry (`backoff.ts`)
 * and, once `ESCALATION_THRESHOLD` consecutive failures are reached, escalates to 'problem' with
 * a classified cause.
 *
 * Multiple independent triggers (the debounced local-write listener, the 'online' event, and two
 * PocketBase realtime subscriptions) can each ask for a sync. Two invariants keep them from
 * fighting the backoff schedule or each other (Fix 2):
 *   1. Only one `fullSync` runs at a time. A trigger that arrives mid-flight requests exactly one
 *      rerun once the in-flight attempt finishes — never a second overlapping call, never an
 *      unbounded queue.
 *   2. While a backoff retry is already scheduled, a local write does not start an earlier timer
 *      that would fire before the backoff delay elapses — the scheduled retry itself will pick up
 *      the new write once it runs, since `fullSync` always operates on current state.
 */
export class SyncController {
  private remote: RemoteStore | null = null
  private unsubscribers: Array<() => void> = []
  /** The 400ms local-write debounce timer — distinct from `backoffTimer` (Fix 2). */
  private debounceTimer: ReturnType<typeof setTimeout> | null = null
  /** The scheduled backoff retry after a failure, if any. */
  private backoffTimer: ReturnType<typeof setTimeout> | null = null
  private stopped = false
  private consecutiveFailures = 0
  /** True while a `fullSync` attempt is in flight — guards against overlapping calls (Fix 2). */
  private syncing = false
  /** Set when a trigger arrives while `syncing` — consumed as exactly one rerun on completion. */
  private rerunRequested = false

  async start(remote: RemoteStore): Promise<void> {
    this.remote = remote
    this.stopped = false
    this.unsubscribers.push(onLocalChange(() => this.scheduleSync()))
    this.unsubscribers.push(onOnlineChange(() => this.runSync()))
    // subscribe() is async — if stop() already ran by the time it resolves, unsubscribe
    // immediately rather than registering a listener that stop() will never clean up.
    const track = (unsub: () => void) => {
      if (this.stopped) void unsub()
      else this.unsubscribers.push(unsub)
    }
    this.subscribeRealtime('restaurants', track)
    this.subscribeRealtime('visits', track)
    // Best-effort initial reconcile — a failure here (e.g. PocketBase down on sign-in) must not
    // prevent the controller from starting; subscriptions are registered so a later trigger recovers.
    this.runSync()
  }

  /**
   * Opens one realtime subscription. The rejection path is not exceptional: a configured backend
   * that is unreachable fails the realtime connect on every `start()`, and an unhandled rejection
   * there would be a process-level error, not a degraded feature. Failing to subscribe only costs
   * remote-change triggers — the local-write and reconnect triggers still drive sync.
   */
  private subscribeRealtime(collection: string, track: (unsub: () => void) => void): void {
    void pb
      .collection(collection)
      .subscribe('*', () => this.scheduleSync())
      .then(track)
      .catch((err) => console.error(`[sync] realtime subscribe to ${collection} failed`, err))
  }

  /**
   * Fire-and-forget sync with rejection handling, so scheduled/event-driven syncs never leak
   * unhandled rejections. Skips while a backoff retry is already scheduled (Fix 2, invariant 2) —
   * this is what stops a reconnect, or a debounce timer that fired late (see `scheduleBackoff`),
   * from launching an attempt early and bypassing the backoff delay. The backoff timer's own
   * callback nulls `backoffTimer` before calling this, so the scheduled retry itself always runs.
   */
  private runSync(): void {
    if (this.backoffTimer) return
    this.syncNow().catch((err) => console.error('[sync] sync failed', err))
  }

  /**
   * Debounced local-write trigger. Does nothing while a backoff retry is already pending (Fix 2,
   * invariant 2) — the retry itself will observe the new write once it eventually runs.
   */
  private scheduleSync(): void {
    if (this.backoffTimer) return
    if (this.debounceTimer) clearTimeout(this.debounceTimer)
    this.debounceTimer = setTimeout(() => this.runSync(), 400)
  }

  /**
   * Runs one sync attempt, serialized against overlapping calls (Fix 2, invariant 1): a call that
   * arrives while another is in flight does not start a second `fullSync` — it marks a rerun and
   * returns `undefined` immediately; the in-flight call performs exactly one more attempt after
   * finishing, unless that attempt itself just scheduled a backoff retry (in which case the
   * pending rerun is dropped in favor of letting the retry run on its own schedule).
   */
  async syncNow(): Promise<SyncOutcome | undefined> {
    if (this.syncing) {
      this.rerunRequested = true
      return undefined
    }
    this.syncing = true
    try {
      let outcome: SyncOutcome | undefined
      for (;;) {
        this.rerunRequested = false
        outcome = await this.attemptSync()
        if (!this.rerunRequested || this.backoffTimer) break
      }
      return outcome
    } finally {
      this.syncing = false
    }
  }

  /** One sync attempt: offline short-circuit, then success/failure handling per the class doc. */
  private async attemptSync(): Promise<SyncOutcome | undefined> {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer)
      this.debounceTimer = null
    }
    if (!this.remote) return undefined
    if (!isOnline()) {
      await recomputePending()
      setSyncState('offline')
      return undefined
    }

    try {
      const outcome = await fullSync(this.remote)
      this.consecutiveFailures = 0
      if (this.backoffTimer) {
        clearTimeout(this.backoffTimer)
        this.backoffTimer = null
      }
      setBackendReachability('reachable')
      await recomputePending()
      this.reportPendingOrSynced()
      return outcome
    } catch (err) {
      this.consecutiveFailures += 1
      const cause = classifyFailure(err)
      // The second writer `backendStatus.ts` documents. Without it reachability is only ever
      // written at startup and on a browser online/offline transition, so a backend that dies or
      // recovers mid-session is never reported -- in either direction.
      //
      // Classified, not blanket: a rejected credential is proof the server *answered*, so
      // 'sign-in-needed' reports reachable. Only a transport failure reports unreachable. The
      // offline branch above writes nothing at all -- it short-circuits before any request, so it
      // has learned nothing about the server. Reporting from the first failure rather than from
      // the escalation threshold is deliberate: reachability is an observation, while
      // ESCALATION_THRESHOLD exists to keep the *sync status* from flapping on one blip.
      setBackendReachability(cause === 'sign-in-needed' ? 'reachable' : 'unreachable')
      await recomputePending()
      if (this.consecutiveFailures >= ESCALATION_THRESHOLD) {
        setSyncState('problem', cause)
      } else {
        this.reportPendingOrSynced()
      }
      this.scheduleBackoff()
      return undefined
    }
  }

  /** Reports 'pending' or 'synced' from the current pending count — shared by the success and below-threshold-failure branches. */
  private reportPendingOrSynced(): void {
    setSyncState(getSyncStatus().pendingCount > 0 ? 'pending' : 'synced')
  }

  private scheduleBackoff(): void {
    if (this.backoffTimer) clearTimeout(this.backoffTimer)
    // A debounce timer armed before this failure must not survive to fire independently later —
    // it would call runSync() and (absent the guard there too) launch an attempt before the
    // backoff delay elapses (Fix 2, invariant 2).
    if (this.debounceTimer) clearTimeout(this.debounceTimer)
    this.debounceTimer = null
    const delay = nextRetryDelayMs(this.consecutiveFailures)
    this.backoffTimer = setTimeout(() => {
      this.backoffTimer = null
      this.runSync()
    }, delay)
  }

  stop(): void {
    this.stopped = true
    if (this.debounceTimer) clearTimeout(this.debounceTimer)
    this.debounceTimer = null
    if (this.backoffTimer) clearTimeout(this.backoffTimer)
    this.backoffTimer = null
    this.consecutiveFailures = 0
    for (const off of this.unsubscribers) off()
    this.unsubscribers = []
    this.remote = null
  }
}
