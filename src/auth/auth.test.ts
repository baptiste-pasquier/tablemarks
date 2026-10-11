import { beforeEach, describe, it, expect, vi, afterEach } from 'vitest'
import { openDB } from 'idb'
import { freshDB } from '../test/idb'
import { fakeSession } from '../test/session'
import { auth, AuthService } from './auth'
import { SignOutIncomplete } from './signOutIncomplete'
import { pb } from '../sync/pocketbase'
import { recomputePending } from '../sync/syncStatus'
import { createRestaurant, allRestaurants } from '../data/restaurants'
import { closeDB } from '../data/db'
import { bindStoreOwner, getStoreOwner, isLegacyStore, wipeLocalStore } from '../data/storeOwner'
import type { RemoteStore } from '../sync/syncEngine'
import type { AccountAnswer, AccountQuestion } from './signInDecision'
import type { Restaurant, Visit } from '../types/models'

// Wrapped, not replaced: every test runs the real functions unless it queues a failure of its own.
vi.mock('../data/storeOwner', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../data/storeOwner')>()
  return {
    ...actual,
    getStoreOwner: vi.fn(actual.getStoreOwner),
    wipeLocalStore: vi.fn(actual.wipeLocalStore),
  }
})

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

/** A FakeRemote whose `listRestaurants` is slowed down, to hold a `fullSync` in flight. */
class DelayedRemote extends FakeRemote {
  delayMs = 0

  async listRestaurants(): Promise<Restaurant[]> {
    if (this.delayMs > 0) await new Promise((resolve) => setTimeout(resolve, this.delayMs))
    return super.listRestaurants()
  }
}

/** A FakeRemote whose `listRestaurants` hangs until `release()`, like a request with no timeout. */
class HangingRemote extends FakeRemote {
  private hanging = true
  private unblock: (() => void) | undefined

  async listRestaurants(): Promise<Restaurant[]> {
    if (this.hanging) await new Promise<void>((resolve) => (this.unblock = resolve))
    return super.listRestaurants()
  }

  release(): void {
    this.hanging = false
    this.unblock?.()
  }
}

/**
 * Lists and pushes as whichever account the global session's token belongs to — as
 * `PocketBaseRemote` does through the shared `pb` client, whatever owner it was built for.
 * `calls` is the account each call actually ran as.
 */
class SessionRoutedRemote implements RemoteStore {
  calls: string[] = []
  private readonly accounts: Record<string, FakeRemote>

  constructor(accounts: Record<string, FakeRemote>) {
    this.accounts = accounts
  }

  private account(): FakeRemote {
    const id = String(pb.authStore.record?.id)
    this.calls.push(id)
    return this.accounts[id]
  }

  listRestaurants() {
    return this.account().listRestaurants()
  }
  listVisits() {
    return this.account().listVisits()
  }
  pushRestaurant(r: Restaurant) {
    return this.account().pushRestaurant(r)
  }
  pushVisit(v: Visit) {
    return this.account().pushVisit(v)
  }
}

/**
 * Refuses another account's id the way PocketBase does (measured: a `400` on create, since the
 * update rule hides the record and the create collides on its id). `ownership` is the server's
 * view, shared by every account's remote; `attempted` is every id this account tried to push.
 */
class OwnerScopedRemote extends FakeRemote {
  attempted: string[] = []
  private readonly owner: string
  private readonly ownership: Map<string, string>

  constructor(owner: string, ownership: Map<string, string>) {
    super()
    this.owner = owner
    this.ownership = ownership
  }

  private claim(id: string): void {
    this.attempted.push(id)
    const holder = this.ownership.get(id)
    if (holder && holder !== this.owner) {
      throw Object.assign(new Error('Failed to create record.'), { status: 400 })
    }
    this.ownership.set(id, this.owner)
  }

  async pushRestaurant(r: Restaurant) {
    this.claim(r.id)
    await super.pushRestaurant(r)
  }
  async pushVisit(v: Visit) {
    this.claim(v.id)
    await super.pushVisit(v)
  }
}

function remoteRestaurant(id: string, name: string): Restaurant {
  return {
    id,
    name,
    lat: 0,
    lng: 0,
    pending: false,
    latestVerdict: null,
    latestVisitDate: null,
    visitCount: 0,
    deleted: false,
    updated: '2026-01-01T00:00:00.000Z',
  }
}

/** A fake `ask` that records every question and answers from a script, in order. */
function scriptedAsk(...answers: AccountAnswer[]) {
  const questions: AccountQuestion[] = []
  const ask = vi.fn(async (question: AccountQuestion) => {
    questions.push(question)
    const answer = answers.shift()
    if (!answer) throw new Error(`unexpected question: ${JSON.stringify(question)}`)
    return answer
  })
  return { ask, questions }
}

async function names(): Promise<string[]> {
  return (await allRestaurants()).map((r) => r.name).sort()
}

let oauthUser = 'u1'
let authWithOAuth2: ReturnType<typeof vi.fn>
/** The window `signInWithGoogle` opens; `window.open` returns it unless a test blocks it. */
let popup: { location: { href: string }; close: ReturnType<typeof vi.fn> }
let service: AuthService | undefined
/** One per realtime subscription opened, in order. */
let unsubscribes: Array<ReturnType<typeof vi.fn>>

/** Stubs the realtime subscription and the OAuth popup, which signs in as `oauthUser`. */
function stubPocketBase(): void {
  unsubscribes = []
  popup = { location: { href: '' }, close: vi.fn() }
  vi.spyOn(window, 'open').mockReturnValue(popup as unknown as Window)
  authWithOAuth2 = vi.fn(async () => fakeSession(oauthUser))
  vi.spyOn(pb, 'collection').mockReturnValue({
    subscribe: vi.fn(async () => {
      const unsubscribe = vi.fn()
      unsubscribes.push(unsubscribe)
      return unsubscribe
    }),
    authWithOAuth2,
  } as unknown as ReturnType<typeof pb.collection>)
}

function serviceWith(remote: RemoteStore): AuthService {
  service = new AuthService(() => remote)
  return service
}

beforeEach(async () => {
  await freshDB()
  pb.authStore.clear()
  oauthUser = 'u1'
  stubPocketBase()
})

afterEach(async () => {
  // Stops the controller and waits for any run in flight, so none outlives its test. The erase
  // refuses a live session, so the session goes first.
  pb.authStore.clear()
  await service?.eraseLocalData()
  service = undefined
  vi.restoreAllMocks()
})

describe('account mode', () => {
  it('works with no account — local reads and writes need no sign-in', async () => {
    expect(auth.isSignedIn).toBe(false)
    await createRestaurant({ name: 'Local only', lat: 1, lng: 1 })
    expect((await allRestaurants()).map((r) => r.name)).toEqual(['Local only'])
  })

  it('resume() is a safe no-op when not signed in (startup calls it unconditionally)', async () => {
    expect(auth.isSignedIn).toBe(false)
    await expect(auth.resume()).resolves.toBeUndefined()
  })
})

describe('signInWithGoogle', () => {
  it('resumes without asking when the store already belongs to this account', async () => {
    await bindStoreOwner('u1')
    const place = await createRestaurant({ name: 'Mine', lat: 1, lng: 1 })
    const remote = new FakeRemote()
    const { ask } = scriptedAsk()

    await serviceWith(remote).signInWithGoogle(ask)

    expect(ask).not.toHaveBeenCalled()
    await vi.waitFor(() => expect(remote.restaurants.map((r) => r.id)).toEqual([place.id]))
  })

  it('binds an empty store without asking, then syncs', async () => {
    const remote = new FakeRemote()
    remote.restaurants.push(remoteRestaurant('remote000001', 'From the account'))
    const { ask } = scriptedAsk()

    await serviceWith(remote).signInWithGoogle(ask)

    expect(ask).not.toHaveBeenCalled()
    expect(await getStoreOwner()).toBe('u1')
    await vi.waitFor(async () => expect(await names()).toEqual(['From the account']))
  })

  describe('places added without an account', () => {
    beforeEach(async () => {
      await createRestaurant({ name: 'One', lat: 1, lng: 1 })
      await createRestaurant({ name: 'Two', lat: 2, lng: 2 })
    })

    it("asks, and 'add' sends both places to the account", async () => {
      const remote = new FakeRemote()
      const { ask, questions } = scriptedAsk('add')

      await serviceWith(remote).signInWithGoogle(ask)

      expect(questions).toEqual([{ kind: 'adopt', count: 2 }])
      expect(await getStoreOwner()).toBe('u1')
      await vi.waitFor(() =>
        expect(remote.restaurants.map((r) => r.name).sort()).toEqual(['One', 'Two']),
      )
    })

    it("'erase' empties the store and binds it", async () => {
      const remote = new FakeRemote()
      const { ask } = scriptedAsk('erase')

      await serviceWith(remote).signInWithGoogle(ask)

      expect(await names()).toEqual([])
      expect(await getStoreOwner()).toBe('u1')
      expect(remote.pushedR).toEqual([])
    })

    it("'cancel' clears the session and keeps the places unbound", async () => {
      const remote = new FakeRemote()
      const { ask } = scriptedAsk('cancel')

      await serviceWith(remote).signInWithGoogle(ask)

      expect(pb.authStore.isValid).toBe(false)
      expect(await names()).toEqual(['One', 'Two'])
      expect(await getStoreOwner()).toBeNull()
      expect(remote.pushedR).toEqual([])
    })
  })

  describe("another account's store", () => {
    beforeEach(async () => {
      await bindStoreOwner('other')
      await createRestaurant({ name: 'Theirs', lat: 1, lng: 1 })
    })

    it("asks to replace it, and 'erase' wipes it before binding", async () => {
      const remote = new FakeRemote()
      const { ask, questions } = scriptedAsk('erase')

      await serviceWith(remote).signInWithGoogle(ask)

      expect(questions).toEqual([{ kind: 'replace', pendingCount: 1 }])
      expect(await names()).toEqual([])
      expect(await getStoreOwner()).toBe('u1')
      expect(remote.pushedR).toEqual([])
    })

    it("'cancel' clears the session and keeps their store and owner", async () => {
      const remote = new FakeRemote()
      const { ask } = scriptedAsk('cancel')

      await serviceWith(remote).signInWithGoogle(ask)

      expect(pb.authStore.isValid).toBe(false)
      expect(await names()).toEqual(['Theirs'])
      expect(await getStoreOwner()).toBe('other')
      expect(remote.pushedR).toEqual([])
    })
  })

  it('leaves the store alone when OAuth rejects', async () => {
    await bindStoreOwner('other')
    await createRestaurant({ name: 'Theirs', lat: 1, lng: 1 })
    authWithOAuth2.mockRejectedValueOnce(new Error('popup closed'))
    const { ask } = scriptedAsk()

    await expect(serviceWith(new FakeRemote()).signInWithGoogle(ask)).rejects.toThrow(
      'popup closed',
    )

    expect(ask).not.toHaveBeenCalled()
    expect(await names()).toEqual(['Theirs'])
    expect(await getStoreOwner()).toBe('other')
  })

  it('ends the session and keeps the store when the question itself fails', async () => {
    await createRestaurant({ name: 'Unbound', lat: 1, lng: 1 })
    const ask = vi.fn(async (): Promise<AccountAnswer> => {
      throw new Error('dialog unmounted')
    })

    await expect(serviceWith(new FakeRemote()).signInWithGoogle(ask)).rejects.toThrow(
      'dialog unmounted',
    )

    expect(pb.authStore.isValid).toBe(false)
    expect(await names()).toEqual(['Unbound'])
    expect(await getStoreOwner()).toBeNull()
  })
})

describe('signInWithGoogle and the OAuth popup', () => {
  it('opens the popup inside the click, before waiting on a run in flight', async () => {
    const remote = new HangingRemote()
    await bindStoreOwner('u1')
    fakeSession('u1')
    const s = serviceWith(remote)
    await s.resume() // its first sync hangs in listRestaurants
    authWithOAuth2.mockImplementation(async (options: { urlCallback?: (url: string) => void }) => {
      options.urlCallback?.('https://accounts.example/auth')
      return fakeSession(oauthUser)
    })

    const signingIn = s.signInWithGoogle(scriptedAsk().ask)

    expect(window.open).toHaveBeenCalledTimes(1)
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(authWithOAuth2).not.toHaveBeenCalled()
    remote.release()
    await signingIn
    expect(authWithOAuth2).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'google', urlCallback: expect.any(Function) }),
    )
    expect(popup.location.href).toBe('https://accounts.example/auth')
  })

  it('closes the popup when OAuth rejects', async () => {
    authWithOAuth2.mockRejectedValueOnce(new Error('popup closed'))

    await expect(serviceWith(new FakeRemote()).signInWithGoogle(scriptedAsk().ask)).rejects.toThrow(
      'popup closed',
    )

    expect(popup.close).toHaveBeenCalled()
  })

  it('closes the popup when a run in flight does not settle, and never starts OAuth', async () => {
    const remote = new HangingRemote()
    await bindStoreOwner('u1')
    fakeSession('u1')
    service = new AuthService(() => remote, 50)
    await service.resume()

    await expect(service.signInWithGoogle(scriptedAsk().ask)).rejects.toThrow('did not settle')

    expect(popup.close).toHaveBeenCalled()
    expect(authWithOAuth2).not.toHaveBeenCalled()
    remote.release()
  })

  it('lets the SDK open its own popup when the browser blocked this one', async () => {
    vi.mocked(window.open).mockReturnValue(null)

    await serviceWith(new FakeRemote()).signInWithGoogle(scriptedAsk().ask)

    expect(authWithOAuth2).toHaveBeenCalledWith({ provider: 'google' })
  })
})

describe('resume', () => {
  it('syncs a store that belongs to this session', async () => {
    await bindStoreOwner('u1')
    const place = await createRestaurant({ name: 'Mine', lat: 1, lng: 1 })
    fakeSession('u1')
    const remote = new FakeRemote()

    await serviceWith(remote).resume()

    await vi.waitFor(() => expect(remote.restaurants.map((r) => r.id)).toEqual([place.id]))
  })

  it('binds an empty ownerless store silently and syncs it', async () => {
    fakeSession('u1')
    const remote = new FakeRemote()
    remote.restaurants.push(remoteRestaurant('remote000001', 'From the account'))

    await serviceWith(remote).resume()

    expect(pb.authStore.isValid).toBe(true)
    expect(await getStoreOwner()).toBe('u1')
    await vi.waitFor(async () => expect(await names()).toEqual(['From the account']))
  })

  it('ends the session over ownerless places instead of adopting them unasked', async () => {
    await createRestaurant({ name: 'Unbound', lat: 1, lng: 1 })
    fakeSession('u1')
    const remote = new FakeRemote()

    await serviceWith(remote).resume()

    expect(pb.authStore.isValid).toBe(false)
    expect(await names()).toEqual(['Unbound'])
    expect(await getStoreOwner()).toBeNull()
    expect(remote.pushedR).toEqual([])
  })

  it('binds a store from before owners (legacy) silently, places and all, and syncs it', async () => {
    await closeDB()
    const v1 = await openDB('tablemarks', 1, {
      upgrade(db) {
        db.createObjectStore('restaurants', { keyPath: 'id' })
        db.createObjectStore('visits', { keyPath: 'id' }).createIndex(
          'by-restaurant',
          'restaurantId',
        )
      },
    })
    await v1.put('restaurants', { ...remoteRestaurant('legacy000001', 'From v1'), pending: true })
    v1.close()
    fakeSession('u1')
    const remote = new FakeRemote()

    await serviceWith(remote).resume()

    expect(pb.authStore.isValid).toBe(true)
    expect(await getStoreOwner()).toBe('u1')
    expect(await isLegacyStore()).toBe(false)
    await vi.waitFor(() => expect(remote.restaurants.map((r) => r.id)).toEqual(['legacy000001']))
  })

  it('ends the session and rethrows when reading the store fails', async () => {
    fakeSession('u1')
    vi.mocked(getStoreOwner).mockRejectedValueOnce(new Error('idb broken'))

    await expect(serviceWith(new FakeRemote()).resume()).rejects.toThrow('idb broken')

    expect(pb.authStore.isValid).toBe(false)
  })

  it('does not double the realtime subscriptions when resumed twice', async () => {
    await bindStoreOwner('u1')
    fakeSession('u1')
    const s = serviceWith(new FakeRemote())
    await s.resume()

    await s.resume()

    await vi.waitFor(() => expect(unsubscribes).toHaveLength(4))
    expect(unsubscribes.filter((u) => u.mock.calls.length === 0)).toHaveLength(2)
  })

  it('does not double the realtime subscriptions when the owner signs in again', async () => {
    await bindStoreOwner('u1')
    fakeSession('u1')
    const s = serviceWith(new FakeRemote())
    await s.resume()

    await s.signInWithGoogle(scriptedAsk().ask)

    await vi.waitFor(() => expect(unsubscribes).toHaveLength(4))
    expect(unsubscribes.filter((u) => u.mock.calls.length === 0)).toHaveLength(2)
  })

  it('ends a session that does not own the store, keeping the store and its owner', async () => {
    await bindStoreOwner('other')
    await createRestaurant({ name: 'Theirs', lat: 1, lng: 1 })
    fakeSession('u1')
    const remote = new FakeRemote()

    await serviceWith(remote).resume()

    expect(pb.authStore.isValid).toBe(false)
    expect(await names()).toEqual(['Theirs'])
    expect(await getStoreOwner()).toBe('other')
    expect(remote.pushedR).toEqual([])
  })
})

describe('signOut', () => {
  /** A signed-in, syncing `u1` whose store is bound to it. */
  async function signedIn(remote: RemoteStore = new FakeRemote()): Promise<AuthService> {
    await bindStoreOwner('u1')
    fakeSession('u1')
    const s = serviceWith(remote)
    await s.resume()
    return s
  }

  it('sends pending changes, then clears the session and erases the store', async () => {
    const remote = new FakeRemote()
    const s = await signedIn(remote)
    const place = await createRestaurant({ name: 'Last one', lat: 1, lng: 1 })
    const { ask } = scriptedAsk()

    await expect(s.signOut(ask)).resolves.toBe('signed-out')

    expect(ask).not.toHaveBeenCalled()
    expect(remote.restaurants.map((r) => r.id)).toEqual([place.id])
    expect(pb.authStore.isValid).toBe(false)
    expect(await names()).toEqual([])
    expect(await getStoreOwner()).toBeNull()
  })

  describe('when the changes cannot be sent', () => {
    beforeEach(() => {
      vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    })

    it("warns of the loss, and 'cancel' keeps the session and the data", async () => {
      const s = await signedIn()
      await createRestaurant({ name: 'One', lat: 1, lng: 1 })
      await createRestaurant({ name: 'Two', lat: 2, lng: 2 })
      const { ask, questions } = scriptedAsk('cancel')

      await expect(s.signOut(ask)).resolves.toBe('cancelled')

      expect(questions).toEqual([{ kind: 'loss', pendingCount: 2 }])
      expect(pb.authStore.isValid).toBe(true)
      expect(await names()).toEqual(['One', 'Two'])
      expect(await getStoreOwner()).toBe('u1')
    })

    it("'sign-out' erases the store anyway", async () => {
      const s = await signedIn()
      await createRestaurant({ name: 'One', lat: 1, lng: 1 })
      await createRestaurant({ name: 'Two', lat: 2, lng: 2 })
      const { ask } = scriptedAsk('sign-out')

      await expect(s.signOut(ask)).resolves.toBe('signed-out')

      expect(pb.authStore.isValid).toBe(false)
      expect(await names()).toEqual([])
      expect(await getStoreOwner()).toBeNull()
    })

    it('waits for a sync already in flight before erasing, so it cannot write back', async () => {
      const remote = new DelayedRemote()
      remote.restaurants.push(remoteRestaurant('remote000001', 'Pulled late'))
      remote.delayMs = 100
      const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
      const s = await signedIn(remote)
      await createRestaurant({ name: 'Unsent', lat: 1, lng: 1 })
      // While the loss question is open the device comes back online: the controller starts a
      // sync whose pull lands after the user has already chosen to sign out.
      const ask = vi.fn(async (): Promise<AccountAnswer> => {
        online.mockReturnValue(true)
        window.dispatchEvent(new Event('online'))
        return 'sign-out'
      })

      await expect(s.signOut(ask)).resolves.toBe('signed-out')

      expect(ask).toHaveBeenCalledWith({ kind: 'loss', pendingCount: 1 })
      expect(await names()).toEqual([])
      // Long after the in-flight pull would have finished, the store is still empty.
      await new Promise((resolve) => setTimeout(resolve, remote.delayMs * 3))
      expect(await names()).toEqual([])
      expect(await getStoreOwner()).toBeNull()
    })
  })

  it('rejects with the session kept when it fails before closing the session', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    const s = await signedIn()
    await createRestaurant({ name: 'Unsent', lat: 1, lng: 1 })
    const ask = vi.fn(async (): Promise<AccountAnswer> => {
      throw new Error('dialog unmounted')
    })

    const failure = s.signOut(ask)
    await expect(failure).rejects.toBeInstanceOf(SignOutIncomplete)
    await expect(failure).rejects.toMatchObject({ sessionCleared: false })

    expect(pb.authStore.isValid).toBe(true)
    expect(await names()).toEqual(['Unsent'])
    expect(await getStoreOwner()).toBe('u1')
  })

  it('reports a failed wipe and keeps the owner; eraseLocalData then empties the store', async () => {
    const s = await signedIn()
    await createRestaurant({ name: 'Stuck', lat: 1, lng: 1 })
    vi.mocked(wipeLocalStore).mockRejectedValueOnce(new Error('disk full'))
    const { ask } = scriptedAsk()

    const failure = s.signOut(ask)
    await expect(failure).rejects.toThrow('disk full')
    await expect(failure).rejects.toMatchObject({ sessionCleared: true })
    await expect(failure).rejects.toBeInstanceOf(SignOutIncomplete)

    expect(pb.authStore.isValid).toBe(false)
    expect(await getStoreOwner()).toBe('u1')
    expect(await names()).toEqual(['Stuck'])

    await s.eraseLocalData()

    expect(await names()).toEqual([])
    expect(await getStoreOwner()).toBeNull()
  })
})

describe('signOut with a run in flight that never settles', () => {
  it('rejects after the bound without erasing; eraseLocalData succeeds once the run ends', async () => {
    const remote = new HangingRemote()
    await bindStoreOwner('u1')
    await createRestaurant({ name: 'Unsent', lat: 1, lng: 1 })
    fakeSession('u1')
    service = new AuthService(() => remote, 100)
    await service.resume() // its first sync hangs in listRestaurants
    const { ask, questions } = scriptedAsk('sign-out')

    const failure = service.signOut(ask)
    await expect(failure).rejects.toThrow('did not settle')
    await expect(failure).rejects.toMatchObject({ sessionCleared: true })

    expect(questions).toEqual([{ kind: 'loss', pendingCount: 1 }])
    expect(pb.authStore.isValid).toBe(false)
    expect(await names()).toEqual(['Unsent'])
    expect(await getStoreOwner()).toBe('u1')

    remote.release()
    await service.eraseLocalData()

    expect(await names()).toEqual([])
    expect(await getStoreOwner()).toBeNull()
  })
})

describe('a session that changes under a running sync (another tab, an expiry)', () => {
  /** A signed-in, syncing `u1` whose first sync has finished. */
  async function syncingAsU1(remote: FakeRemote): Promise<AuthService> {
    await bindStoreOwner('u1')
    fakeSession('u1')
    const s = serviceWith(remote)
    await s.resume()
    await vi.waitFor(async () => expect(await recomputePending()).toBe(0))
    return s
  }

  /** Outlasts the controller's 400 ms local-write debounce, so a live controller would push. */
  async function settle(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 600))
  }

  it('stops syncing when the session switches to another account, and erases nothing', async () => {
    const remote = new FakeRemote()
    await syncingAsU1(remote)
    await createRestaurant({ name: 'Kept', lat: 1, lng: 1 })
    await vi.waitFor(() => expect(remote.pushedR).toHaveLength(1))

    fakeSession('u2')
    await createRestaurant({ name: 'After the switch', lat: 2, lng: 2 })
    await settle()

    expect(remote.pushedR.map((r) => r.name)).toEqual(['Kept'])
    expect(await names()).toEqual(['After the switch', 'Kept'])
    expect(await getStoreOwner()).toBe('u1')
  })

  it('stops syncing when the session becomes invalid', async () => {
    const remote = new FakeRemote()
    await syncingAsU1(remote)

    fakeSession('u1', -60)
    await createRestaurant({ name: 'After the expiry', lat: 1, lng: 1 })
    await settle()

    expect(remote.pushedR).toEqual([])
  })

  it("keeps syncing when the same account's session is saved again (token refresh)", async () => {
    const remote = new FakeRemote()
    await syncingAsU1(remote)

    fakeSession('u1')
    await createRestaurant({ name: 'After the refresh', lat: 1, lng: 1 })

    await vi.waitFor(() => expect(remote.pushedR.map((r) => r.name)).toEqual(['After the refresh']))
  })
})

describe('eraseLocalData', () => {
  it('refuses while signed in, and keeps the store', async () => {
    await bindStoreOwner('u1')
    await createRestaurant({ name: 'Mine', lat: 1, lng: 1 })
    fakeSession('u1')
    const s = serviceWith(new FakeRemote())
    await s.resume()

    await expect(s.eraseLocalData()).rejects.toThrow(/signed in/)

    expect(await names()).toEqual(['Mine'])
    expect(await getStoreOwner()).toBe('u1')
  })
})

describe('endSession', () => {
  it('clears the session and keeps the store and its owner', async () => {
    await bindStoreOwner('u1')
    fakeSession('u1')
    const s = serviceWith(new FakeRemote())
    await s.resume()
    await createRestaurant({ name: 'Kept', lat: 1, lng: 1 })

    s.endSession()

    expect(pb.authStore.isValid).toBe(false)
    expect(await names()).toEqual(['Kept'])
    expect(await getStoreOwner()).toBe('u1')
  })
})

describe('U23: a second account on a device whose first session expired', () => {
  it("asks to replace A's store, pushes nothing of A's to B, and B's sync then succeeds", async () => {
    const ownership = new Map<string, string>()
    const remotes: Record<string, OwnerScopedRemote> = {
      A: new OwnerScopedRemote('A', ownership),
      B: new OwnerScopedRemote('B', ownership),
    }
    service = new AuthService((owner) => remotes[owner])

    // A adds two places without an account, signs in, and adds them to the account.
    await createRestaurant({ name: 'A one', lat: 1, lng: 1 })
    await createRestaurant({ name: 'A two', lat: 2, lng: 2 })
    oauthUser = 'A'
    await service.signInWithGoogle(scriptedAsk('add').ask)
    await vi.waitFor(async () => {
      expect(remotes.A.restaurants).toHaveLength(2)
      expect(await recomputePending()).toBe(0)
    })

    // A's session expires — no sign-out, so no wipe — and A keeps adding places.
    service.endSession()
    await createRestaurant({ name: 'A unsent', lat: 3, lng: 3 })
    const aIds = (await allRestaurants()).map((r) => r.id)

    // B signs in on the same device.
    oauthUser = 'B'
    const b = scriptedAsk('erase')
    await service.signInWithGoogle(b.ask)

    expect(b.questions).toEqual([{ kind: 'replace', pendingCount: 1 }])
    expect(await getStoreOwner()).toBe('B')

    // B's sync works: a new place reaches B's account, and signing out needs no loss warning.
    const bPlace = await createRestaurant({ name: 'B one', lat: 4, lng: 4 })
    const out = scriptedAsk()
    await expect(service.signOut(out.ask)).resolves.toBe('signed-out')

    expect(out.ask).not.toHaveBeenCalled()
    expect(remotes.B.restaurants.map((r) => r.id)).toEqual([bPlace.id])
    expect(remotes.B.attempted.filter((id) => aIds.includes(id))).toEqual([])
  })
})

describe('U23: a session that expires in the tab, with nobody ending it', () => {
  it("never syncs A's controller with B's token while B is being asked", async () => {
    const accounts = { A: new FakeRemote(), B: new FakeRemote() }
    accounts.B.restaurants.push(remoteRestaurant('remoteB00001', 'B remote'))
    const remote = new SessionRoutedRemote(accounts)
    service = new AuthService(() => remote)
    await bindStoreOwner('A')
    await createRestaurant({ name: 'A one', lat: 1, lng: 1 })
    fakeSession('A')
    await service.resume()
    await vi.waitFor(async () => {
      expect(accounts.A.restaurants).toHaveLength(1)
      expect(await recomputePending()).toBe(0)
    })

    // A's token expires while the tab is open: nothing calls endSession, the controller runs on.
    fakeSession('A', -60)
    expect(pb.authStore.isValid).toBe(false)
    const asALeftIt = await allRestaurants()

    // B signs in. While the question is open, a trigger reaches the controller.
    oauthUser = 'B'
    let callsAsB: string[] = []
    let duringAsk: string[] = []
    const ask = vi.fn(async (): Promise<AccountAnswer> => {
      window.dispatchEvent(new Event('online'))
      await new Promise((resolve) => setTimeout(resolve, 50))
      callsAsB = remote.calls.filter((id) => id === 'B')
      duringAsk = await names()
      return 'cancel'
    })
    await service.signInWithGoogle(ask)

    expect(ask).toHaveBeenCalledWith({ kind: 'replace', pendingCount: 0 })
    expect(callsAsB).toEqual([])
    expect(duringAsk).toEqual(['A one'])
    expect(accounts.B.pushedR).toEqual([])
    expect(await allRestaurants()).toEqual(asALeftIt)
    expect(await getStoreOwner()).toBe('A')
    expect(pb.authStore.isValid).toBe(false)
  })
})
