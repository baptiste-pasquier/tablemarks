import type { Restaurant, Visit } from '../types/models'
import {
  allRestaurantsForSync,
  putRestaurantRaw,
} from '../data/restaurants'
import { allVisitsForSync, putVisitRaw } from '../data/visits'
import { recomputeRollup } from '../data/rollup'
import { onLocalChange, onStoreChange, emitStoreChange } from '../data/events'
import { pendingCount } from '../data/pending'
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

export interface SyncState {
  status: 'synced' | 'pending' | 'offline' | 'problem'
  pending: number
  cause?: 'auth' | 'server'
}

/** Pure: derive the indicator state from connectivity and queue metrics. */
export function deriveSyncStatus(
  online: boolean,
  pending: number,
  consecutiveFailures: number,
  failureCause: 'auth' | 'server' | null,
): SyncState {
  if (!online) return { status: 'offline', pending }
  if (consecutiveFailures >= 3 && failureCause !== null) {
    return { status: 'problem', pending, cause: failureCause }
  }
  if (pending > 0) return { status: 'pending', pending }
  return { status: 'synced', pending: 0 }
}

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
  // Recompute the rollup for every restaurant whose row OR visits we wrote. A pulled row wins LWW
  // carrying the peer's serialized rollup; the rollup is a local-derived cache, never trusted from
  // outside, so re-derive it from this device's visits. Keying only on written visits would leave a
  // pulled row with a stale foreign rollup (the same bug fixed on the import path).
  const affected = new Set<string>()
  for (const rec of r.toWriteLocal) {
    await putRestaurantRaw(rec)
    affected.add(rec.id)
  }
  for (const rec of r.toPush) {
    await remote.pushRestaurant(rec)
    // Clear the pending marker after a successful push — raw write, no updated bump.
    await putRestaurantRaw({ ...rec, needsPush: false })
  }

  const [localV, remoteV] = await Promise.all([allVisitsForSync(), remote.listVisits()])
  const v = reconcile(localV, remoteV)
  for (const rec of v.toWriteLocal) {
    await putVisitRaw(rec)
    affected.add(rec.restaurantId)
  }
  for (const rec of v.toPush) {
    await remote.pushVisit(rec)
    await putVisitRaw({ ...rec, needsPush: false })
  }

  for (const restaurantId of affected) await recomputeRollup(restaurantId)
  if (affected.size > 0) emitStoreChange()

  return {
    restaurantsWritten: r.toWriteLocal.length,
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

/**
 * Drives sync while signed in: an initial reconcile, then re-syncs on local writes (debounced),
 * on reconnect, and on remote realtime changes. Stopping leaves the local store untouched.
 */
export class SyncController {
  private _remote: RemoteStore | null = null
  private _unsubscribers: Array<() => void> = []
  private _debounceTimer: ReturnType<typeof setTimeout> | null = null
  private _retryTimer: ReturnType<typeof setTimeout> | null = null
  private _retryDelay = 5000
  private _stopped = false
  private _syncState: SyncState = { status: 'synced', pending: 0 }
  private _stateListeners = new Set<() => void>()
  _consecutiveFailures = 0
  _failureCause: 'auth' | 'server' | null = null

  getSyncState(): SyncState {
    return this._syncState
  }

  onSyncStateChange(cb: () => void): () => void {
    this._stateListeners.add(cb)
    return () => this._stateListeners.delete(cb)
  }

  async recomputeSyncState(): Promise<void> {
    const count = await pendingCount()
    const next = deriveSyncStatus(navigator.onLine, count, this._consecutiveFailures, this._failureCause)
    if (
      this._syncState.status !== next.status ||
      this._syncState.pending !== next.pending ||
      this._syncState.cause !== next.cause
    ) {
      this._syncState = next
      for (const cb of this._stateListeners) cb()
    }
  }

  async start(remote: RemoteStore): Promise<void> {
    this._remote = remote
    this._stopped = false
    this._unsubscribers.push(onLocalChange(() => this._scheduleSync()))
    this._unsubscribers.push(onStoreChange(() => { void this.recomputeSyncState() }))
    const online = () => this._runSync()
    const offline = () => {
      this._consecutiveFailures = 0
      this._failureCause = null
      this._clearRetry()
      void this.recomputeSyncState()
    }
    window.addEventListener('online', online)
    window.addEventListener('offline', offline)
    this._unsubscribers.push(() => window.removeEventListener('online', online))
    this._unsubscribers.push(() => window.removeEventListener('offline', offline))
    // subscribe() is async — if stop() already ran by the time it resolves, unsubscribe
    // immediately rather than registering a listener that stop() will never clean up.
    const track = (unsub: () => void) => {
      if (this._stopped) void unsub()
      else this._unsubscribers.push(unsub)
    }
    void pb.collection('restaurants').subscribe('*', () => this._scheduleSync()).then(track)
    void pb.collection('visits').subscribe('*', () => this._scheduleSync()).then(track)
    // Best-effort initial reconcile — a failure here (e.g. PocketBase down on sign-in) must not
    // prevent the controller from starting; subscriptions are registered so a later trigger recovers.
    this._runSync()
  }

  /** Fire-and-forget sync with rejection handling, so scheduled/event-driven syncs never leak unhandled rejections. */
  private _runSync(): void {
    this.syncNow().catch((err) => console.error('[sync] sync failed', err))
  }

  private _scheduleSync(): void {
    if (this._debounceTimer) clearTimeout(this._debounceTimer)
    this._debounceTimer = setTimeout(() => this._runSync(), 400)
  }

  private _clearRetry(): void {
    if (this._retryTimer) {
      clearTimeout(this._retryTimer)
      this._retryTimer = null
    }
    this._retryDelay = 5000
  }

  private _scheduleRetry(): void {
    if (this._retryTimer || !navigator.onLine || this._stopped) return
    this._retryTimer = setTimeout(() => {
      this._retryTimer = null
      this._runSync()
    }, this._retryDelay)
    this._retryDelay = Math.min(this._retryDelay * 2, 300_000)
  }

  /** Exposed for testing: run a sync against the given remote (or the registered one). */
  async syncNow(remote?: RemoteStore): Promise<SyncOutcome | undefined> {
    const r = remote ?? this._remote
    if (!r || !navigator.onLine) return undefined
    try {
      const outcome = await fullSync(r)
      this._consecutiveFailures = 0
      this._failureCause = null
      this._clearRetry()
      await this.recomputeSyncState()
      return outcome
    } catch (err) {
      this._failureCause = classifyError(err)
      this._consecutiveFailures++
      this._scheduleRetry()
      await this.recomputeSyncState()
      throw err
    }
  }

  stop(): void {
    this._stopped = true
    if (this._debounceTimer) clearTimeout(this._debounceTimer)
    this._debounceTimer = null
    this._clearRetry()
    for (const off of this._unsubscribers) off()
    this._unsubscribers = []
    this._remote = null
  }
}

function classifyError(err: unknown): 'auth' | 'server' {
  const status = (err as { status?: number })?.status
  if (status === 401 || status === 403) return 'auth'
  return 'server'
}
