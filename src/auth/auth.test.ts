import { beforeEach, describe, it, expect, vi, afterEach } from 'vitest'
import { freshDB } from '../test/idb'
import { auth } from './auth'
import { pb } from '../sync/pocketbase'
import { createRestaurant, allRestaurants } from '../data/restaurants'

beforeEach(freshDB)
afterEach(() => vi.restoreAllMocks())

describe('account mode', () => {
  it('works with no account — local reads and writes need no sign-in', async () => {
    expect(auth.isSignedIn).toBe(false)
    await createRestaurant({ name: 'Local only', lat: 1, lng: 1 })
    expect((await allRestaurants()).map((r) => r.name)).toEqual(['Local only'])
  })

  it('retains local data and clears auth on sign-out', async () => {
    await createRestaurant({ name: 'Keep me', lat: 1, lng: 1 })
    const clear = vi.spyOn(pb.authStore, 'clear')

    auth.signOut()

    expect(clear).toHaveBeenCalled()
    expect((await allRestaurants()).map((r) => r.name)).toEqual(['Keep me'])
  })
})
