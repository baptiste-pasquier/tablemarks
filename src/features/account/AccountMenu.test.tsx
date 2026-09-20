import { render, screen, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AccountMenu } from './AccountMenu'
import { useSyncStatus } from '../../sync/useSyncStatus'
import type { SyncStatus } from '../../sync/syncStatus'

vi.mock('../../sync/useSyncStatus', () => ({
  useSyncStatus: vi.fn(),
}))

const mockUseSyncStatus = vi.mocked(useSyncStatus)

function setStatus(status: SyncStatus) {
  mockUseSyncStatus.mockReturnValue(status)
}

async function openMenu() {
  const user = userEvent.setup()
  render(
    <AccountMenu
      email="person@example.com"
      avatarUrl={null}
      onOpenSettings={vi.fn()}
      onSignOut={vi.fn()}
    />,
  )
  await user.click(screen.getByRole('button', { name: /account menu/i }))
  return user
}

beforeEach(() => {
  setStatus({ state: 'synced', pendingCount: 0 })
})

describe('AccountMenu (U3)', () => {
  it('shows the avatar trigger with an initial-letter fallback when no avatarUrl is set (R3, AE4)', () => {
    render(
      <AccountMenu
        email="person@example.com"
        avatarUrl={null}
        onOpenSettings={vi.fn()}
        onSignOut={vi.fn()}
      />,
    )
    expect(screen.getByText('P')).toBeInTheDocument()
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })

  it('shows the avatar photo when avatarUrl is set', () => {
    const { container } = render(
      <AccountMenu
        email="person@example.com"
        avatarUrl="https://example.com/avatar.jpg"
        onOpenSettings={vi.fn()}
        onSignOut={vi.fn()}
      />,
    )
    // Decorative (alt="") since the button already carries the accessible name — queried by tag.
    expect(container.querySelector('img')).toHaveAttribute('src', 'https://example.com/avatar.jpg')
  })

  it('falls back to the initial letter when the avatar image fails to load (KTD4)', () => {
    const { container } = render(
      <AccountMenu
        email="person@example.com"
        avatarUrl="https://example.com/broken.jpg"
        onOpenSettings={vi.fn()}
        onSignOut={vi.fn()}
      />,
    )
    const img = container.querySelector('img')
    act(() => {
      img?.dispatchEvent(new Event('error'))
    })
    expect(screen.getByText('P')).toBeInTheDocument()
  })

  it('opens the dropdown on click, in order: email, status chip, detail, Réglages, Se déconnecter (R4, AE3)', async () => {
    setStatus({ state: 'problem', pendingCount: 0, cause: 'sign-in-needed' })
    await openMenu()

    const menu = screen.getByRole('menu')
    const text = menu.textContent ?? ''
    const emailIndex = text.indexOf('person@example.com')
    const labelIndex = text.indexOf('Sign in again to keep backing up')
    const detailIndex = text.indexOf('Your sign-in expired')
    const settingsIndex = text.indexOf('Settings')
    const signOutIndex = text.indexOf('Sign out')

    expect(emailIndex).toBeGreaterThanOrEqual(0)
    expect(labelIndex).toBeGreaterThan(emailIndex)
    expect(detailIndex).toBeGreaterThan(labelIndex)
    expect(settingsIndex).toBeGreaterThan(detailIndex)
    expect(signOutIndex).toBeGreaterThan(settingsIndex)
  })

  it('clicking Réglages calls onOpenSettings and closes the dropdown (AE2/R4)', async () => {
    const onOpenSettings = vi.fn()
    const user = userEvent.setup()
    render(
      <AccountMenu
        email="person@example.com"
        avatarUrl={null}
        onOpenSettings={onOpenSettings}
        onSignOut={vi.fn()}
      />,
    )
    await user.click(screen.getByRole('button', { name: /account menu/i }))
    await user.click(screen.getByRole('menuitem', { name: /settings/i }))

    expect(onOpenSettings).toHaveBeenCalled()
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('clicking Se déconnecter calls onSignOut and closes the dropdown', async () => {
    const onSignOut = vi.fn()
    const user = userEvent.setup()
    render(
      <AccountMenu
        email="person@example.com"
        avatarUrl={null}
        onOpenSettings={vi.fn()}
        onSignOut={onSignOut}
      />,
    )
    await user.click(screen.getByRole('button', { name: /account menu/i }))
    await user.click(screen.getByRole('menuitem', { name: /sign out/i }))

    expect(onSignOut).toHaveBeenCalled()
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('closes on outside click and returns focus to the trigger (KTD2, KTD3)', async () => {
    const user = await openMenu()
    expect(screen.getByRole('menu')).toBeInTheDocument()

    await user.click(document.body)

    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('button', { name: /account menu/i })).toHaveFocus())
  })

  it('does not close when clicking inside the dropdown panel', async () => {
    const user = await openMenu()
    await user.click(screen.getByText('person@example.com'))
    expect(screen.getByRole('menu')).toBeInTheDocument()
  })

  it('closes on the avatar trigger click without flicker (KTD2 outside-ref exclusion)', async () => {
    const user = await openMenu()
    await user.click(screen.getByRole('button', { name: /account menu/i }))
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('closes on Escape and returns focus to the trigger', async () => {
    const user = await openMenu()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('button', { name: /account menu/i })).toHaveFocus())
  })

  it('updates the badge and chip without closing when sync state changes while open', async () => {
    const user = userEvent.setup()
    const { rerender } = render(
      <AccountMenu
        email="person@example.com"
        avatarUrl={null}
        onOpenSettings={vi.fn()}
        onSignOut={vi.fn()}
      />,
    )
    await user.click(screen.getByRole('button', { name: /account menu/i }))
    expect(screen.getByText(/all synced/i)).toBeInTheDocument()

    setStatus({ state: 'pending', pendingCount: 2 })
    rerender(
      <AccountMenu
        email="person@example.com"
        avatarUrl={null}
        onOpenSettings={vi.fn()}
        onSignOut={vi.fn()}
      />,
    )

    expect(screen.getByRole('menu')).toBeInTheDocument()
    expect(screen.getByText(/2 pending/i)).toBeInTheDocument()
  })

  it('exposes menu ARIA semantics: aria-haspopup/aria-expanded on the trigger, role=menu on the panel, role=menuitem on the rows (KTD8)', async () => {
    const user = await openMenu()
    const trigger = screen.getByRole('button', { name: /account menu/i })
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu')
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('menu')).toBeInTheDocument()
    expect(screen.getAllByRole('menuitem')).toHaveLength(2)
    void user
  })

  it('traps Tab within the panel, wrapping last back to first and first back to last', async () => {
    const user = await openMenu()
    const settings = screen.getByRole('menuitem', { name: /settings/i })
    const signOut = screen.getByRole('menuitem', { name: /sign out/i })

    signOut.focus()
    await user.tab()
    expect(document.activeElement).toBe(settings)

    settings.focus()
    await user.tab({ shift: true })
    expect(document.activeElement).toBe(signOut)
  })

  it('does not push the header layout height when opened (fcebe71 overflow regression guard)', async () => {
    const { container } = render(
      <AccountMenu
        email="person@example.com"
        avatarUrl={null}
        onOpenSettings={vi.fn()}
        onSignOut={vi.fn()}
      />,
    )
    const heightBefore = container.firstElementChild?.getBoundingClientRect().height
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /account menu/i }))
    const heightAfter = container.firstElementChild?.getBoundingClientRect().height
    expect(heightAfter).toBe(heightBefore)
  })

  it('recomputes the anchored position on resize and stays within the viewport (KTD7)', async () => {
    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 320 })
    await openMenu()
    const menu = screen.getByRole('menu')
    const rightBefore = menu.style.right

    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 500 })
    act(() => {
      window.dispatchEvent(new Event('resize'))
    })

    // rAF-coalesced: wait for the scheduled frame to actually recompute the position.
    await waitFor(() => expect(menu.style.right).not.toBe(rightBefore))
    // right = window.innerWidth - rect.right; the trigger didn't move, so a wider viewport
    // must increase `right`.
    expect(Number.parseFloat(menu.style.right)).toBeGreaterThan(Number.parseFloat(rightBefore))
  })
})
