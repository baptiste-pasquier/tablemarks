import type { Restaurant, Visit } from '../types/models'
import {
  allRestaurantsForSync,
  putRestaurantRaw,
} from '../data/restaurants'
import { allVisitsForSync, putVisitRaw } from '../data/visits'
import { recomputeRollup } from '../data/rollup'
import { onLocalChange, onStoreChange, emitStoreChange } from '../data/events'
import { pendingCount } from '../data/pending'
import { deriveSyncState, type ProblemCause, type SyncState } from './syncStatus'
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
    // Confirmed pushed → mark synced locally (raw write, no `updated` bump).
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
const SYNCED: SyncState = { status: 'synced', pending: 0, cause: null }

export class SyncController {
  private remote: RemoteStore | null = null
  private unsubscribers: Array<() => void> = []
  private timer: ReturnType<typeof setTimeout> | null = null
  private stopped = false
  // Observable sync state for the indicator (U7 trust layer). Read-only to the UI.
  private state: SyncState = SYNCED
  private stateListeners = new Set<() => void>()
  private problem: ProblemCause | null = null

  /** Current indicator state — a stable reference between changes (safe for useSyncExternalStore). */
  getState(): SyncState {
    return this.state
  }

  /** Subscribe to indicator-state changes; returns an unsubscribe. */
  onState(cb: () => void): () => void {
    this.stateListeners.add(cb)
    return () => this.stateListeners.delete(cb)
  }

  /** Recompute the indicator state from live signals and notify if it changed. */
  private async refreshState(): Promise<void> {
    let pending = 0
    try {
      pending = await pendingCount()
    } catch {
      // a store read failure shouldn't crash the indicator; leave the count at 0
    }
    const next = deriveSyncState({ online: navigator.onLine, pending, problem: this.problem })
    if (next.status !== this.state.status || next.pending !== this.state.pending || next.cause !== this.state.cause) {
      this.state = next
      for (const cb of this.stateListeners) cb()
    }
  }

  async start(remote: RemoteStore): Promise<void> {
    this.remote = remote
    this.stopped = false
    this.problem = null
    this.unsubscribers.push(onLocalChange(() => this.scheduleSync()))
    // Recompute the indicator on any store change (user write or sync-applied clear).
    this.unsubscribers.push(onStoreChange(() => void this.refreshState()))
    const online = () => {
      void this.refreshState()
      this.runSync()
    }
    const offline = () => void this.refreshState()
    window.addEventListener('online', online)
    window.addEventListener('offline', offline)
    this.unsubscribers.push(() => window.removeEventListener('online', online))
    this.unsubscribers.push(() => window.removeEventListener('offline', offline))
    void this.refreshState()
    // subscribe() is async — if stop() already ran by the time it resolves, unsubscribe
    // immediately rather than registering a listener that stop() will never clean up.
    const track = (unsub: () => void) => {
      if (this.stopped) void unsub()
      else this.unsubscribers.push(unsub)
    }
    void pb.collection('restaurants').subscribe('*', () => this.scheduleSync()).then(track)
    void pb.collection('visits').subscribe('*', () => this.scheduleSync()).then(track)
    // Best-effort initial reconcile — a failure here (e.g. PocketBase down on sign-in) must not
    // prevent the controller from starting; subscriptions are registered so a later trigger recovers.
    this.runSync()
  }

  /** Fire-and-forget sync with rejection handling, so scheduled/event-driven syncs never leak unhandled rejections. */
  private runSync(): void {
    this.syncNow().catch((err) => console.error('[sync] sync failed', err))
  }

  private scheduleSync(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => this.runSync(), 400)
  }

  async syncNow(): Promise<SyncOutcome | undefined> {
    if (!this.remote || !navigator.onLine) return undefined
    return fullSync(this.remote)
  }

  stop(): void {
    this.stopped = true
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    for (const off of this.unsubscribers) off()
    this.unsubscribers = []
    this.remote = null
    this.problem = null
    // Reset to a neutral state; the indicator is hidden when signed out, but keep state honest.
    if (this.state !== SYNCED) {
      this.state = SYNCED
      for (const cb of this.stateListeners) cb()
    }
  }
}
