import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, it, expect, vi } from 'vitest'
import { ReloadPrompt } from './ReloadPrompt'

// The service worker can't run under jsdom; mock the registration hook and drive its state.
const h = vi.hoisted(() => ({
  needRefresh: false,
  offlineReady: false,
  setNeedRefresh: vi.fn(),
  setOfflineReady: vi.fn(),
  updateServiceWorker: vi.fn(),
}))

vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: () => ({
    needRefresh: [h.needRefresh, h.setNeedRefresh],
    offlineReady: [h.offlineReady, h.setOfflineReady],
    updateServiceWorker: h.updateServiceWorker,
  }),
}))

beforeEach(() => {
  h.needRefresh = false
  h.offlineReady = false
  vi.clearAllMocks()
})

describe('ReloadPrompt', () => {
  it('renders nothing when there is no update and the app is not newly offline-ready', () => {
    const { container } = render(<ReloadPrompt />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows the update banner and reloads on click when a new version is waiting (R11)', async () => {
    h.needRefresh = true
    render(<ReloadPrompt />)

    expect(screen.getByText(/new version/i)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /reload/i }))

    expect(h.updateServiceWorker).toHaveBeenCalledTimes(1)
    expect(h.updateServiceWorker).toHaveBeenCalledWith(true)
  })

  it('shows an offline-ready note that can be dismissed without triggering an update', async () => {
    h.offlineReady = true
    render(<ReloadPrompt />)

    expect(screen.getByText(/offline/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /reload/i })).toBeNull()

    await userEvent.click(screen.getByRole('button', { name: /dismiss/i }))
    expect(h.setOfflineReady).toHaveBeenCalledWith(false)
    expect(h.updateServiceWorker).not.toHaveBeenCalled()
  })
})
