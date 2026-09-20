import { renderHook } from '@testing-library/react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { useAuth } from './useAuth'
import { auth } from './auth'
import { pb } from '../sync/pocketbase'

vi.mock('./auth', () => ({
  auth: {
    user: null,
    isSignedIn: false,
    onChange: vi.fn(() => () => {}),
    signInWithGoogle: vi.fn(),
    signOut: vi.fn(),
  },
}))

const mockAuth = vi.mocked(auth, { deep: true }) as unknown as {
  user: Record<string, unknown> | null
  isSignedIn: boolean
  onChange: (cb: () => void) => () => void
  signInWithGoogle: () => Promise<void>
  signOut: () => void
}

afterEach(() => {
  mockAuth.user = null
  mockAuth.isSignedIn = false
})

describe('useAuth avatarUrl (U1)', () => {
  it('builds a URL via pb.files.getURL when the signed-in user has an avatar set', () => {
    mockAuth.isSignedIn = true
    mockAuth.user = {
      id: 'user1',
      collectionId: 'users',
      collectionName: 'users',
      avatar: 'photo.jpg',
    }

    const { result } = renderHook(() => useAuth())

    expect(result.current.avatarUrl).toBe(pb.files.getURL(mockAuth.user as never, 'photo.jpg'))
    expect(result.current.avatarUrl).toContain('photo.jpg')
  })

  it('is null when the signed-in user has no avatar set', () => {
    mockAuth.isSignedIn = true
    mockAuth.user = { id: 'user1', collectionId: 'users', collectionName: 'users', avatar: '' }

    const { result } = renderHook(() => useAuth())

    expect(result.current.avatarUrl).toBeNull()
  })

  it('is null when signed out, mirroring email', () => {
    mockAuth.isSignedIn = false
    mockAuth.user = null

    const { result } = renderHook(() => useAuth())

    expect(result.current.avatarUrl).toBeNull()
    expect(result.current.email).toBeNull()
  })
})
