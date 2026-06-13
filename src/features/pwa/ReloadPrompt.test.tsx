import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, it, expect, vi } from 'vitest'
import { ReloadPrompt } from './ReloadPrompt'

// The service worker can't run under jsdom; mock the registration hook. The mock is stateful —
// the setters are real React setState, so dismissing actually re-renders and the banner disappears.
const h = vi.hoisted(() => ({
  needRefresh: false,
  offlineReady: false,
  updateServiceWorker: vi.fn(() => Promise.resolve()),
}))

vi.mock('virtual:pwa-register/react', async () => {
  const React = await import('react')
  return {
    useRegisterSW: () => {
      const [needRefresh, setNeedRefresh] = React.useState(h.needRefresh)
      const [offlineReady, setOfflineReady] = React.useState(h.offlineReady)
      return {
        needRefresh: [needRefresh, setNeedRefresh],
        offlineReady: [offlineReady, setOfflineReady],
        updateServiceWorker: h.updateServiceWorker,
      }
    },
  }
})

beforeEach(() => {
  h.needRefresh = false
  h.offlineReady = false
  vi.clearAllMocks()
  h.updateServiceWorker.mockImplementation(() => Promise.resolve())
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

  it('does not fire a second update when Reload is double-clicked', async () => {
    h.needRefresh = true
    render(<ReloadPrompt />)

    const reload = screen.getByRole('button', { name: /reload/i })
    await userEvent.click(reload)
    await userEvent.click(reload)

    expect(h.updateServiceWorker).toHaveBeenCalledTimes(1)
  })

  it('dismisses the update banner without triggering an update', async () => {
    h.needRefresh = true
    render(<ReloadPrompt />)

    expect(screen.getByRole('region', { name: /app update/i })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /dismiss/i }))

    expect(screen.queryByRole('region', { name: /app update/i })).toBeNull()
    expect(h.updateServiceWorker).not.toHaveBeenCalled()
  })

  it('shows a dismissible offline-ready note with no reload action', async () => {
    h.offlineReady = true
    render(<ReloadPrompt />)

    expect(screen.getByText(/offline/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /reload/i })).toBeNull()

    await userEvent.click(screen.getByRole('button', { name: /dismiss/i }))
    expect(screen.queryByText(/offline/i)).toBeNull()
  })
})
