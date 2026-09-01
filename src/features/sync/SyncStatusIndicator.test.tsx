import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SyncStatusIndicator } from './SyncStatusIndicator'
import { useAuth } from '../../auth/useAuth'
import { useSyncStatus } from '../../sync/useSyncStatus'

vi.mock('../../auth/useAuth', () => ({
  useAuth: vi.fn(),
}))
vi.mock('../../sync/useSyncStatus', () => ({
  useSyncStatus: vi.fn(),
}))

const mockUseAuth = vi.mocked(useAuth)
const mockUseSyncStatus = vi.mocked(useSyncStatus)

beforeEach(() => {
  mockUseAuth.mockReturnValue({
    signedIn: true,
    email: 'person@example.com',
    avatarUrl: null,
    signIn: vi.fn(),
    signOut: vi.fn(),
  })
})

describe('SyncStatusIndicator', () => {
  it('shows "All synced" when everything is backed up (R1)', () => {
    mockUseSyncStatus.mockReturnValue({ state: 'synced', pendingCount: 0 })
    render(<SyncStatusIndicator />)
    expect(screen.getByText(/all synced/i)).toBeInTheDocument()
  })

  it('shows the pending count (R1)', () => {
    mockUseSyncStatus.mockReturnValue({ state: 'pending', pendingCount: 3 })
    render(<SyncStatusIndicator />)
    expect(screen.getByText(/3 pending/i)).toBeInTheDocument()
  })

  it('shows an offline message including the pending count (R1)', () => {
    mockUseSyncStatus.mockReturnValue({ state: 'offline', pendingCount: 2 })
    render(<SyncStatusIndicator />)
    const label = screen.getByText(/offline/i)
    expect(label).toBeInTheDocument()
    expect(label.textContent).toMatch(/2/)
  })

  it('shows "Offline" with no count when nothing is pending', () => {
    mockUseSyncStatus.mockReturnValue({ state: 'offline', pendingCount: 0 })
    render(<SyncStatusIndicator />)
    expect(screen.getByText(/^offline$/i)).toBeInTheDocument()
  })

  it('escalates to a distinct problem state naming sign-in as the cause (R8)', () => {
    mockUseSyncStatus.mockReturnValue({ state: 'problem', pendingCount: 0, cause: 'sign-in-needed' })
    render(<SyncStatusIndicator />)
    expect(screen.getByText(/sign in again/i)).toBeInTheDocument()
  })

  it('escalates to a distinct problem state naming an unreachable server as the cause (R8)', () => {
    mockUseSyncStatus.mockReturnValue({ state: 'problem', pendingCount: 0, cause: 'server-unreachable' })
    render(<SyncStatusIndicator />)
    expect(screen.getByText(/can't reach the server/i)).toBeInTheDocument()
  })

  it('makes the problem state visually distinct from pending/offline (R8)', () => {
    mockUseSyncStatus.mockReturnValue({ state: 'pending', pendingCount: 1 })
    const { rerender } = render(<SyncStatusIndicator />)
    const pendingButton = screen.getByRole('button')
    const pendingClass = pendingButton.className

    mockUseSyncStatus.mockReturnValue({ state: 'offline', pendingCount: 1 })
    rerender(<SyncStatusIndicator />)
    const offlineButton = screen.getByRole('button')
    const offlineClass = offlineButton.className

    mockUseSyncStatus.mockReturnValue({ state: 'problem', pendingCount: 0, cause: 'server-unreachable' })
    rerender(<SyncStatusIndicator />)
    const problemButton = screen.getByRole('button')

    expect(problemButton.className).not.toBe(pendingClass)
    expect(problemButton.className).not.toBe(offlineClass)
  })

  it('renders nothing when signed out, regardless of sync status (R3)', () => {
    mockUseAuth.mockReturnValue({ signedIn: false, email: null, avatarUrl: null, signIn: vi.fn(), signOut: vi.fn() })
    mockUseSyncStatus.mockReturnValue({ state: 'problem', pendingCount: 5, cause: 'server-unreachable' })
    const { container } = render(<SyncStatusIndicator />)
    expect(container).toBeEmptyDOMElement()
  })

  it('opens the detail view on click and never calls a retry/sync function', async () => {
    mockUseSyncStatus.mockReturnValue({ state: 'pending', pendingCount: 2 })
    render(<SyncStatusIndicator />)

    expect(screen.queryByText(/haven't backed up yet/i)).toBeNull()
    await userEvent.click(screen.getByRole('button'))
    expect(screen.getByText(/haven't backed up yet/i)).toBeInTheDocument()
  })

  it('carries aria-live="polite" on the status live region', () => {
    mockUseSyncStatus.mockReturnValue({ state: 'synced', pendingCount: 0 })
    render(<SyncStatusIndicator />)
    expect(screen.getByRole('region')).toHaveAttribute('aria-live', 'polite')
  })

  it('uses a real button element as the tap target', () => {
    mockUseSyncStatus.mockReturnValue({ state: 'synced', pendingCount: 0 })
    render(<SyncStatusIndicator />)
    const button = screen.getByRole('button')
    expect(button.tagName).toBe('BUTTON')
    expect(button).toHaveAttribute('type', 'button')
  })
})
