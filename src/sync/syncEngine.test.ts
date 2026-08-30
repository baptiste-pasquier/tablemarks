import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest'
import { freshDB } from '../test/idb'
import { fullSync, SyncController, type RemoteStore } from './syncEngine'
import { getSyncStatus } from './syncStatus'
import { pb } from './pocketbase'
import {
  createRestaurant,
  updateRestaurant,
  getRestaurant,
  allRestaurants,
  allRestaurantsForSync,
} from '../data/restaurants'
import { createVisit } from '../data/visits'
import { closeDB } from '../data/db'
import { onLocalChange, onStoreChange } from '../data/events'
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

/** A FakeRemote whose `listRestaurants` can be slowed down, to hold a `fullSync` "in flight". */
class DelayedRemote extends FakeRemote {
  listCalls = 0
  delayMs = 0

  async listRestaurants(): Promise<Restaurant[]> {
    this.listCalls++
    if (this.delayMs > 0) await new Promise((resolve) => setTimeout(resolve, this.delayMs))
    return super.listRestaurants()
  }
}

/** A FakeRemote whose `listRestaurants` always rejects, to exercise failure/backoff/escalation. */
class FailingRemote extends FakeRemote {
  attempts = 0
  err: unknown = new Error('network down')

  async listRestaurants(): Promise<Restaurant[]> {
    this.attempts++
    throw this.err
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
    ...over,
  }
}

beforeEach(freshDB)

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

  it('marks pushed and written-local records synced immediately after each write', async () => {
    const local = await createRestaurant({ name: 'Local', lat: 1, lng: 1 })
    const remote = new FakeRemote()
    remote.restaurants.push(remoteRestaurant({ id: 'remoteonly0001', updated: '2026-01-01T00:00:00Z' }))

    await fullSync(remote)

    const pushed = await getRestaurant(local.id)
    expect(pushed?.syncedUpdated).toBe(local.updated)

    const written = (await allRestaurantsForSync()).find((r) => r.id === 'remoteonly0001')
    expect(written?.syncedUpdated).toBe(written?.updated)
  })

  it('marks a pre-existing agreed-upon record synced after one fullSync pass (Fix 1: the noop case)', async () => {
    // Simulates a record saved before `syncedUpdated` existed: local and remote already agree on
    // `updated`, but the local marker was never stamped. Without Fix 1 this would read as pending
    // forever, since it lands in neither `toWriteLocal` nor `toPush`.
    const r = await createRestaurant({ id: 'r1', name: 'Already synced', lat: 1, lng: 1 })
    expect((await getRestaurant('r1'))?.syncedUpdated).toBeUndefined()

    const remote = new FakeRemote()
    remote.restaurants.push(remoteRestaurant({ id: 'r1', name: 'Already synced', updated: r.updated }))

    await fullSync(remote)

    const after = await getRestaurant('r1')
    expect(after?.syncedUpdated).toBe(r.updated)
  })

  it('a push failure partway through a batch still marks the records pushed before it as synced', async () => {
    await createRestaurant({ id: 'a1', name: 'A', lat: 1, lng: 1 })
    await createRestaurant({ id: 'b1', name: 'B', lat: 2, lng: 2 })
    const remote = new FakeRemote()
    let calls = 0
    const originalPush = remote.pushRestaurant.bind(remote)
    remote.pushRestaurant = async (r: Restaurant) => {
      calls++
      if (calls === 2) throw new Error('boom')
      await originalPush(r)
    }

    await expect(fullSync(remote)).rejects.toThrow('boom')

    const recs = await allRestaurantsForSync()
    const synced = recs.filter((r) => r.syncedUpdated === r.updated)
    expect(synced.length).toBe(1) // exactly one of the two got marked before the failure
  })

  it('U2: a local edit landing between the reconcile snapshot and the pull-write is preserved, not clobbered', async () => {
    const local = await createRestaurant({ id: 'r1', name: 'Original', lat: 1, lng: 1 })

    // A remote whose listRestaurants() blocks indefinitely until the test releases it — this
    // removes any dependency on real elapsed time (a fixed delay was flaky under load: whether
    // it was "enough" time varied run to run). allRestaurantsForSync()'s own (ungated) read is
    // free to complete on its own while the gate holds fullSync's Promise.all open.
    let releaseRemote: () => void = () => {}
    const gate = new Promise<void>((resolve) => {
      releaseRemote = resolve
    })
    class GatedRemote extends FakeRemote {
      async listRestaurants(): Promise<Restaurant[]> {
        await gate
        return super.listRestaurants()
      }
    }
    const remote = new GatedRemote()
    remote.restaurants.push(
      remoteRestaurant({ id: 'r1', name: 'Remote pulled', updated: '2999-01-01T00:00:00Z' }),
    )

    const syncPromise = fullSync(remote)
    // Flush pending IndexedDB task-queue callbacks so the (ungated) local snapshot read settles
    // before the edit below — the gate above guarantees fullSync's write loop cannot possibly
    // run before we release it, regardless of how long this flush takes.
    await new Promise((resolve) => setTimeout(resolve, 0))
    await new Promise((resolve) => setTimeout(resolve, 0))
    const edited = await updateRestaurant(local.id, { name: 'Edited during sync' })
    releaseRemote()
    await syncPromise

    const after = await getRestaurant('r1')
    expect(after?.name).toBe('Edited during sync') // pull did NOT clobber the newer local edit
    expect(after?.updated).toBe(edited.updated)
    expect(after?.syncedUpdated).not.toBe('2999-01-01T00:00:00Z') // not falsely marked synced to the pull
  })

  it('U2: the pulled-restaurant write emits emitStoreChange(), not emitLocalChange()', async () => {
    const remote = new FakeRemote()
    remote.restaurants.push(remoteRestaurant({ id: 'remoteonly0001', updated: '2026-01-01T00:00:00Z' }))
    const localFired = vi.fn()
    const storeFired = vi.fn()
    const offLocal = onLocalChange(localFired)
    const offStore = onStoreChange(storeFired)

    try {
      await fullSync(remote)
    } finally {
      offLocal()
      offStore()
    }

    expect(localFired).not.toHaveBeenCalled()
    expect(storeFired).toHaveBeenCalled()
  })
})

describe('SyncController', () => {
  let controller: SyncController | undefined

  afterEach(() => {
    controller?.stop()
    controller = undefined
    vi.restoreAllMocks()
  })

  /** SyncController.start() subscribes to PocketBase realtime — stub it out so tests never touch the network. */
  function stubRealtime(): void {
    vi.spyOn(pb, 'collection').mockReturnValue({
      subscribe: vi.fn().mockResolvedValue(() => {}),
    } as unknown as ReturnType<typeof pb.collection>)
  }

  /** Real-timer flush: lets an in-flight sync attempt (async DB + remote calls) settle before asserting. */
  function flush(ms = 30): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  it('offline: reports state offline with the correct pending count, not problem, no failure counted', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    await createRestaurant({ name: 'A', lat: 1, lng: 1 })
    await createRestaurant({ name: 'B', lat: 2, lng: 2 })
    stubRealtime()

    controller = new SyncController()
    await controller.start(new FakeRemote())
    await flush()

    expect(getSyncStatus()).toMatchObject({ state: 'offline', pendingCount: 2, cause: undefined })
  })

  it('a write made offline is still reported pending by a fresh SyncController after a simulated reload', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    await createRestaurant({ name: 'Offline write', lat: 1, lng: 1 })
    stubRealtime()

    controller = new SyncController()
    await controller.start(new FakeRemote())
    await flush()
    controller.stop()

    // Simulate a reload: a fresh instance against the same (still offline) IndexedDB.
    const reloaded = new SyncController()
    await reloaded.start(new FakeRemote())
    await flush()
    expect(getSyncStatus().pendingCount).toBe(1)
    reloaded.stop()
  })

  it('happy path: pending changes flush and status moves from pending to synced once reconnected', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    await createRestaurant({ name: 'Offline write', lat: 1, lng: 1 })
    stubRealtime()
    const remote = new FakeRemote()

    controller = new SyncController()
    await controller.start(remote)
    await flush()
    expect(getSyncStatus().state).toBe('offline')

    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
    await controller.syncNow()

    expect(getSyncStatus()).toMatchObject({ state: 'synced', pendingCount: 0 })
  })

  it('two consecutive non-offline failures (below threshold) leave status at pending, not problem', async () => {
    await createRestaurant({ name: 'A', lat: 1, lng: 1 })
    stubRealtime()
    const remote = new FailingRemote()

    controller = new SyncController()
    await controller.start(remote) // failure #1
    await flush()
    expect(getSyncStatus().state).toBe('pending')

    await controller.syncNow() // failure #2 — still below the 3-failure threshold
    expect(getSyncStatus()).toMatchObject({ state: 'pending', cause: undefined })
    expect(remote.attempts).toBe(2)
  })

  it('escalates to problem with cause sign-in-needed after three consecutive 401 failures, then recovers on success', async () => {
    await createRestaurant({ name: 'A', lat: 1, lng: 1 })
    stubRealtime()
    const remote = new FailingRemote()
    remote.err = Object.assign(new Error('unauthorized'), { status: 401 })

    controller = new SyncController()
    await controller.start(remote) // failure #1
    await flush()
    expect(getSyncStatus().state).toBe('pending')

    await controller.syncNow() // failure #2
    expect(getSyncStatus().state).toBe('pending')

    await controller.syncNow() // failure #3 — escalates
    expect(getSyncStatus()).toMatchObject({ state: 'problem', cause: 'sign-in-needed' })

    // Recovery: the underlying remote starts working again (e.g. the user signs back in).
    const workingRemote = new FakeRemote()
    Object.assign(remote, {
      listRestaurants: workingRemote.listRestaurants.bind(workingRemote),
      listVisits: workingRemote.listVisits.bind(workingRemote),
      pushRestaurant: workingRemote.pushRestaurant.bind(workingRemote),
      pushVisit: workingRemote.pushVisit.bind(workingRemote),
    })
    await controller.syncNow()

    expect(getSyncStatus()).toMatchObject({ state: 'synced', pendingCount: 0, cause: undefined })
  })

  it('Fix 2 (invariant 1): triggers firing back-to-back while a sync is in flight collapse into at most one rerun', async () => {
    await createRestaurant({ name: 'A', lat: 1, lng: 1 })
    const remote = new DelayedRemote()
    remote.delayMs = 80
    stubRealtime()

    controller = new SyncController()
    await controller.start(remote) // kicks off an in-flight sync that will take ~80ms
    // Two more triggers arrive while that sync is still running.
    const p1 = controller.syncNow()
    const p2 = controller.syncNow()
    await Promise.all([p1, p2])
    await flush(250) // let a legitimate single rerun (if requested) finish

    expect(remote.listCalls).toBe(2) // the in-flight sync, plus exactly one rerun — never three
  })

  it('Fix 2 (invariant 2): a local write does not bypass an already-scheduled backoff retry', async () => {
    stubRealtime()
    const remote = new FailingRemote()

    controller = new SyncController()
    await controller.start(remote) // failure #1 schedules a ~5s backoff retry
    await flush()
    expect(remote.attempts).toBe(1)
    expect(getSyncStatus().state).not.toBe('problem')

    // A local write arrives while the backoff retry is pending — must not schedule an earlier
    // (400ms) retry that fires before the backoff delay elapses.
    await createRestaurant({ name: 'While backing off', lat: 1, lng: 1 })
    await flush(450) // past the 400ms debounce window, nowhere near the ~5s backoff delay

    expect(remote.attempts).toBe(1) // no extra attempt ran early
  })

  it('a bare "offline" transition mid-session, with nothing else pending, reports state offline (review #3)', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
    stubRealtime()
    const remote = new FakeRemote()

    controller = new SyncController()
    await controller.start(remote)
    await flush()
    expect(getSyncStatus().state).toBe('synced')

    // Connectivity drops with no local write, no reconnect, and no realtime message — only the
    // shared online/offline listener can notice, so this is the only path that can report it.
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    window.dispatchEvent(new Event('offline'))
    await flush()

    expect(getSyncStatus()).toMatchObject({ state: 'offline', cause: undefined })
  })

  it('a reused SyncController does not inherit the prior session\'s failure count across stop()/start() (review #1)', async () => {
    await createRestaurant({ name: 'A', lat: 1, lng: 1 })
    stubRealtime()
    const remote = new FailingRemote()

    controller = new SyncController()
    await controller.start(remote) // session A, failure #1
    await flush()
    await controller.syncNow() // session A, failure #2 — still below threshold
    expect(getSyncStatus().state).toBe('pending')

    controller.stop()
    await controller.start(remote) // session B, on the SAME controller instance — failure #1 of B
    await flush()

    // Without the reset, consecutiveFailures would already be 2 entering session B, so this single
    // new failure would push it to 3 and escalate to 'problem' after only one failure in session B.
    expect(getSyncStatus()).toMatchObject({ state: 'pending', cause: undefined })
  })

  it('an online/reconnect event does not bypass an already-scheduled backoff retry (review #4)', async () => {
    stubRealtime()
    const remote = new FailingRemote()

    controller = new SyncController()
    await controller.start(remote) // failure #1 schedules a ~5s backoff retry
    await flush()
    expect(remote.attempts).toBe(1)
    expect(getSyncStatus().state).not.toBe('problem')

    // A reconnect fires while the backoff retry is pending — must not launch an immediate attempt
    // that bypasses the scheduled backoff delay.
    window.dispatchEvent(new Event('online'))
    await flush()

    expect(remote.attempts).toBe(1) // no extra attempt ran early
  })
})
