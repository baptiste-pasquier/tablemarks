import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { SyncStatusIndicator } from './SyncStatusIndicator'
import type { SyncState } from '../sync/syncEngine'

describe('SyncStatusIndicator', () => {
  it('renders "All synced" when status is synced', () => {
    render(<SyncStatusIndicator state={{ status: 'synced', pending: 0 }} />)
    expect(screen.getByText('All synced')).toBeInTheDocument()
  })

  it('renders the pending count when status is pending', () => {
    render(<SyncStatusIndicator state={{ status: 'pending', pending: 3 }} />)
    expect(screen.getByText('3 pending')).toBeInTheDocument()
  })

  it('renders "Offline" when status is offline', () => {
    render(<SyncStatusIndicator state={{ status: 'offline', pending: 2 }} />)
    expect(screen.getByText('Offline')).toBeInTheDocument()
  })

  it('AE4: renders auth problem message distinct from pending', () => {
    const state: SyncState = { status: 'problem', pending: 1, cause: 'auth' }
    render(<SyncStatusIndicator state={state} />)
    expect(screen.getByText('Sign in again to keep syncing')).toBeInTheDocument()
    expect(screen.queryByText(/pending/)).toBeNull()
  })

  it('AE4: renders server problem message', () => {
    const state: SyncState = { status: 'problem', pending: 0, cause: 'server' }
    render(<SyncStatusIndicator state={state} />)
    expect(screen.getByText("Can't reach the cloud")).toBeInTheDocument()
  })

  it('renders nothing when signed out (null state)', () => {
    const { container } = render(<SyncStatusIndicator state={null} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('R3: is not interactive — no button or click handler', () => {
    render(<SyncStatusIndicator state={{ status: 'synced', pending: 0 }} />)
    expect(screen.queryByRole('button')).toBeNull()
  })
})
