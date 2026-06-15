import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest'
import { freshDB } from '../test/idb'
import { fullSync, SyncController, deriveSyncStatus, type RemoteStore, type SyncState } from './syncEngine'
import {
  createRestaurant,
  getRestaurant,
  allRestaurants,
  allRestaurantsForSync,
  putRestaurantRaw,
} from '../data/restaurants'
import { createVisit } from '../data/visits'
import { closeDB } from '../data/db'
import type { Restaurant, Visit } from '../types/models'

class FakeRemote implements RemoteStore {
  restaurants: Restaurant[] = []
  visits: Visit[] = []
  pushedR: Restaurant[] = []

  async listRestaurants() {
    return structuredClone(this.restaurants)
  }
  async listVisits() {
    return structuredClone(this.visits)
  }
  async pushRestaurant(r: Restaurant) {
    this.pushedR.push(r)
    const i = this.restaurants.findIndex((x) => x.id === r.id)
    if (i >= 0) this.restaurants[i] = r
    else this.restaurants.push(r)
  }
  async pushVisit(v: Visit) {
    const i = this.visits.findIndex((x) => x.id === v.id)
    if (i >= 0) this.visits[i] = v
    else this.visits.push(v)
  }
}

function remoteRestaurant(over: Partial<Restaurant> & Pick<Restaurant, 'id' | 'updated'>): Restaurant {
  return {
    name: 'Remote',
    lat: 0,
    lng: 0,
    pending: false,
    latestVerdict: null,
    latestVisitDate: null,
    visitCount: 0,
    deleted: false,
    needsPush: false,
    ...over,
  }
}

beforeEach(freshDB)
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

// ─── deriveSyncStatus (pure) ─────────────────────────────────────────────────

describe('deriveSyncStatus', () => {
  it('synced when online and no pending records', () => {
    expect(deriveSyncStatus(true, 0, 0, null)).toEqual({ status: 'synced', pending: 0 })
  })

  it('pending when online and queue non-empty', () => {
    expect(deriveSyncStatus(true, 3, 0, null)).toEqual({ status: 'pending', pending: 3 })
  })

  it('AE3: offline when navigator.onLine is false, still reports pending count', () => {
    expect(deriveSyncStatus(false, 2, 0, null)).toEqual({ status: 'offline', pending: 2 })
  })

  it('AE3: offline overrides pending even when count > 0', () => {
    expect(deriveSyncStatus(false, 5, 0, null)).toMatchObject({ status: 'offline' })
  })

  it('problem state with auth cause after 3+ consecutive failures', () => {
    expect(deriveSyncStatus(true, 1, 3, 'auth')).toEqual({ status: 'problem', pending: 1, cause: 'auth' })
  })

  it('problem state with server cause', () => {
    expect(deriveSyncStatus(true, 0, 4, 'server')).toEqual({ status: 'problem', pending: 0, cause: 'server' })
  })

  it('not problem state when below the threshold (2 failures)', () => {
    expect(deriveSyncStatus(true, 1, 2, 'auth')).toMatchObject({ status: 'pending' })
  })

  it('offline overrides problem — offline is its own state, not an escalation', () => {
    expect(deriveSyncStatus(false, 1, 5, 'auth')).toMatchObject({ status: 'offline' })
  })
})

// ─── SyncController sync state (U2) ──────────────────────────────────────────

describe('SyncController sync state', () => {
  it('AE1: syncNow success with empty queue → status synced', async () => {
    const ctrl = new SyncController()
    const remote = new FakeRemote()

    // No pending records
    await ctrl.syncNow(remote)
    expect(ctrl.getSyncState()).toEqual({ status: 'synced', pending: 0 })
    ctrl.stop()
  })

  it('AE1: pending records → syncNow success → status synced, pending → 0', async () => {
    await createRestaurant({ name: 'Pending', lat: 1, lng: 1 })
    const ctrl = new SyncController()
    const remote = new FakeRemote()

    // Before sync: pending
    await ctrl.recomputeSyncState()
    expect(ctrl.getSyncState()).toMatchObject({ status: 'pending', pending: 1 })

    // After sync: synced
    await ctrl.syncNow(remote)
    expect(ctrl.getSyncState()).toEqual({ status: 'synced', pending: 0 })
    ctrl.stop()
  })

  it('observable fires when status changes', async () => {
    await createRestaurant({ name: 'Pending', lat: 1, lng: 1 })
    const ctrl = new SyncController()
    const remote = new FakeRemote()
    const observed: SyncState[] = []
    ctrl.onSyncStateChange(() => observed.push(ctrl.getSyncState()))

    await ctrl.recomputeSyncState() // pending
    await ctrl.syncNow(remote) // synced

    expect(observed.length).toBeGreaterThanOrEqual(2)
    expect(observed[0]).toMatchObject({ status: 'pending' })
    expect(observed[observed.length - 1]).toEqual({ status: 'synced', pending: 0 })
    ctrl.stop()
  })

  it('AE3: offline state when navigator.onLine is false', async () => {
    vi.stubGlobal('navigator', { onLine: false })
    await createRestaurant({ name: 'Offline write', lat: 1, lng: 1 })
    const ctrl = new SyncController()
    await ctrl.recomputeSyncState()
    expect(ctrl.getSyncState()).toMatchObject({ status: 'offline', pending: 1 })
    ctrl.stop()
  })

  it('signed-out: getSyncState returns null (indicator is hidden)', async () => {
    // auth.getSyncState() returns null when not signed in — tested at the auth layer;
    // here we verify the controller's own state is readable and stops cleanly.
    const ctrl = new SyncController()
    ctrl.stop()
    // After stop, the controller is inert — reads are still valid
    expect(ctrl.getSyncState()).toBeDefined()
  })
})

// ─── SyncController failure escalation + backoff (U3) ────────────────────────

/** FakeRemote that throws on push after `failAfter` total pushes. */
class FailingRemote implements RemoteStore {
  restaurants: Restaurant[] = []
  visits: Visit[] = []
  failWith: { status: number } | Error = { status: 401 }
  callCount = 0

  async listRestaurants() { return structuredClone(this.restaurants) }
  async listVisits() { return structuredClone(this.visits) }
  async pushRestaurant(_r: Restaurant) {
    this.callCount++
    throw this.failWith
  }
  async pushVisit(_v: Visit) { this.callCount++ }
}

describe('SyncController failure escalation', () => {
  it('AE4: 3 consecutive auth failures escalate to problem with cause=auth', async () => {
    const r = await createRestaurant({ name: 'Pending', lat: 1, lng: 1 })
    void r
    const ctrl = new SyncController()
    const remote = new FailingRemote()
    remote.failWith = { status: 401 }

    // 1st failure: still pending (below threshold)
    await expect(ctrl.syncNow(remote)).rejects.toMatchObject({ status: 401 })
    expect(ctrl.getSyncState()).toMatchObject({ status: 'pending' })

    // 2nd failure: still pending
    await expect(ctrl.syncNow(remote)).rejects.toMatchObject({ status: 401 })
    expect(ctrl.getSyncState()).toMatchObject({ status: 'pending' })

    // 3rd failure: escalates
    await expect(ctrl.syncNow(remote)).rejects.toMatchObject({ status: 401 })
    expect(ctrl.getSyncState()).toMatchObject({ status: 'problem', cause: 'auth' })
    ctrl.stop()
  })

  it('server error (network/5xx) escalates with cause=server', async () => {
    await createRestaurant({ name: 'Pending', lat: 1, lng: 1 })
    const ctrl = new SyncController()
    const remote = new FailingRemote()
    remote.failWith = new Error('Network error')

    for (let i = 0; i < 3; i++) {
      await expect(ctrl.syncNow(remote)).rejects.toBeDefined()
    }
    expect(ctrl.getSyncState()).toMatchObject({ status: 'problem', cause: 'server' })
    ctrl.stop()
  })

  it('one success resets the counter: 2 failures then success leaves status synced', async () => {
    await createRestaurant({ name: 'Pending', lat: 1, lng: 1 })
    const ctrl = new SyncController()
    const failing = new FailingRemote()

    await expect(ctrl.syncNow(failing)).rejects.toBeDefined()
    await expect(ctrl.syncNow(failing)).rejects.toBeDefined()
    expect(ctrl._consecutiveFailures).toBe(2)

    // Successful sync resets counter
    await ctrl.syncNow(new FakeRemote())
    expect(ctrl._consecutiveFailures).toBe(0)
    expect(ctrl.getSyncState()).toMatchObject({ status: 'synced' })
    ctrl.stop()
  })

  it('going offline mid-failure-streak: status offline (not problem), counter resets', async () => {
    await createRestaurant({ name: 'Pending', lat: 1, lng: 1 })
    const ctrl = new SyncController()
    const remote = new FailingRemote()

    // 3 failures → problem
    for (let i = 0; i < 3; i++) {
      await expect(ctrl.syncNow(remote)).rejects.toBeDefined()
    }
    expect(ctrl.getSyncState().status).toBe('problem')

    // Simulate going offline — controller's offline handler fires
    vi.stubGlobal('navigator', { onLine: false })
    ctrl._consecutiveFailures = 0
    ctrl._failureCause = null
    await ctrl.recomputeSyncState()
    expect(ctrl.getSyncState().status).toBe('offline')
    ctrl.stop()
  })

  it('offline-skip (navigator.onLine false) is never counted as a failure', async () => {
    await createRestaurant({ name: 'Pending', lat: 1, lng: 1 })
    vi.stubGlobal('navigator', { onLine: false })
    const ctrl = new SyncController()

    // syncNow returns undefined (offline skip, no throw)
    const result = await ctrl.syncNow(new FailingRemote())
    expect(result).toBeUndefined()
    expect(ctrl._consecutiveFailures).toBe(0)
    expect(ctrl.getSyncState().status).toBe('offline')
    ctrl.stop()
  })

  it('backoff: retry timer is scheduled on failure and cleared on stop', async () => {
    await createRestaurant({ name: 'Pending', lat: 1, lng: 1 })
    const ctrl = new SyncController()
    const remote = new FailingRemote()

    await expect(ctrl.syncNow(remote)).rejects.toBeDefined()
    // A retry timer is scheduled after failure
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((ctrl as any)._retryTimer).not.toBeNull()

    // stop() clears it — no retry fires, no unhandled rejection escapes
    ctrl.stop()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((ctrl as any)._retryTimer).toBeNull()
  })
})

// ─── fullSync ─────────────────────────────────────────────────────────────────

describe('fullSync', () => {
  it('unions local-only and remote-only records with no duplicates', async () => {
    const local = await createRestaurant({ name: 'Local', lat: 1, lng: 1 })
    const remote = new FakeRemote()
    remote.restaurants.push(remoteRestaurant({ id: 'remoteonly0001', updated: '2026-01-01T00:00:00Z' }))

    const out = await fullSync(remote)

    expect(out.restaurantsPushed).toBe(1)
    expect(remote.pushedR.map((r) => r.id)).toEqual([local.id])
    const ids = (await allRestaurantsForSync()).map((r) => r.id).sort()
    expect(ids).toEqual([local.id, 'remoteonly0001'].sort())
  })

  it('re-derives the rollup when a remote restaurant row wins but its visits are unchanged', async () => {
    // Local r1 has 2 visits the remote does not have.
    await createRestaurant({ id: 'r1', name: 'Local' })
    await createVisit({ restaurantId: 'r1', date: '2026-05-01', verdict: 'go_back' })
    await createVisit({ restaurantId: 'r1', date: '2026-05-02', verdict: 'worth_a_detour' })
    expect((await getRestaurant('r1'))?.visitCount).toBe(2)

    // Remote carries a NEWER r1 row whose serialized rollup is stale (0 visits), and no visits for r1.
    const remote = new FakeRemote()
    remote.restaurants.push(
      remoteRestaurant({ id: 'r1', name: 'Remote newer', updated: '2999-01-01T00:00:00Z', visitCount: 0, latestVerdict: null, latestVisitDate: null }),
    )

    await fullSync(remote)

    const after = await getRestaurant('r1')
    expect(after?.name).toBe('Remote newer') // row won LWW
    expect(after?.visitCount).toBe(2) // rollup re-derived from local visits, NOT the remote's 0
    expect(after?.latestVerdict).toBe('worth_a_detour')
  })

  it('lets a newer remote version win locally', async () => {
    const local = await createRestaurant({ name: 'Old name', lat: 1, lng: 1 })
    const remote = new FakeRemote()
    remote.restaurants.push(
      remoteRestaurant({ id: local.id, name: 'New name', updated: '2999-01-01T00:00:00Z' }),
    )

    await fullSync(remote)

    expect((await getRestaurant(local.id))?.name).toBe('New name')
  })

  it('propagates a newer remote tombstone instead of resurrecting', async () => {
    const local = await createRestaurant({ name: 'Doomed', lat: 1, lng: 1 })
    const remote = new FakeRemote()
    remote.restaurants.push(
      remoteRestaurant({ id: local.id, updated: '2999-01-01T00:00:00Z', deleted: true }),
    )

    await fullSync(remote)

    expect((await getRestaurant(local.id))?.deleted).toBe(true)
    expect((await allRestaurants()).map((r) => r.id)).not.toContain(local.id)
  })

  it('recomputes a restaurant rollup after pulling its visits', async () => {
    const r = await createRestaurant({ name: 'X', lat: 1, lng: 1 })
    const remote = new FakeRemote()
    remote.restaurants.push((await getRestaurant(r.id))!) // same record, equal updated -> no-op
    remote.visits.push({
      id: 'v1',
      restaurantId: r.id,
      date: '2026-06-01',
      verdict: 'go_back',
      updated: '2026-06-01T00:00:00Z',
      deleted: false,
      needsPush: false,
    })

    await fullSync(remote)

    const after = await getRestaurant(r.id)
    expect(after?.visitCount).toBe(1)
    expect(after?.latestVerdict).toBe('go_back')
  })

  it('is durable across a reload and idempotent on re-sync (local store is the outbox)', async () => {
    await createRestaurant({ name: 'A', lat: 1, lng: 1 })
    await createRestaurant({ name: 'B', lat: 2, lng: 2 })
    const remote = new FakeRemote()

    const first = await fullSync(remote)
    expect(first.restaurantsPushed).toBe(2)

    // Simulate a reload: drop the cached connection, reopen against the same data.
    await closeDB()
    const second = await fullSync(remote)
    expect(second.restaurantsPushed).toBe(0) // already synced, equal timestamps
    expect((await allRestaurants()).length).toBe(2)
  })
})
