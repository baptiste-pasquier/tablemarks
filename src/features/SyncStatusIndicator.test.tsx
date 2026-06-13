import { render, screen } from '@testing-library/react'
import { beforeEach, describe, it, expect, vi } from 'vitest'
import { SyncStatusIndicator } from './SyncStatusIndicator'
import type { SyncState } from '../sync/syncStatus'

const h = vi.hoisted(() => ({
  signedIn: true,
  state: { status: 'synced', pending: 0, cause: null } as SyncState,
}))

vi.mock('../auth/useAuth', () => ({ useAuth: () => ({ signedIn: h.signedIn, email: 'x@y.z', signIn: vi.fn(), signOut: vi.fn() }) }))
vi.mock('../auth/useSyncStatus', () => ({ useSyncStatus: () => h.state }))

beforeEach(() => {
  h.signedIn = true
  h.state = { status: 'synced', pending: 0, cause: null }
})

describe('SyncStatusIndicator', () => {
  it('renders nothing when signed out', () => {
    h.signedIn = false
    const { container } = render(<SyncStatusIndicator />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows "All synced" when synced', () => {
    h.state = { status: 'synced', pending: 0, cause: null }
    render(<SyncStatusIndicator />)
    expect(screen.getByText(/all synced/i)).toBeInTheDocument()
  })

  it('shows the pending count', () => {
    h.state = { status: 'pending', pending: 3, cause: null }
    render(<SyncStatusIndicator />)
    expect(screen.getByText(/3 pending/i)).toBeInTheDocument()
  })

  it('shows Offline', () => {
    h.state = { status: 'offline', pending: 2, cause: null }
    render(<SyncStatusIndicator />)
    expect(screen.getByText(/offline/i)).toBeInTheDocument()
  })

  it('names the cause in the problem state — auth (AE4)', () => {
    h.state = { status: 'problem', pending: 1, cause: 'auth' }
    render(<SyncStatusIndicator />)
    expect(screen.getByText(/sign in/i)).toBeInTheDocument()
  })

  it('names the cause in the problem state — server', () => {
    h.state = { status: 'problem', pending: 1, cause: 'server' }
    render(<SyncStatusIndicator />)
    expect(screen.getByText(/can.t reach the cloud/i)).toBeInTheDocument()
  })

  it('is informational only — no interactive control (manual sync-now is deferred)', () => {
    h.state = { status: 'problem', pending: 1, cause: 'auth' }
    render(<SyncStatusIndicator />)
    expect(screen.queryByRole('button')).toBeNull()
  })
})
